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
import { checkClearingRecon } from "./interco-recon-core";
import { postRecharge } from "./interco-recharge-poster";

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];
const normName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Pull an account's CurrentBalance by name from a connection. Returns the balance
 *  + (on miss) the available account names so the human can correct the spelling. */
async function accountBalanceByName(conn: any, name: string): Promise<{ found: boolean; balance: number; matchedName?: string; candidates?: string[] }> {
  const data = await qboRequest(conn, `/query?query=${encodeURIComponent("SELECT * FROM Account MAXRESULTS 1000")}`);
  const accts = arr(data, "Account");
  const target = normName(name);
  let hit = accts.find((a: any) => normName(a.Name) === target)
    || accts.find((a: any) => normName(a.Name).includes(target) || target.includes(normName(a.Name)));
  if (!hit) return { found: false, balance: 0, candidates: accts.map((a: any) => a.Name).filter(Boolean).slice(0, 50) };
  return { found: true, balance: num(hit.CurrentBalance), matchedName: hit.Name };
}

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
    // ZERO-OUT mode: default ON — the invoice credits the source expense accounts so
    // the payer (Alderson) ends with $0 expenses + $0 HST. Off = credit revenue acct.
    try { await db.run(sql`ALTER TABLE interco_recharge_config ADD COLUMN zeroOutExpenses INTEGER DEFAULT 1`); } catch { /* exists */ }
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

/** A per-expense-account total for the period (the account ids are the PAYER's own,
 *  read straight off its expense lines — so the zero-out invoice can credit each
 *  account back by exactly what was spent, with NO name guessing). */
export type ExpenseByAccount = { accountId: string; accountName: string; net: number };

/** Pull the payer's expense lines (Purchase + Bill) in range → per-line list for the
 *  draft preview + a per-account rollup for the zero-out invoice. */
