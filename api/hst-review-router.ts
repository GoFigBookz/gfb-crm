/**
 * PRE-HST REVIEW ROUTER — read-only I/O around hst-review-core.
 * =============================================================================
 * Pulls a client's QBO data READ-ONLY (via the existing per-realm bridge), maps
 * it to the core's shapes, runs the accuracy checks, and returns the report +
 * an implied-HST tie-out. NO posting, NO writes — verifies the data that feeds
 * QuickBooks' own HST report. Per-client isolation via getConnectionForClient
 * (refuses to guess: 0 connections = not connected, 2+ = ambiguous).
 *
 * HONEST LIMITATION: QBO line shapes vary; this normalizes the common cases and
 * returns raw pull counts + any per-entity errors so the first live run is
 * transparent. Validate the output against a known entity before relying on it.
 * Bounded pulls (MAXRESULTS 1000 each) to respect the Make ops cap.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { runHstReview, type RawAccount, type RawTaxCode, type RawTxn, type RawLine } from "./hst-review-core";

const q = (conn: any, sql: string) => qboRequest(conn, `/query?query=${encodeURIComponent(sql)}`);
const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const TAXABLE_CODE = (name?: string | null) => !!name && !/exempt|out of scope|out-of-scope|zero|0\s*%|^z$|^e$|^os$|non-?taxable/i.test(name);

/**
 * QBO carries the tax total at the transaction level (TxnTaxDetail.TotalTax), not per line.
 * To make the per-line checks (meals 50% ITC, etc.) work, apportion that total across the
 * TAXABLE-coded lines by their share of the taxable base. Best-effort — exact per-line tax
 * isn't exposed; the tie-out still uses the authoritative txn-level total.
 */
function apportionLineTax(lines: RawLine[], taxTotal: number): void {
  if (!taxTotal) return;
  const taxableBase = lines.filter((l) => TAXABLE_CODE(l.taxCodeName)).reduce((s, l) => s + Math.max(l.amount, 0), 0);
  if (taxableBase <= 0) return;
  for (const l of lines) {
    if (TAXABLE_CODE(l.taxCodeName) && l.amount > 0) {
      l.taxAmount = Math.round((taxTotal * (l.amount / taxableBase)) * 100) / 100;
    }
  }
}

/** Map a QBO expense entity (Purchase / Bill) → RawTxn. */
function mapExpense(e: any, type: "Purchase" | "Bill", taxName: (id?: string) => string | undefined): RawTxn {
  const lines: RawLine[] = [];
  for (const l of e.Line ?? []) {
    const d = l.AccountBasedExpenseLineDetail;
    if (!d) continue;
    lines.push({
      accountId: d.AccountRef?.value, accountName: d.AccountRef?.name,
      amount: num(l.Amount),
      taxCodeId: d.TaxCodeRef?.value ?? null,
      taxCodeName: d.TaxCodeRef?.name ?? taxName(d.TaxCodeRef?.value) ?? null,
    });
  }
  const taxTotal = num(e.TxnTaxDetail?.TotalTax);
  apportionLineTax(lines, taxTotal);
  return {
    id: String(e.Id), type, date: String(e.TxnDate || "").slice(0, 10),
    name: e.EntityRef?.name || e.VendorRef?.name, docNumber: e.DocNumber,
    total: num(e.TotalAmt), taxTotal, lines,
  };
}

/** Map a QBO sales entity (Invoice / SalesReceipt) → RawTxn. */
function mapSale(e: any, type: "Invoice" | "SalesReceipt", taxName: (id?: string) => string | undefined): RawTxn {
  const lines: RawLine[] = [];
  for (const l of e.Line ?? []) {
    const d = l.SalesItemLineDetail;
    if (!d) continue;
    lines.push({
      accountName: d.ItemRef?.name || l.Description || "Sales",
      amount: num(l.Amount),
      taxCodeId: d.TaxCodeRef?.value ?? null,
      taxCodeName: d.TaxCodeRef?.name ?? taxName(d.TaxCodeRef?.value) ?? null,
    });
  }
  const taxTotal = num(e.TxnTaxDetail?.TotalTax);
  apportionLineTax(lines, taxTotal);
  return {
    id: String(e.Id), type, date: String(e.TxnDate || "").slice(0, 10),
    name: e.CustomerRef?.name, docNumber: e.DocNumber,
    total: num(e.TotalAmt), taxTotal, lines,
  };
}

export const hstReviewRouter = createRouter({
  /** Read-only pre-HST accuracy review for one client over a date range. */
  run: staffQuery
    .input(z.object({
      clientId: z.number(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ input }) => {
      const cr = await getConnectionForClient(input.clientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      const conn = cr.conn;
      const errors: string[] = [];
      const range = `TxnDate >= '${input.startDate}' AND TxnDate <= '${input.endDate}'`;

      // tax codes first (to name the codes referenced on lines)
      const taxCodes: RawTaxCode[] = [];
      const taxById = new Map<string, string>();
      try {
        for (const t of arr(await q(conn, `SELECT * FROM TaxCode MAXRESULTS 1000`), "TaxCode")) {
          taxCodes.push({ id: String(t.Id), name: t.Name });
          taxById.set(String(t.Id), t.Name);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // If the bridge isn't returning data (async ack / non-JSON), don't hammer 5
        // more queries against a broken connection — fail fast with ONE clear status.
        if (/async ack|non-JSON|Make bridge/i.test(msg)) {
          return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
        }
        errors.push(`TaxCode: ${msg}`);
      }
      const taxName = (id?: string) => (id ? taxById.get(String(id)) : undefined);

      // accounts (for the unreviewed-balance check)
      const accounts: RawAccount[] = [];
      try {
        for (const a of arr(await q(conn, `SELECT * FROM Account MAXRESULTS 1000`), "Account")) {
          accounts.push({ id: String(a.Id), name: a.Name, type: a.AccountType, subType: a.AccountSubType, balance: num(a.CurrentBalance) });
        }
      } catch (e) { errors.push(`Account: ${e instanceof Error ? e.message : e}`); }

      // transactions in range
      const txns: RawTxn[] = [];
      const pull = async (entity: string, mapper: (e: any) => RawTxn) => {
        try {
          for (const e of arr(await q(conn, `SELECT * FROM ${entity} WHERE ${range} MAXRESULTS 1000`), entity)) txns.push(mapper(e));
        } catch (e) { errors.push(`${entity}: ${e instanceof Error ? e.message : e}`); }
      };
      await pull("Purchase", (e) => mapExpense(e, "Purchase", taxName));
      await pull("Bill", (e) => mapExpense(e, "Bill", taxName));
      await pull("Invoice", (e) => mapSale(e, "Invoice", taxName));
      await pull("SalesReceipt", (e) => mapSale(e, "SalesReceipt", taxName));

      const report = runHstReview({ accounts, taxCodes, txns });
      return {
        ok: true as const,
        period: { start: input.startDate, end: input.endDate },
        report,
        pulled: { accounts: accounts.length, taxCodes: taxCodes.length, transactions: txns.length },
        errors,
      };
    }),
});
