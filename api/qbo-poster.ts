/**
 * QBO POSTER — review-gated bill/expense posting (Markie 2026-06-25).
 * =============================================================================
 * "I need her to work." Figs PROPOSES coding into the Ask Markie queue; when
 * Markie APPROVES a finding, this posts it to QuickBooks via the API. This is the
 * last mile that turns a proposal into a posted transaction — but it NEVER posts
 * on its own: it only fires on an explicit human approval (the golden rule).
 *
 * SAFETY (layered, all must pass before anything posts):
 *   1. Master flag FIGGY_QBO_POST must be "on" (OFF by default → ships dormant;
 *      flip it only after the first live post is verified together).
 *   2. The client's realm must pass isRealmPostEnabled (all clients by default;
 *      optionally restricted via FIGGY_POST_REALMS).
 *   3. The connection must be NATIVE + active (the read-only Make webhook proxy
 *      can't write — we refuse to post through it).
 *   4. The payload must validate (vendor, ≥1 line, account per line, amounts > 0).
 * Any miss → skip with a clear reason; the approve never breaks.
 *
 * The pure payload builder + validator are unit-tested; the I/O wrapper does the
 * connection + POST. Nothing here guesses a vendor or an account — those IDs come
 * resolved on the finding (from the brain), or it skips.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { qboConnections, triageFindings, clients } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { qboRequest, ensureValidToken } from "./qbo-router";
import { recordAudit } from "./agent-audit";

/** Owner userId for a client (so the QBO post lands in that owner's audit log). */
async function ownerForClient(clientId: number): Promise<number> {
  try {
    const r = await getDb().select({ u: clients.userId }).from(clients).where(eq(clients.id, clientId)).limit(1);
    return r[0]?.u ?? 0;
  } catch { return 0; }
}

/** The realms we verified posting on FIRST (Alderson, Ovita Construction, Ovita
 *  Holdings). Kept for reference / as the recommended pilot set. */
export const PILOT_REALMS = new Set<string>([
  "9341454721167426", // Alderson Developments Ltd
  "193514344934582",  // Ovita Construction Ltd
  "193514710535449",  // Ovita Holdings Inc
]);

/**
 * Posting now covers ALL clients (Markie wants it firm-wide). The real gate is
 * the master flag below; per-realm scope is OPTIONAL via FIGGY_POST_REALMS (a
 * comma-separated realm list) if you ever want to restrict it again. Unset =
 * every client with a native write connection is eligible.
 */
export function isRealmPostEnabled(realmId: string): boolean {
  const restrict = (process.env.FIGGY_POST_REALMS || "").trim();
  if (!restrict) return true; // all clients
  return restrict.split(/[,\s]+/).filter(Boolean).includes(String(realmId));
}

export function postingMasterEnabled(): boolean {
  return process.env.FIGGY_QBO_POST === "on";
}

export type BillLine = {
  accountId: string;
  amount: number;          // amount coded to this account (pre-tax subtotal)
  taxCodeId?: string | null;
  description?: string | null;
};

export type BillInput = {
  vendorId: string;
  txnDate?: string | null;   // ISO yyyy-mm-dd
  docNumber?: string | null; // invoice #
  lines: BillLine[];
  privateNote?: string | null;
};

