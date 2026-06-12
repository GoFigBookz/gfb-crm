/**
 * FIGGY JR — ACCOUNT-SELECTION BRAIN (Phase 2)
 * =============================================================================
 * Decides how to code an incoming bill/expense by reading the VENDOR'S OWN
 * history in *that client's* live QBO — never a generic category map. Same
 * lookup powers dedup. On a confirmed resolution it learns (Vendor Memory +
 * QBO vendor-card contact write-back).
 *
 * GOLDEN RULES (enforced here):
 *  - Nothing posts to QBO without Markie's review. This module only SUGGESTS.
 *  - Chart of accounts is LOCKED — never invent an account. If history is
 *    empty or ambiguous, FLAG; do not guess.
 *  - Clark OS (Owen Sound) and Clark CW (Collingwood) are separate realms; the
 *    brain only ever reads the connection for the client it was asked about.
 *  - Verify against live QBO: account/tax come from real transactions, cached
 *    in Vendor Memory but always re-validated against live history.
 *
 * QBO API REALITIES (verified live 2026-06-11 against Clark OS realm):
 *  - Bills ARE filterable by vendor:  SELECT * FROM Bill WHERE VendorRef='ID'
 *    -> precise line-level AccountRef + TaxCodeRef (multi-line aware).
 *  - Purchase/Expense are NOT (`EntityRef` "is not queryable"). For those we
 *    use the TransactionList report, vendor-filtered, reading the `other_account`
 *    (the expense side; `account_name` is the bank/CC or A/P). Single-line only;
 *    "-Split-" rows are skipped (can't attribute one account).
 *  - We read Bills via SQL and NON-Bill types via the report, so the two
 *    sources never double-count the same transaction.
 *  - NOTE: QBO's Vendor entity has NO native "default account/tax" field, so
 *    the learned coding lives in Vendor Memory (our cache); only contact fields
 *    (email/phone/address/name) are written back to the QBO vendor card.
 * =============================================================================
 */
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { qboConnections, vendorMemory, triageFindings } from "../db/schema";
import { qboRequest, ensureValidToken } from "./qbo-router";
import {
  type CodingEntry,
  type CodingDecision,
  type VendorResolution,
  normalizeVendorName,
  resolveVendorFromCandidates,
  parseBillHistory,
  parseExpenseReport,
  decideCoding,
  decideDedup,
} from "./qbo-vendor-brain-core";
import { type CategoryCodingMap, codingHintForVendor } from "./qbo-vendor-classify";
import { classifyVendorByWeb } from "./qbo-vendor-web-classify";
import { matchClientIdByName } from "./client-match";

// Per-client (realm) category -> REAL locked-chart account map for the cold-start
// classifier. Keyed by realmId so it can never apply one client's accounts to
// another. Add a realm's entries as its chart is verified live.
const CATEGORY_MAPS: Record<string, CategoryCodingMap> = {
  // Clark OS (Owen Sound) — verified live 2026-06-11. Tax: HSTon 6 / M&E 7.
  "9341456017349963": {
    meals: { accountId: "1150040020", accountName: "Meals & Entertainment", taxCode: "7" }, // M&E 50%, rate ref 15
    fuel: { accountId: "1150040005", accountName: "Fuel", taxCode: "6" },                     // HST on
  },
  // Clark CW (Collingwood) — verified live 2026-06-11. NON-STANDARD tax: HSTon 7 / M&E 9.
  "13633946244024404": {
    meals: { accountId: "142", accountName: "Meals and entertainment", taxCode: "9" }, // M&E, rate ref 18
    fuel: { accountId: "108", accountName: "Vehicle - Fuel", taxCode: "7" },             // HST on
  },
};

// Re-export the pure core so existing import sites keep working.
export * from "./qbo-vendor-brain-core";

// ----------------------------------------------------------------------------
// Live QBO I/O (uses the CRM's native QBO connection + token refresh)
// ----------------------------------------------------------------------------
type Conn = typeof qboConnections.$inferSelect;

export async function qboResolveVendor(conn: Conn, rawName: string): Promise<VendorResolution> {
  const safe = rawName.replace(/'/g, "\\'").slice(0, 60);
  // Try a couple of LIKE forms: full string, then the most distinctive word.
  const distinct = normalizeVendorName(rawName).split(" ").filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0];
  const likes = [safe, distinct].filter(Boolean) as string[];
  const seen = new Map<string, { Id: string; DisplayName: string }>();
  for (const term of likes) {
    const data = await qboRequest(conn, `/query?query=${encodeURIComponent(`SELECT Id, DisplayName FROM Vendor WHERE DisplayName LIKE '%${term}%'`)}`);
    for (const v of data?.QueryResponse?.Vendor ?? []) seen.set(String(v.Id), { Id: String(v.Id), DisplayName: String(v.DisplayName) });
    if (seen.size > 0 && term === safe) break; // full-name hit is enough
  }
  return resolveVendorFromCandidates(rawName, [...seen.values()]);
}

