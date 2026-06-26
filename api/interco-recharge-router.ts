/**
 * INTER-COMPANY RECHARGE ROUTER — read-only generator + quarterly reconcile tracking.
 * =============================================================================
 * PURPOSE: For a payer client (Alderson), pull its expenses for a fiscal quarter
 * READ-ONLY from QBO, build the DRAFT recharge invoice (→ counterparty, e.g. Ovita
 * Holdings) + mirror bill via interco-recharge-core, and track each quarter's
 * reconcile state so the intercompany balance is settled every period.
 * INPUTS: payerClientId, counterparty name, period (start/end), accounts, HST flag.
 * OUTPUTS: the draft { invoice, bill, validation } + the saved per-client config +
 *          a quarter-by-quarter reconcile log.
 * DEPENDENCIES: getConnectionForClient + qboRequest (read-only bridge/native),
 *          interco-recharge-core (pure math), fiscalHstRange (period defaulting).
 * ERRORS: bridge_not_returning_data surfaced verbatim (same contract as hst-review).
 * LIMITATIONS: DRAFT ONLY — never posts to QBO (golden rule). Posting awaits the
 *          write connection; until then the approved draft is entered/posted by hand.
 *          Accounts are explicit, never guessed (locked chart).
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { buildRecharge, type RechargeExpense } from "./interco-recharge-core";

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];

/** Ensure the recharge config + reconcile-log tables exist (idempotent, boot-safe). */
export async function ensureRechargeSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS interco_recharge_config (
      payerClientId INTEGER PRIMARY KEY,
      counterpartyName TEXT,
      revenueAccount TEXT,
      expenseAccount TEXT,
      clearingAccount TEXT,
      hstRatePct REAL DEFAULT 13,
      chargeHst INTEGER DEFAULT 1,
      updatedAt INTEGER
    )`);
    // clearing accounts added after first ship — guard for existing tables.
    // Reciprocal interco: each entity has its OWN clearing account named for the
    // other. Alderson's books → "Holdings clearing account"; Holdings' books →
    // "Alderson Development clearing account". The transfer hits each side; both
    // net to zero on reconcile. (Legacy single `clearingAccount` kept, unused.)
    try { await db.run(sql`ALTER TABLE interco_recharge_config ADD COLUMN clearingAccount TEXT`); } catch { /* exists */ }
    try { await db.run(sql`ALTER TABLE interco_recharge_config ADD COLUMN payerClearingAccount TEXT`); } catch { /* exists */ }
    try { await db.run(sql`ALTER TABLE interco_recharge_config ADD COLUMN counterpartyClearingAccount TEXT`); } catch { /* exists */ }
    await db.run(sql`CREATE TABLE IF NOT EXISTS interco_recharge_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payerClientId INTEGER NOT NULL,
      periodLabel TEXT NOT NULL,
      periodStart TEXT, periodEnd TEXT,
      subtotal REAL, hst REAL, total REAL,
      reconciled INTEGER DEFAULT 0,
      reconciledAt INTEGER,
      invoiceRef TEXT, billRef TEXT,
      notes TEXT,
      createdAt INTEGER
    )`);
  } catch (e) {
    console.error("[interco-recharge] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}

/** Pull the payer's expense lines (Purchase + Bill) in range → {description, net}. */
async function pullExpenses(conn: any, start: string, end: string): Promise<{ expenses: RechargeExpense[]; errors: string[] }> {
  const range = `TxnDate >= '${start}' AND TxnDate <= '${end}'`;
  const expenses: RechargeExpense[] = [];
  const errors: string[] = [];
  const q = (s: string) => qboRequest(conn, `/query?query=${encodeURIComponent(s)}`);
  const pull = async (entity: "Purchase" | "Bill") => {
    try {
      for (const e of arr(await q(`SELECT * FROM ${entity} WHERE ${range} MAXRESULTS 1000`), entity)) {
        const docRef = e.DocNumber ? `${entity} ${e.DocNumber}` : `${entity} ${e.Id}`;
        for (const l of e.Line ?? []) {
          const d = l.AccountBasedExpenseLineDetail;
          if (!d) continue;
          expenses.push({
            description: `${d.AccountRef?.name || "Expense"}${e.EntityRef?.name ? ` — ${e.EntityRef.name}` : ""} (${String(e.TxnDate || "").slice(0, 10)})`,
            net: num(l.Amount),
            sourceRef: docRef,
          });
        }
      }
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : String(e2);
      if (/async ack|non-JSON|Make bridge/i.test(msg)) throw new Error("bridge_not_returning_data:" + msg);
      errors.push(`${entity}: ${msg}`);
    }
  };
  await pull("Purchase");
  await pull("Bill");
  return { expenses, errors };
}

export const intercoRechargeRouter = createRouter({
  getConfig: staffQuery
    .input(z.object({ payerClientId: z.number() }))
    .query(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      const row: any = (await db.run(sql`SELECT * FROM interco_recharge_config WHERE payerClientId=${input.payerClientId} LIMIT 1`));
      const r = (row?.rows ?? row ?? [])[0];
      if (!r) return null;
      return {
        payerClientId: input.payerClientId,
        counterpartyName: (r as any).counterpartyName,
        revenueAccount: (r as any).revenueAccount,
        expenseAccount: (r as any).expenseAccount,
        payerClearingAccount: (r as any).payerClearingAccount || (r as any).clearingAccount || "",
        counterpartyClearingAccount: (r as any).counterpartyClearingAccount || "",
        hstRatePct: num((r as any).hstRatePct) || 13,
        chargeHst: num((r as any).chargeHst) !== 0,
      };
    }),

  setConfig: staffQuery
    .input(z.object({
      payerClientId: z.number(),
      counterpartyName: z.string(),
      revenueAccount: z.string(),
      expenseAccount: z.string(),
      payerClearingAccount: z.string().default(""),
      counterpartyClearingAccount: z.string().default(""),
      hstRatePct: z.number().default(13),
      chargeHst: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      await db.run(sql`INSERT INTO interco_recharge_config
        (payerClientId, counterpartyName, revenueAccount, expenseAccount, payerClearingAccount, counterpartyClearingAccount, hstRatePct, chargeHst, updatedAt)
        VALUES (${input.payerClientId}, ${input.counterpartyName}, ${input.revenueAccount}, ${input.expenseAccount}, ${input.payerClearingAccount}, ${input.counterpartyClearingAccount}, ${input.hstRatePct}, ${input.chargeHst ? 1 : 0}, ${Date.now()})
        ON CONFLICT(payerClientId) DO UPDATE SET
          counterpartyName=${input.counterpartyName}, revenueAccount=${input.revenueAccount},
          expenseAccount=${input.expenseAccount}, payerClearingAccount=${input.payerClearingAccount},
          counterpartyClearingAccount=${input.counterpartyClearingAccount},
          hstRatePct=${input.hstRatePct}, chargeHst=${input.chargeHst ? 1 : 0}, updatedAt=${Date.now()}`);
      return { ok: true as const };
    }),

  /** Pull the payer's expenses for the period and build the DRAFT recharge. Read-only. */
  preview: staffQuery
    .input(z.object({
      payerClientId: z.number(),
      payerName: z.string(),
      counterpartyName: z.string(),
      revenueAccount: z.string(),
      expenseAccount: z.string(),
      hstRatePct: z.number().default(13),
      chargeHst: z.boolean().default(true),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodLabel: z.string().default(""),
    }))
    .mutation(async ({ input }) => {
      const cr = await getConnectionForClient(input.payerClientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      try {
        const { expenses, errors } = await pullExpenses(cr.conn, input.startDate, input.endDate);
        const draft = buildRecharge({
          periodLabel: input.periodLabel || `${input.startDate} → ${input.endDate}`,
          payerName: input.payerName,
          counterpartyName: input.counterpartyName,
          revenueAccount: input.revenueAccount,
          expenseAccount: input.expenseAccount,
          hstRatePct: input.hstRatePct,
          chargeHst: input.chargeHst,
          expenses,
        });
        return { ok: true as const, draft, pulled: expenses.length, errors };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("bridge_not_returning_data")) return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
        return { ok: false as const, error: msg };
      }
    }),

  /** The quarter-by-quarter reconcile log for a payer. */
  log: staffQuery
    .input(z.object({ payerClientId: z.number() }))
    .query(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      const rows: any = (await db.run(sql`SELECT * FROM interco_recharge_log WHERE payerClientId=${input.payerClientId} ORDER BY id DESC LIMIT 24`));
      return (rows?.rows ?? rows ?? []) as any[];
    }),

  /** Record a quarter's recharge (and whether it's been reconciled to zero). */
  recordPeriod: staffQuery
    .input(z.object({
      payerClientId: z.number(), periodLabel: z.string(),
      periodStart: z.string().optional(), periodEnd: z.string().optional(),
      subtotal: z.number(), hst: z.number(), total: z.number(),
      reconciled: z.boolean().default(false),
      invoiceRef: z.string().optional(), billRef: z.string().optional(), notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      await db.run(sql`INSERT INTO interco_recharge_log
        (payerClientId, periodLabel, periodStart, periodEnd, subtotal, hst, total, reconciled, reconciledAt, invoiceRef, billRef, notes, createdAt)
        VALUES (${input.payerClientId}, ${input.periodLabel}, ${input.periodStart ?? null}, ${input.periodEnd ?? null},
          ${input.subtotal}, ${input.hst}, ${input.total}, ${input.reconciled ? 1 : 0},
          ${input.reconciled ? Date.now() : null}, ${input.invoiceRef ?? null}, ${input.billRef ?? null}, ${input.notes ?? null}, ${Date.now()})`);
      return { ok: true as const };
    }),

  markReconciled: staffQuery
    .input(z.object({ id: z.number(), reconciled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.run(sql`UPDATE interco_recharge_log SET reconciled=${input.reconciled ? 1 : 0}, reconciledAt=${input.reconciled ? Date.now() : null} WHERE id=${input.id}`);
      return { ok: true as const };
    }),
});