/** Build the QBO Bill JSON from a resolved input. Pure — no I/O. */
export function buildBillPayload(input: BillInput): Record<string, unknown> {
  const Line = input.lines.map((l) => {
    const detail: Record<string, unknown> = { AccountRef: { value: String(l.accountId) } };
    if (l.taxCodeId) detail.TaxCodeRef = { value: String(l.taxCodeId) };
    return {
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: round2(l.amount),
      ...(l.description ? { Description: String(l.description).slice(0, 1000) } : {}),
      AccountBasedExpenseLineDetail: detail,
    };
  });
  const payload: Record<string, unknown> = {
    VendorRef: { value: String(input.vendorId) },
    Line,
  };
  if (input.txnDate) payload.TxnDate = input.txnDate;
  if (input.docNumber) payload.DocNumber = String(input.docNumber).slice(0, 21); // QBO caps DocNumber at 21
  if (input.privateNote) payload.PrivateNote = String(input.privateNote).slice(0, 4000);
  return payload;
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ───────────────────────────────────────────────────────────────────────────
// JOURNAL ENTRIES (general + intercompany). A JE is N lines, each a Debit or a
// Credit to an account; total debits MUST equal total credits. Intercompany is
// just a JE that touches a due-to/due-from account on each side.
// ───────────────────────────────────────────────────────────────────────────
export type JournalLine = {
  accountId: string;
  posting: "Debit" | "Credit";
  amount: number;
  description?: string | null;
  /** Optional name (customer/vendor/employee) ref for the line, if needed. */
  entityId?: string | null;
  entityType?: "Customer" | "Vendor" | "Employee" | null;
};

export type JournalInput = {
  txnDate?: string | null;
  docNumber?: string | null;
  privateNote?: string | null;
  lines: JournalLine[];
};

/** Build a QBO JournalEntry payload. Pure. */
export function buildJournalEntryPayload(input: JournalInput): Record<string, unknown> {
  const Line = input.lines.map((l) => {
    const detail: Record<string, unknown> = {
      PostingType: l.posting,
      AccountRef: { value: String(l.accountId) },
    };
    if (l.entityId && l.entityType) {
      detail.Entity = { Type: l.entityType, EntityRef: { value: String(l.entityId) } };
    }
    return {
      DetailType: "JournalEntryLineDetail",
      Amount: round2(l.amount),
      ...(l.description ? { Description: String(l.description).slice(0, 1000) } : {}),
      JournalEntryLineDetail: detail,
    };
  });
  const payload: Record<string, unknown> = { Line };
  if (input.txnDate) payload.TxnDate = input.txnDate;
  if (input.docNumber) payload.DocNumber = String(input.docNumber).slice(0, 21);
  if (input.privateNote) payload.PrivateNote = String(input.privateNote).slice(0, 4000);
  return payload;
}

/** Debits must equal credits (to the penny), every line needs an account + amount. */
export function validateJournalEntry(input: Partial<JournalInput> | null | undefined): Validation {
  if (!input || !input.lines || input.lines.length < 2) return { ok: false, reason: "a journal entry needs at least 2 lines" };
  let debit = 0, credit = 0;
  for (const l of input.lines) {
    if (!l.accountId) return { ok: false, reason: "a line has no QBO account (accountId)" };
    if (!(Number(l.amount) > 0)) return { ok: false, reason: "a line amount is not > 0" };
    if (l.posting !== "Debit" && l.posting !== "Credit") return { ok: false, reason: "a line is neither Debit nor Credit" };
    if (l.posting === "Debit") debit = round2(debit + Number(l.amount));
    else credit = round2(credit + Number(l.amount));
  }
  if (round2(debit - credit) !== 0) return { ok: false, reason: `debits (${debit}) do not equal credits (${credit})` };
  return { ok: true };
}

export type Validation = { ok: true } | { ok: false; reason: string };

/** Gatekeeper: refuse to post anything incomplete. */
export function validatePostable(input: Partial<BillInput> | null | undefined): Validation {
  if (!input) return { ok: false, reason: "no input" };
  if (!input.vendorId) return { ok: false, reason: "no resolved QBO vendor (vendorId) on the finding" };
  if (!input.lines || input.lines.length === 0) return { ok: false, reason: "no posting lines" };
  for (const l of input.lines) {
    if (!l.accountId) return { ok: false, reason: "a line has no QBO account (accountId)" };
    if (!(Number(l.amount) > 0)) return { ok: false, reason: "a line amount is not > 0" };
  }
  return { ok: true };
}

/** Read the posting input off a finding's sourceData JSON. Supports either an
 *  explicit `lines` array or a single vendor/amount/account shape. Returns null
 *  if the finding clearly isn't a postable transaction. */
export function billInputFromSourceData(sourceData: string | null | undefined): BillInput | null {
  let meta: any;
  try { meta = JSON.parse(sourceData || "{}"); } catch { return null; }
  if (!meta || typeof meta !== "object") return null;
  const vendorId = meta.vendorId || meta.qboVendorId || meta.resolvedVendorId;
  if (!vendorId) return null;
  const txnDate = meta.txnDate || meta.date || null;
  const docNumber = meta.invoiceNumber || meta.docNumber || null;
  let lines: BillLine[] = [];
  if (Array.isArray(meta.lines) && meta.lines.length) {
    lines = meta.lines.map((l: any) => ({
      accountId: l.accountId || l.suggestedAccountId,
      amount: Number(l.amount ?? l.subtotal ?? l.total),
      taxCodeId: l.taxCodeId || l.suggestedTaxCode || l.taxCode || null,
      description: l.description || null,
    }));
  } else {
    const accountId = meta.suggestedAccountId || meta.accountId;
    const amount = Number(meta.subtotal ?? meta.amount ?? meta.total);
    if (accountId && Number.isFinite(amount)) {
      lines = [{
        accountId,
        amount,
        taxCodeId: meta.suggestedTaxCode || meta.taxCode || meta.hstCode || null,
        description: meta.description || meta.vendor || null,
      }];
    }
  }
  if (!lines.length) return null;
  return { vendorId, txnDate, docNumber, lines, privateNote: meta.rationale || null };
}

export type PostResult =
  | { posted: true; billId: string; realmId: string }
  | { posted: false; skipped: string }
  | { posted: false; error: string };

/** Connection for a client — single active connection or refuse (isolation). */
async function connForClient(clientId: number): Promise<any | { error: string }> {
  const db = getDb();
  const rows = await db.select().from(qboConnections).where(and(eq(qboConnections.clientId, clientId), eq(qboConnections.isActive, true)));
  if (rows.length === 0) return { error: "no active QBO connection for this client" };
  if (rows.length > 1) return { error: "ambiguous QBO connections for this client" };
  return rows[0];
}

/**
 * Post an APPROVED finding to QBO as a Bill. All four safety gates apply. Never
 * throws — returns a structured result the caller folds into the finding.
 */
export async function postFindingToQBO(findingId: number): Promise<PostResult> {
  let auditClientId: number | null = null;   // hoisted so the catch can still audit
  try {
    if (!postingMasterEnabled()) return { posted: false, skipped: "posting disabled (FIGGY_QBO_POST off)" };
    const db = getDb();
    const f = (await db.select().from(triageFindings).where(eq(triageFindings.id, findingId)).limit(1))[0];
    if (!f) return { posted: false, error: "finding not found" };
    if (!f.clientId) return { posted: false, skipped: "finding has no client" };
    auditClientId = f.clientId;

    const conn = await connForClient(f.clientId);
    if ("error" in conn) return { posted: false, skipped: conn.error };

    const realmId = String(conn.realmId);
    if (!isRealmPostEnabled(realmId)) return { posted: false, skipped: `realm ${realmId} not enabled for posting` };
    if (conn.transport !== "native") return { posted: false, skipped: "connection is read-only (Make bridge) — needs native OAuth to write" };

    const input = billInputFromSourceData(f.sourceData);
    const valid = validatePostable(input);
    if (!valid.ok) return { posted: false, skipped: valid.reason };

    const live = await ensureValidToken(conn);
    const payload = buildBillPayload(input as BillInput);
    const billTotal = ((input as BillInput).lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
    const res = await qboRequest(live, "/bill", "POST", payload);
    const billId = res?.Bill?.Id ? String(res.Bill.Id) : "";
    if (!billId) {
      await recordAudit({ userId: await ownerForClient(f.clientId), agentScope: "fig", action: "qbo.post.bill", decision: "error", clientId: f.clientId, amount: billTotal, summary: `Bill post to realm ${realmId} returned no Id (finding #${findingId})` });
      return { posted: false, error: "QBO did not return a Bill Id" };
    }

    // Stamp the posted id back onto the finding so we never double-post.
    let meta: any = {};
    try { meta = JSON.parse(f.sourceData || "{}"); } catch { /* ignore */ }
    meta.qboBillId = billId;
    meta.postedAt = new Date().toISOString();
    await db.update(triageFindings).set({ sourceData: JSON.stringify(meta) }).where(eq(triageFindings.id, findingId));

    // Auditability (FOS — every financial action is traceable: what/when/why/what-changed).
    await recordAudit({ userId: await ownerForClient(f.clientId), agentScope: "fig", action: "qbo.post.bill", decision: "done", clientId: f.clientId, amount: billTotal, summary: `Posted Bill ${billId} to realm ${realmId} (${(input as BillInput).vendorName || "vendor"}, finding #${findingId})` });
    return { posted: true, billId, realmId };
  } catch (e) {
    await recordAudit({ userId: auditClientId ? await ownerForClient(auditClientId) : 0, agentScope: "fig", action: "qbo.post.bill", decision: "error", clientId: auditClientId, summary: `Bill post threw: ${e instanceof Error ? e.message : String(e)}` });
    return { posted: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type JournalResult =
  | { posted: true; journalId: string; realmId: string }
  | { posted: false; skipped: string }
  | { posted: false; error: string };

/**
 * Post a balanced JOURNAL ENTRY (general or intercompany) to a client's QBO. Same
 * four safety gates as the bill poster. The journal must balance (validated) or it
 * refuses. Used for intercompany due-to/due-from, reclasses, and manual JEs — all
 * REVIEW-GATED (the caller only invokes this on Markie's approval).
 */
export async function postJournalEntry(clientId: number, input: JournalInput): Promise<JournalResult> {
  try {
    if (!postingMasterEnabled()) return { posted: false, skipped: "posting disabled (FIGGY_QBO_POST off)" };
    const conn = await connForClient(clientId);
    if ("error" in conn) return { posted: false, skipped: conn.error };
    const realmId = String(conn.realmId);
    if (!isRealmPostEnabled(realmId)) return { posted: false, skipped: `realm ${realmId} not enabled for posting` };
    if (conn.transport !== "native") return { posted: false, skipped: "connection is read-only (Make bridge) — needs native OAuth to write" };

    const valid = validateJournalEntry(input);
    if (!valid.ok) return { posted: false, skipped: valid.reason };

    const live = await ensureValidToken(conn);
    const payload = buildJournalEntryPayload(input);
    const jeTotal = (input.lines || []).filter((l) => l.posting === "Debit").reduce((s, l) => s + Number(l.amount || 0), 0);
    const res = await qboRequest(live, "/journalentry", "POST", payload);
    const journalId = res?.JournalEntry?.Id ? String(res.JournalEntry.Id) : "";
    if (!journalId) {
      await recordAudit({ userId: await ownerForClient(clientId), agentScope: "fig", action: "qbo.post.journal", decision: "error", clientId, amount: jeTotal, summary: `Journal post to realm ${realmId} returned no Id` });
      return { posted: false, error: "QBO did not return a JournalEntry Id" };
    }
    // Auditability (FOS — financial actions are traceable).
    await recordAudit({ userId: await ownerForClient(clientId), agentScope: "fig", action: "qbo.post.journal", decision: "done", clientId, amount: jeTotal, summary: `Posted JournalEntry ${journalId} to realm ${realmId}` });
    return { posted: true, journalId, realmId };
  } catch (e) {
    await recordAudit({ userId: await ownerForClient(clientId), agentScope: "fig", action: "qbo.post.journal", decision: "error", clientId, summary: `Journal post threw: ${e instanceof Error ? e.message : String(e)}` });
    return { posted: false, error: e instanceof Error ? e.message : String(e) };
  }
}