export async function qboVendorHistory(conn: Conn, vendorId: string, sinceISO: string): Promise<CodingEntry[]> {
  // Bills via SQL (precise line-level account + tax).
  // ⚠️ MUST be `SELECT *` — a COLUMN-PROJECTED Bill query (e.g. SELECT Id,Line)
  // returns the Line WITHOUT AccountBasedExpenseLineDetail, so the AccountRef is
  // silently dropped and coding breaks. Verified live 2026-06-11. Do not "optimize"
  // this into a projection.
  const billData = await qboRequest(conn, `/query?query=${encodeURIComponent(`SELECT * FROM Bill WHERE VendorRef = '${vendorId}' ORDERBY TxnDate DESC MAXRESULTS 50`)}`);
  const bills = parseBillHistory(billData);
  // Non-bill expenses (Purchase/Expense — card/cheque/cash) via the
  // vendor-filtered TransactionList report. MUST send BOTH start_date AND
  // end_date: with start_date alone QBO keeps its default "month-to-date" macro
  // and returns nothing (verified live 2026-06-11). Clark OS had 402 Purchases,
  // so this is real coverage, not an edge case.
  const today = new Date().toISOString().slice(0, 10);
  const reportPath = `/reports/TransactionList?vendor=${vendorId}&start_date=${sinceISO}&end_date=${today}&columns=tx_date,txn_type,doc_num,other_account,subt_nat_amount`;
  let expenses: CodingEntry[] = [];
  try {
    const rep = await qboRequest(conn, reportPath);
    expenses = parseExpenseReport(rep);
  } catch {
    // report is best-effort; bills alone still yield a decision
  }
  return [...bills, ...expenses];
}

/** Write back ONLY contact fields to the QBO vendor card (name/email/phone/
 *  address). Coding/tax is NOT a native QBO vendor field — that lives in Vendor
 *  Memory. Sparse update requires the current SyncToken. */
export async function writeBackVendorCardContact(
  conn: Conn,
  vendorId: string,
  fields: { email?: string; phone?: string; addressLine1?: string; city?: string; postalCode?: string },
): Promise<{ updated: boolean }> {
  const cur = await qboRequest(conn, `/query?query=${encodeURIComponent(`SELECT * FROM Vendor WHERE Id = '${vendorId}'`)}`);
  const v = cur?.QueryResponse?.Vendor?.[0];
  if (!v) return { updated: false };
  const body: Record<string, unknown> = { Id: vendorId, SyncToken: v.SyncToken, sparse: true };
  if (fields.email) body.PrimaryEmailAddr = { Address: fields.email };
  if (fields.phone) body.PrimaryPhone = { FreeFormNumber: fields.phone };
  if (fields.addressLine1 || fields.city || fields.postalCode) {
    body.BillAddr = { Line1: fields.addressLine1 ?? v.BillAddr?.Line1, City: fields.city ?? v.BillAddr?.City, PostalCode: fields.postalCode ?? v.BillAddr?.PostalCode };
  }
  if (Object.keys(body).length <= 3) return { updated: false }; // nothing to change
  await qboRequest(conn, `/vendor`, "POST", body);
  return { updated: true };
}

// ----------------------------------------------------------------------------
// Orchestrator + tRPC surface
// ----------------------------------------------------------------------------
/**
 * Resolve the QBO connection for a client — the SINGLE per-client isolation
 * boundary. Refuses to guess: a client must have exactly ONE active connection.
 * 0 -> not connected; 2+ -> ambiguous (never silently pick one realm, which
 * could read the wrong company's books). This is what guarantees Clark OS and
 * Clark CW (and every other client) never cross-pollinate.
 */
async function getConnectionForClient(
  clientId: number,
): Promise<{ conn: Conn } | { error: "no_active_qbo_connection_for_client" | "ambiguous_qbo_connections_for_client" }> {
  const db = getDb();
  const rows = await db.select().from(qboConnections).where(and(eq(qboConnections.clientId, clientId), eq(qboConnections.isActive, true)));
  if (rows.length === 0) return { error: "no_active_qbo_connection_for_client" };
  if (rows.length > 1) return { error: "ambiguous_qbo_connections_for_client" };
  return { conn: await ensureValidToken(rows[0]) };
}

