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
import { eq, and } from "drizzle-orm";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { qboConnections, vendorMemory } from "../db/schema";
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
  const billData = await qboRequest(conn, `/query?query=${encodeURIComponent(`SELECT * FROM Bill WHERE VendorRef = '${vendorId}' ORDERBY TxnDate DESC MAXRESULTS 50`)}`);
  const bills = parseBillHistory(billData);
  // Non-bill expenses via the vendor-filtered TransactionList report.
  const reportPath = `/reports/TransactionList?vendor=${vendorId}&start_date=${sinceISO}&columns=tx_date,txn_type,doc_num,other_account,subt_nat_amount`;
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
    .mutation(async ({ input }) => {
      const connResult = await getConnectionForClient(input.clientId);
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
      const coding = decideCoding(history, input.autoApproveThreshold ?? 85);
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
            connectionId: conn.id, clientId: input.clientId, qboVendorId: resolution.vendorId,
            vendorName: resolution.displayName, preferredAccountId: coding.suggestedAccountId,
            preferredAccountName: coding.suggestedAccountName, preferredTaxCode: coding.suggestedTaxCode,
            sampleCount: coding.sampleCount, lastValidatedAt: new Date(),
          };
          if (existing[0]) await db.update(vendorMemory).set(patch).where(eq(vendorMemory.id, existing[0].id));
          else await db.insert(vendorMemory).values(patch);
        } catch { /* cache is best-effort */ }
      }

      return { ok: true as const, resolution, coding, dedup };
    }),
});
