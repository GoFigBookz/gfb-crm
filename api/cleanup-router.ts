/**
 * CLEANUP ROUTER — cross-entity payment-source / double-post finder (read-only).
 * =============================================================================
 * PURPOSE: Answer "who actually paid this?" for unreconciled expenses across a
 * group of related companies (e.g. the Rocco group). Pulls each entity's payments
 * (Purchase + BillPayment) with the SOURCE account they were booked against, then
 * finds the same vendor+amount appearing under a different account or in a different
 * entity — i.e. an expense sitting unreconciled in one company's bank that was really
 * paid on a credit card or by another company.
 * INPUTS: clientIds[] (the group), startDate, endDate.
 * OUTPUTS: flagged duplicate groups (vendor, amount, which entities + accounts hold
 *          it, the line items), per-account totals, per-entity pull counts + errors.
 * LIMITATIONS: read-only; a flagged match is a STRONG HINT (same vendor+amount in two
 *          places), the human confirms. Bridge errors surfaced per entity, not fatal.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { findCrossAccountDuplicates, type Payment } from "./payment-source-core";
import { findDuplicateClients } from "./duplicate-clients-core";

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];

async function pullPayments(conn: any, entityName: string, start: string, end: string): Promise<{ payments: Payment[]; error?: string }> {
  const range = `TxnDate >= '${start}' AND TxnDate <= '${end}'`;
  const payments: Payment[] = [];
  const q = (s: string) => qboRequest(conn, `/query?query=${encodeURIComponent(s)}`);
  try {
    for (const e of arr(await q(`SELECT * FROM Purchase WHERE ${range} MAXRESULTS 1000`), "Purchase")) {
      payments.push({
        vendor: e.EntityRef?.name || e.VendorRef?.name || "(no payee)",
        amount: num(e.TotalAmt),
        date: String(e.TxnDate || "").slice(0, 10),
        account: e.AccountRef?.name || "(no account)",   // the SOURCE (bank / credit card)
        entity: entityName,
        paymentType: e.PaymentType,
        ref: e.DocNumber ? `Purchase ${e.DocNumber}` : `Purchase ${e.Id}`,
      });
    }
    for (const e of arr(await q(`SELECT * FROM BillPayment WHERE ${range} MAXRESULTS 1000`), "BillPayment")) {
      const acct = e.CheckPayment?.BankAccountRef?.name || e.CreditCardPayment?.CCAccountRef?.name || "(no account)";
      payments.push({
        vendor: e.VendorRef?.name || "(no payee)",
        amount: num(e.TotalAmt),
        date: String(e.TxnDate || "").slice(0, 10),
        account: acct,
        entity: entityName,
        paymentType: e.PayType,
        ref: e.DocNumber ? `BillPayment ${e.DocNumber}` : `BillPayment ${e.Id}`,
      });
    }
    return { payments };
  } catch (e2) {
    const msg = e2 instanceof Error ? e2.message : String(e2);
    return { payments, error: /async ack|non-JSON|Make bridge/i.test(msg) ? "bridge_not_returning_data" : msg };
  }
}

export const cleanupRouter = createRouter({
  /** The clients in a named group (or all active) — for the multi-select. */
  groupClients: staffQuery
    .input(z.object({ groupName: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = input?.groupName
        ? (await db.all(sql`SELECT id, name, groupName FROM clients WHERE groupName = ${input.groupName} ORDER BY name`)) as any[]
        : (await db.all(sql`SELECT id, name, groupName FROM clients WHERE status='active' ORDER BY name`)) as any[];
      return rows;
    }),

  /**
   * Read-only scan for LIKELY duplicate client cards (same name / email / phone /
   * HST# / tax ID). Detection only — never merges (a blind clientId re-point could
   * collapse two separate QBO realms, breaking per-client isolation). Markie reviews
   * the pairs and merges by hand, or signs off on merge rules first.
   */
  duplicateClients: staffQuery.query(async () => {
    const rows = (await getDb().all(sql`SELECT id, name, email, phone, hstNumber, taxId, status FROM clients`)) as any[];
    const pairs = findDuplicateClients(rows);
    return { pairs, scanned: rows.length };
  }),

  /** Scan a set of entities for cross-account / cross-entity payment duplicates. */
  paymentSourceScan: staffQuery
    .input(z.object({
      clientIds: z.array(z.number()).min(1),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const all: Payment[] = [];
      const perEntity: { clientId: number; name: string; pulled: number; error?: string }[] = [];
      for (const clientId of input.clientIds) {
        const row = (await db.all(sql`SELECT name FROM clients WHERE id=${clientId} LIMIT 1`)) as any[];
        const name = row[0]?.name || `Client ${clientId}`;
        const cr = await getConnectionForClient(clientId);
        if ("error" in cr) { perEntity.push({ clientId, name, pulled: 0, error: cr.error }); continue; }
        const { payments, error } = await pullPayments(cr.conn, name, input.startDate, input.endDate);
        all.push(...payments);
        perEntity.push({ clientId, name, pulled: payments.length, error });
      }
      const result = findCrossAccountDuplicates(all);
      return { ok: true as const, result, perEntity, period: { start: input.startDate, end: input.endDate } };
    }),
});