/** Parse a money-ish string ("$1,234.56", "1234.56") into a number, or undefined. */
function parseAmt(v: any): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

/** Core brain run for one client + document. READ-ONLY against QBO; never posts.
 *  Shared by the suggestCoding endpoint and the findings enrichment. */
export async function suggestForClient(
  clientId: number,
  input: { vendorName: string; invoiceNumber?: string; total?: number; txnDate?: string; historySinceISO?: string; autoApproveThreshold?: number },
) {
  const connResult = await getConnectionForClient(clientId);
  if ("error" in connResult) return { ok: false as const, error: connResult.error };
  const conn = connResult.conn;

  const resolution = await qboResolveVendor(conn, input.vendorName);
  if (resolution.status === "unresolved") {
    return { ok: true as const, resolution, coding: { status: "flag", flagReason: "vendor_unresolved" } as Partial<CodingDecision>, dedup: null };
  }
  if (resolution.status === "ambiguous") {
    return { ok: true as const, resolution, coding: { status: "flag", flagReason: "vendor_ambiguous" } as Partial<CodingDecision>, dedup: null };
  }

  const since = input.historySinceISO ?? new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
  const history = await qboVendorHistory(conn, resolution.vendorId, since);
  let coding = decideCoding(history, input.autoApproveThreshold ?? 85);

  // COLD START: no history -> review-gated classifier HINT (name keywords, then
  // live web lookup if enabled). Stays FLAGGED — never auto-posts/caches.
  if (coding.status === "flag" && coding.flagReason === "no_history") {
    const map = CATEGORY_MAPS[conn.realmId] ?? {};
    const vname = resolution.displayName || input.vendorName;
    let hint = codingHintForVendor(vname, map);
    if (!hint && Object.keys(map).length > 0) {
      const web = await classifyVendorByWeb(vname);
      if (web) hint = codingHintForVendor(vname, map, web);
    }
    if (hint) {
      coding = {
        ...coding,
        suggestedAccountId: hint.accountId, suggestedAccountName: hint.accountName,
        suggestedTaxCode: hint.taxCode, confidence: hint.confidence, triage: "yellow", rationale: hint.rationale,
      };
    }
  }
  const dedup = decideDedup(
    { invoiceNumber: input.invoiceNumber, total: input.total, txnDate: input.txnDate },
    history.map((h) => ({ docNumber: h.docNumber, amount: h.amount, date: h.date, txnId: h.txnId })),
  );

  // Cache the confident suggestion in Vendor Memory (re-validated each run).
  if (coding.status === "suggested" && coding.suggestedAccountId) {
    try {
      const db = getDb();
      const existing = await db.select().from(vendorMemory)
        .where(and(eq(vendorMemory.connectionId, conn.id), eq(vendorMemory.qboVendorId, resolution.vendorId))).limit(1);
      const patch = {
        connectionId: conn.id, clientId, qboVendorId: resolution.vendorId,
        vendorName: resolution.displayName, preferredAccountId: coding.suggestedAccountId,
        preferredAccountName: coding.suggestedAccountName, preferredTaxCode: coding.suggestedTaxCode,
        sampleCount: coding.sampleCount, lastValidatedAt: new Date(),
      };
      if (existing[0]) await db.update(vendorMemory).set(patch).where(eq(vendorMemory.id, existing[0].id));
      else await db.insert(vendorMemory).values(patch);
    } catch { /* cache is best-effort */ }
  }

  return { ok: true as const, resolution, coding, dedup };
}

/** Run the brain over existing Triage findings and fold its traffic-light /
 *  confidence / rationale into each finding's sourceData. READ-ONLY against QBO,
 *  defensive per-finding. Shared by the Triage button and the admin self-test. */