async function pullExpenses(conn: any, start: string, end: string): Promise<{ expenses: RechargeExpense[]; byAccount: ExpenseByAccount[]; errors: string[] }> {
  const range = `TxnDate >= '${start}' AND TxnDate <= '${end}'`;
  const expenses: RechargeExpense[] = [];
  const byAcct = new Map<string, ExpenseByAccount>();
  const errors: string[] = [];
  const q = (s: string) => qboRequest(conn, `/query?query=${encodeURIComponent(s)}`);
  const pull = async (entity: "Purchase" | "Bill") => {
    try {
      for (const e of arr(await q(`SELECT * FROM ${entity} WHERE ${range} MAXRESULTS 1000`), entity)) {
        const docRef = e.DocNumber ? `${entity} ${e.DocNumber}` : `${entity} ${e.Id}`;
        for (const l of e.Line ?? []) {
          const d = l.AccountBasedExpenseLineDetail;
          if (!d) continue;
          const acctName = d.AccountRef?.name || "Expense";
          const acctId = d.AccountRef?.value ? String(d.AccountRef.value) : "";
          const amt = num(l.Amount);
          expenses.push({
            description: `${acctName}${e.EntityRef?.name ? ` — ${e.EntityRef.name}` : ""} (${String(e.TxnDate || "").slice(0, 10)})`,
            net: amt,
            sourceRef: docRef,
          });
          // Roll up by the payer's own account id (fall back to name if id missing).
          const key = acctId || `name:${acctName}`;
          const cur = byAcct.get(key) || { accountId: acctId, accountName: acctName, net: 0 };
          cur.net = num(cur.net) + amt;
          byAcct.set(key, cur);
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
  const byAccount = Array.from(byAcct.values()).map((a) => ({ ...a, net: Math.round((a.net + Number.EPSILON) * 100) / 100 }));
  return { expenses, byAccount, errors };
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
        zeroOutExpenses: num((r as any).zeroOutExpenses ?? 1) !== 0,
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
      zeroOutExpenses: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      const zo = input.zeroOutExpenses ? 1 : 0;
      await db.run(sql`INSERT INTO interco_recharge_config
        (payerClientId, counterpartyName, revenueAccount, expenseAccount, payerClearingAccount, counterpartyClearingAccount, hstRatePct, chargeHst, zeroOutExpenses, updatedAt)
        VALUES (${input.payerClientId}, ${input.counterpartyName}, ${input.revenueAccount}, ${input.expenseAccount}, ${input.payerClearingAccount}, ${input.counterpartyClearingAccount}, ${input.hstRatePct}, ${input.chargeHst ? 1 : 0}, ${zo}, ${Date.now()})
        ON CONFLICT(payerClientId) DO UPDATE SET
          counterpartyName=${input.counterpartyName}, revenueAccount=${input.revenueAccount},
          expenseAccount=${input.expenseAccount}, payerClearingAccount=${input.payerClearingAccount},
          counterpartyClearingAccount=${input.counterpartyClearingAccount},
          hstRatePct=${input.hstRatePct}, chargeHst=${input.chargeHst ? 1 : 0}, zeroOutExpenses=${zo}, updatedAt=${Date.now()}`);
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
      // Fall back to the saved config for any blank field (the form may show placeholders).
      await ensureRechargeSchema();
      const cfgRow: any = (await getDb().run(sql`SELECT * FROM interco_recharge_config WHERE payerClientId=${input.payerClientId} LIMIT 1`));
      const cfg = (cfgRow?.rows ?? cfgRow ?? [])[0] || {};
      try {
        const { expenses, byAccount, errors } = await pullExpenses(cr.conn, input.startDate, input.endDate);
        const draft = buildRecharge({
          periodLabel: input.periodLabel || `${input.startDate} → ${input.endDate}`,
          payerName: input.payerName,
          counterpartyName: input.counterpartyName || cfg.counterpartyName || "",
          revenueAccount: input.revenueAccount || cfg.revenueAccount || "",
          expenseAccount: input.expenseAccount || cfg.expenseAccount || "",
          hstRatePct: input.hstRatePct,
          chargeHst: input.chargeHst,
          expenses,
        });
        const zeroOut = num((cfg as any).zeroOutExpenses ?? 1) !== 0;
        return { ok: true as const, draft, pulled: expenses.length, errors, byAccount, zeroOut };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("bridge_not_returning_data")) return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
        return { ok: false as const, error: msg };
      }
    }),

  /** FIG POSTS IT LIVE — create the real Invoice (payer) + Bill (counterparty).
   *  Requires approve:true + both connections NATIVE. Refuses rather than guesses. */
  post: staffQuery
    .input(z.object({
      payerClientId: z.number(),
      payerName: z.string(),
      counterpartyName: z.string().optional(),
      counterpartyClientId: z.number().optional(),
      revenueAccount: z.string().optional(),
      expenseAccount: z.string().optional(),
      hstRatePct: z.number().default(13),
      chargeHst: z.boolean().default(true),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodLabel: z.string().default(""),
      approve: z.literal(true),
    }))
    .mutation(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      const cfgRow: any = (await db.run(sql`SELECT * FROM interco_recharge_config WHERE payerClientId=${input.payerClientId} LIMIT 1`));
      const cfg = (cfgRow?.rows ?? cfgRow ?? [])[0] || {};
      const counterpartyName = input.counterpartyName || cfg.counterpartyName || "";
      const revenueAccount = input.revenueAccount || cfg.revenueAccount || "";
      const expenseAccount = input.expenseAccount || cfg.expenseAccount || "";
      if (!counterpartyName || !revenueAccount || !expenseAccount) return { ok: false as const, error: "config_incomplete", detail: "Need counterparty + revenue + expense accounts (save the client config or fill the form)." };

      // resolve counterparty client
      let cpId = input.counterpartyClientId ?? 0;
      if (!cpId) {
        const key = `%${counterpartyName.split(/\s+/)[0].toLowerCase()}%`;
        const rows = (await db.all(sql`SELECT id FROM clients WHERE lower(name) LIKE ${key} OR lower(company) LIKE ${key} ORDER BY id ASC LIMIT 1`)) as any[];
        cpId = rows[0]?.id ?? 0;
      }
      if (!cpId) return { ok: false as const, error: "counterparty_not_found", detail: `No client matched "${counterpartyName}".` };

      // pull expenses + build to get the subtotal + per-account rollup (for zero-out)
      const cr = await getConnectionForClient(input.payerClientId);
      if ("error" in cr) return { ok: false as const, error: `payer: ${cr.error}` };
      let subtotal = 0;
      let breakdown: { accountId: string; accountName: string; net: number }[] = [];
      try {
        const { expenses, byAccount } = await pullExpenses(cr.conn, input.startDate, input.endDate);
        breakdown = byAccount;
        const draft = buildRecharge({
          periodLabel: input.periodLabel || `${input.startDate} → ${input.endDate}`,
          payerName: input.payerName, counterpartyName, revenueAccount, expenseAccount,
          hstRatePct: input.hstRatePct, chargeHst: input.chargeHst, expenses,
        });
        subtotal = draft.invoice.subtotal;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("bridge_not_returning_data")) return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
        return { ok: false as const, error: msg };
      }
      if (!(subtotal > 0)) return { ok: false as const, error: "nothing_to_post", detail: "No expenses found for this period." };

      // ZERO-OUT (default on, e.g. Alderson): the invoice credits the SAME expense
      // accounts so the payer's expenses + HST both net to $0. Config can turn it off.
      const zeroOut = num((cfg as any).zeroOutExpenses ?? 1) !== 0;

      return await postRecharge({
        payerClientId: input.payerClientId, counterpartyClientId: cpId,
        payerName: input.payerName, counterpartyName,
        revenueAccount, expenseAccount,
        hstRatePct: input.hstRatePct, chargeHst: input.chargeHst,
        subtotal, periodLabel: input.periodLabel || `${input.startDate} → ${input.endDate}`,
        zeroOut, expenseBreakdown: breakdown,
      });
    }),

  /** INTERCO RECONCILIATION CHECK — pull both reciprocal clearing-account balances
   *  live and confirm they offset to zero. Read-only; the auditable proof the
   *  intercompany is settled. counterparty resolved by id or by name. */
  reconcileCheck: staffQuery
    .input(z.object({
      payerClientId: z.number(),
      payerClearingAccount: z.string(),
      counterpartyClientId: z.number().optional(),
      counterpartyName: z.string().optional(),
      counterpartyClearingAccount: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureRechargeSchema();
      // FALLBACK to the saved config when the form passed blanks (placeholders).
      const cfgRow: any = (await db.run(sql`SELECT * FROM interco_recharge_config WHERE payerClientId=${input.payerClientId} LIMIT 1`));
      const cfg = (cfgRow?.rows ?? cfgRow ?? [])[0] || {};
      const counterpartyName = input.counterpartyName || cfg.counterpartyName || "";
      const payerClearing = input.payerClearingAccount || cfg.payerClearingAccount || cfg.clearingAccount || "";
      const cpClearing = input.counterpartyClearingAccount || cfg.counterpartyClearingAccount || "";
      if (!payerClearing || !cpClearing) return { ok: false as const, error: "clearing_accounts_not_set", detail: "Set both clearing-account names (payer + counterparty) or save the client config." };

      // Resolve the counterparty client (explicit id wins; else match by name).
      let cpId = input.counterpartyClientId ?? 0;
      if (!cpId && counterpartyName) {
        const key = `%${counterpartyName.split(/\s+/)[0].toLowerCase()}%`;
        const rows = (await db.all(sql`SELECT id, name FROM clients WHERE lower(name) LIKE ${key} OR lower(company) LIKE ${key} ORDER BY id ASC LIMIT 1`)) as any[];
        cpId = rows[0]?.id ?? 0;
      }
      if (!cpId) return { ok: false as const, error: "counterparty_not_found", detail: `Could not match a client for "${counterpartyName || "(blank)"}". Type the counterparty name in the field.` };

      const payerConn = await getConnectionForClient(input.payerClientId);
      if ("error" in payerConn) return { ok: false as const, error: `payer: ${payerConn.error}` };
      const cpConn = await getConnectionForClient(cpId);
      if ("error" in cpConn) return { ok: false as const, error: `counterparty: ${cpConn.error}` };

      try {
        const payerAcct = await accountBalanceByName(payerConn.conn, payerClearing);
        const cpAcct = await accountBalanceByName(cpConn.conn, cpClearing);
        if (!payerAcct.found) return { ok: false as const, error: "payer_clearing_account_not_found", candidates: payerAcct.candidates };
        if (!cpAcct.found) return { ok: false as const, error: "counterparty_clearing_account_not_found", candidates: cpAcct.candidates };
        const result = checkClearingRecon(payerAcct.balance, cpAcct.balance);
        return {
          ok: true as const,
          result,
          payerAccount: payerAcct.matchedName,
          counterpartyAccount: cpAcct.matchedName,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/async ack|non-JSON|Make bridge/i.test(msg)) return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
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
