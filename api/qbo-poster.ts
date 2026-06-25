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
 *   2. The client's realm must be in POST_ENABLED_REALMS (the 3 we're lighting up).
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

/** Realms we're lighting up first (Markie, 2026-06-25): Alderson, Ovita
 *  Construction, Ovita Holdings. Add more here as each is verified. */
export const POST_ENABLED_REALMS = new Set<string>([
  "9341454721167426", // Alderson Developments Ltd
  "193514344934582",  // Ovita Construction Ltd
  "193514710535449",  // Ovita Holdings Inc
]);

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
  try {
    if (!postingMasterEnabled()) return { posted: false, skipped: "posting disabled (FIGGY_QBO_POST off)" };
    const db = getDb();
    const f = (await db.select().from(triageFindings).where(eq(triageFindings.id, findingId)).limit(1))[0];
    if (!f) return { posted: false, error: "finding not found" };
    if (!f.clientId) return { posted: false, skipped: "finding has no client" };

    const conn = await connForClient(f.clientId);
    if ("error" in conn) return { posted: false, skipped: conn.error };

    const realmId = String(conn.realmId);
    if (!POST_ENABLED_REALMS.has(realmId)) return { posted: false, skipped: `realm ${realmId} not enabled for posting` };
    if (conn.transport !== "native") return { posted: false, skipped: "connection is read-only (Make bridge) — needs native OAuth to write" };

    const input = billInputFromSourceData(f.sourceData);
    const valid = validatePostable(input);
    if (!valid.ok) return { posted: false, skipped: valid.reason };

    const live = await ensureValidToken(conn);
    const payload = buildBillPayload(input as BillInput);
    const res = await qboRequest(live, "/bill", "POST", payload);
    const billId = res?.Bill?.Id ? String(res.Bill.Id) : "";
    if (!billId) return { posted: false, error: "QBO did not return a Bill Id" };

    // Stamp the posted id back onto the finding so we never double-post.
    let meta: any = {};
    try { meta = JSON.parse(f.sourceData || "{}"); } catch { /* ignore */ }
    meta.qboBillId = billId;
    meta.postedAt = new Date().toISOString();
    await db.update(triageFindings).set({ sourceData: JSON.stringify(meta) }).where(eq(triageFindings.id, findingId));

    return { posted: true, billId, realmId };
  } catch (e) {
    return { posted: false, error: e instanceof Error ? e.message : String(e) };
  }
}