export async function runEnrichment(input?: { limit?: number; status?: "new" | "approved" | "dismissed" | "awaiting_client"; reenrich?: boolean }) {
  const db = getDb();
  const limit = input?.limit ?? 50;
  const status = input?.status ?? "new";
  const rows = await db.select().from(triageFindings)
    .where(eq(triageFindings.status, status)).orderBy(desc(triageFindings.createdAt)).limit(limit);
  let enriched = 0;
  const skip = { noClient: 0, noVendor: 0, already: 0, notConnected: 0, error: 0 };
  const errors: string[] = [];
  for (const f of rows) {
    try {
      let meta: any = {};
      try { meta = JSON.parse(f.sourceData || "{}"); } catch { meta = {}; }
      if (!meta || typeof meta !== "object" || !meta.vendor) { skip.noVendor++; continue; }
      const clientId = f.clientId ?? (meta.clientName ? await matchClientIdByName(String(meta.clientName)) : null);
      if (!clientId) { skip.noClient++; continue; }
      if (meta.triage && !input?.reenrich) { skip.already++; continue; } // already enriched
      const r = await suggestForClient(clientId, {
        vendorName: String(meta.vendor),
        invoiceNumber: meta.invoiceNumber ? String(meta.invoiceNumber) : undefined,
        total: parseAmt(meta.amount),
        txnDate: meta.date ? String(meta.date) : undefined,
      });
      if (!r.ok) {
        if (String(r.error).includes("no_active") || String(r.error).includes("ambiguous")) skip.notConnected++;
        else { skip.error++; if (errors.length < 5) errors.push(`#${f.id}: ${r.error}`); }
        continue;
      }
      const c: any = r.coding ?? {};
      const triage: "green" | "yellow" | "red" = c.triage ?? "red";
      const confidence = typeof c.confidence === "number" ? c.confidence : 0;
      const rationale = c.rationale ??
        (c.flagReason === "vendor_unresolved" ? "Couldn't find this vendor in QBO — needs a human."
        : c.flagReason === "vendor_ambiguous" ? "More than one QBO vendor matches this name — pick one."
        : "Needs an account.");
      const newMeta = {
        ...meta, triage, confidence, rationale,
        suggestedAccount: c.suggestedAccountName ?? null,
        suggestedAccountId: c.suggestedAccountId ?? null,
        suggestedTaxCode: c.suggestedTaxCode ?? null,
        dedup: r.dedup && r.dedup.isDuplicate ? r.dedup : null,
      };
      await db.update(triageFindings).set({ sourceData: JSON.stringify(newMeta) }).where(eq(triageFindings.id, f.id));
      enriched++;
    } catch (e: any) {
      skip.error++; if (errors.length < 5) errors.push(`#${f.id}: ${e?.message || String(e)}`);
    }
  }
  const skipped = skip.noClient + skip.noVendor + skip.already + skip.notConnected + skip.error;
  return { enriched, skipped, scanned: rows.length, breakdown: skip, errors };
}

/** Health snapshot for remote diagnosis: bridge columns present? connections?
 *  finding counts? READ-ONLY. */
export async function bridgeHealth() {
  const db = getDb();
  const out: any = { columns: [] as string[], connections: [] as any[], findings: {}, error: null };
  try {
    const ti: any = await db.run(sql`PRAGMA table_info(qbo_connections)`);
    out.columns = [...(ti?.rows ?? ti ?? [])].map((r: any) => r.name ?? r[1]);
  } catch (e: any) { out.error = `table_info: ${e?.message || e}`; }
  try {
    const conns = await db.select().from(qboConnections);
    out.connections = conns.map((c: any) => ({ id: c.id, clientId: c.clientId, realmId: c.realmId, transport: c.transport, isActive: c.isActive, hasBridgeUrl: !!c.bridgeUrl }));
  } catch (e: any) { out.error = (out.error ? out.error + " | " : "") + `connections: ${e?.message || e}`; }
  try {
    const all = await db.select().from(triageFindings);
    out.findings = {
      total: all.length,
      new: all.filter((f: any) => f.status === "new").length,
      withClient: all.filter((f: any) => f.clientId).length,
      withTriage: all.filter((f: any) => { try { return !!JSON.parse(f.sourceData || "{}").triage; } catch { return false; } }).length,
    };
  } catch (e: any) { out.error = (out.error ? out.error + " | " : "") + `findings: ${e?.message || e}`; }
  return out;
}

export const qboBrainRouter = createRouter({
  /** Suggest coding for an incoming document. READ-ONLY — never posts. */
  suggestCoding: staffQuery
    .input(z.object({
      clientId: z.number(),
      vendorName: z.string().min(1),
      invoiceNumber: z.string().optional(),
      total: z.number().optional(),
      txnDate: z.string().optional(),
      historySinceISO: z.string().optional(),
      autoApproveThreshold: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input }) => suggestForClient(input.clientId, input)),

  /**
   * Run the brain over existing Triage findings and fold its traffic-light /
   * confidence / rationale into each finding's sourceData so the cards light up.
   * READ-ONLY against QBO. Defensive per-finding (one bad row can't stop the
   * batch) and returns a few error samples for remote diagnosis.
   */
  enrichFindings: staffQuery
    .input(z.object({
      limit: z.number().min(1).max(200).optional(),
      status: z.enum(["new", "approved", "dismissed", "awaiting_client"]).optional(),
      reenrich: z.boolean().optional(),
    }).optional())
    .mutation(async ({ input }) => runEnrichment(input ?? undefined)),
});
