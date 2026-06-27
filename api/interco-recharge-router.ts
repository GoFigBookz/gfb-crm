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
import { createRouter, staffQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { buildRecharge, round2, type RechargeExpense } from "./interco-recharge-core";
import { checkClearingRecon } from "./interco-recon-core";
import { postRecharge } from "./interco-recharge-poster";

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];
const normName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Normalize a posted QBO Invoice or Bill into a flat, display-ready record. */
function normalizeDoc(e: any, type: "invoice" | "bill") {
  const lines = (e.Line ?? [])
    .filter((l: any) => l.DetailType === "SalesItemLineDetail" || l.DetailType === "AccountBasedExpenseLineDetail")
    .map((l: any) => {
      const sid = l.SalesItemLineDetail, aed = l.AccountBasedExpenseLineDetail;
      return {
        description: l.Description || sid?.ItemRef?.name || aed?.AccountRef?.name || "",
        account: sid?.ItemRef?.name || aed?.AccountRef?.name || "",
        amount: num(l.Amount),
      };
    });
  const subtotal = Math.round((lines.reduce((s: number, l: any) => s + l.amount, 0) + Number.EPSILON) * 100) / 100;
  return {
    type,
    docNumber: e.DocNumber || String(e.Id || ""),
    id: String(e.Id || ""),
    date: String(e.TxnDate || "").slice(0, 10),
    party: type === "invoice" ? (e.CustomerRef?.name || "") : (e.VendorRef?.name || ""),
    lines,
    subtotal,
    hst: Math.round((num(e.TxnTaxDetail?.TotalTax) + Number.EPSILON) * 100) / 100,
    total: Math.round((num(e.TotalAmt) + Number.EPSILON) * 100) / 100,
    balance: Math.round((num(e.Balance) + Number.EPSILON) * 100) / 100,
  };
}

/** Pull Alderson's HST/GST account balance(s). For a pure-ITC entity this is the
 *  unbilled HST sitting in the books (incl. any late prior-period bill). The recharge
 *  must charge exactly this much output HST so the account nets to $0 on posting. */
async function pullHstAccountBalance(conn: any): Promise<{ accounts: { name: string; balance: number; type: string }[]; net: number }> {
  const accts = arr(await qboRequest(conn, `/query?query=${encodeURIComponent("SELECT * FROM Account MAXRESULTS 1000")}`), "Account");
  // Include HST/GST payable + recoverable AND the HST SUSPENSE account (Markie: total
  // the suspense too — QBO parks the net there on filing). Skip P&L (expense/income).
  const hst = accts
    .filter((a: any) => /hst|gst|sales tax|tax suspense|hst suspense|gst suspense|suspense/i.test(a.Name || "") && /liabilit|asset|payable|receivable/i.test(`${a.AccountType || ""} ${a.AccountSubType || ""}`) && !/expense|income/i.test(a.AccountType || ""))
    .map((a: any) => ({ name: a.Name, balance: num(a.CurrentBalance), type: a.AccountType }));
  const net = hst.reduce((s: number, a: any) => s + a.balance, 0);
  return { accounts: hst, net: Math.round((net + Number.EPSILON) * 100) / 100 };
}

/** BILLABLE-DRIVEN pull — THE recharge source. Returns every expense LINE marked
 *  Billable (and not yet invoiced) to the counterparty (Ovita Holdings), grouped by the
 *  payer's own expense account. This is what QBO's billable-expenses feature tracks:
 *  it captures exactly what's been flagged — any date, any line type — and EXCLUDES
 *  anything already invoiced (status becomes "HasBeenBilled"), so it never double-bills.
 *  Marking the Feb exception billable → it shows up here. Bank charges excluded. */
async function pullBillableExpenses(conn: any, cpKey: string): Promise<{ byAccount: ExpenseByAccount[]; subtotal: number; hstActual: number; count: number; minDate: string; maxDate: string }> {
  const q = (s: string) => qboRequest(conn, `/query?query=${encodeURIComponent(s)}`);
  // Item → its expense account, for item-based billable lines.
  const itemMap = new Map<string, { acctId: string; acctName: string }>();
  try {
    for (const it of arr(await q(`SELECT Id, Name, ExpenseAccountRef FROM Item MAXRESULTS 1000`), "Item")) {
      if (it.ExpenseAccountRef?.value) itemMap.set(String(it.Id), { acctId: String(it.ExpenseAccountRef.value), acctName: it.ExpenseAccountRef.name || it.Name });
    }
  } catch { /* item lookup best-effort */ }
  const byAcct = new Map<string, ExpenseByAccount>();
  let subtotal = 0, hstActual = 0, count = 0, minDate = "", maxDate = "";
  // NO date range — billable status is the filter. Pull the most recent bills/expenses
  // (unbilled billables are recent) and keep only the ones flagged Billable to the
  // counterparty. This is QBO's "unbilled billable charges" for that customer.
  for (const entity of ["Bill", "Purchase"] as const) {
    for (const e of arr(await q(`SELECT * FROM ${entity} ORDER BY TxnDate DESC MAXRESULTS 1000`), entity)) {
      let hasBillable = false;
      for (const l of e.Line ?? []) {
        const ab = l.AccountBasedExpenseLineDetail, ib = l.ItemBasedExpenseLineDetail, d = ab || ib;
        if (!d) continue;
        if (String(d.BillableStatus || "") !== "Billable") continue;            // only un-invoiced billables
        const cust = String(d.CustomerRef?.name || "");
        if (cpKey && !(cust && normName(cust).includes(cpKey))) continue;       // must be billed TO the counterparty
        let acctId = "", acctName = "Expense";
        if (ab) { acctId = String(ab.AccountRef?.value || ""); acctName = ab.AccountRef?.name || "Expense"; }
        else { const m = itemMap.get(String(ib.ItemRef?.value || "")); acctId = m?.acctId || ""; acctName = m?.acctName || `Item: ${ib.ItemRef?.name || "?"}`; }
        if (isNonBillableAccount(acctName)) continue;                            // skip bank charges
        const amt = num(l.Amount);
        subtotal += amt; hasBillable = true;
        const key = acctId || `name:${acctName}`;
        const cur = byAcct.get(key) || { accountId: acctId, accountName: acctName, net: 0 };
        cur.net = num(cur.net) + amt; byAcct.set(key, cur);
      }
      if (hasBillable) {
        count++; hstActual += Math.abs(num(e.TxnTaxDetail?.TotalTax));
        const d = String(e.TxnDate || "").slice(0, 10);
        if (d) { if (!minDate || d < minDate) minDate = d; if (!maxDate || d > maxDate) maxDate = d; }
      }
    }
  }
  return {
    byAccount: Array.from(byAcct.values()).map((a) => ({ ...a, net: round2(a.net) })),
    subtotal: round2(subtotal), hstActual: round2(hstActual), count, minDate, maxDate,
  };
}

/** First day of the FISCAL year that contains `endISO`, given the year-end month
 *  (1-12). FY ends the last day of fyeMonth → FY starts the 1st of the next month.
 *  Alderson (Nov 30 YE) → Dec 1; a Dec 31 YE → Jan 1. The hard floor for the recharge
 *  lookback: we capture exceptions back to here, never into a previous fiscal year. */
function fiscalYearStartFor(endISO: string, fyeMonth: number): string {
  const end = new Date(endISO + "T00:00:00Z");
  const startMonthIdx = (fyeMonth % 12);          // 0-based month of FY start (Nov YE=11 → Dec idx 11)
  let start = new Date(Date.UTC(end.getUTCFullYear(), startMonthIdx, 1));
  if (start > end) start = new Date(Date.UTC(end.getUTCFullYear() - 1, startMonthIdx, 1));
  return start.toISOString().slice(0, 10);
}

const MONTH_ABBR3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** The client's fiscal year-end month number (1-12). Default December. */
async function clientFyeMonth(clientId: number): Promise<number> {
  const rows = (await getDb().all(sql`SELECT fiscalYearEndMonth, yearEndMonth FROM clients WHERE id=${clientId} LIMIT 1`)) as any[];
  const r = rows[0] || {};
  const n = Number(r.fiscalYearEndMonth);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  const i = MONTH_ABBR3.indexOf(String(r.yearEndMonth || "").slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : 12;
}

/** Parse a QBO GeneralLedger report → the transaction rows posted to accounts whose
 *  section name matches `acctNameRe` (HST/GST/suspense). Each row = one HST posting. */
function parseGlTxns(report: any, acctNameRe: RegExp): { date: string; type: string; docNum: string; name: string; amount: number }[] {
  const cols: any[] = report?.Columns?.Column ?? [];
  const title = (c: any) => String(c?.ColType ?? c?.ColTitle ?? "").toLowerCase();
  const findCol = (re: RegExp) => cols.findIndex((c) => re.test(title(c)));
  const dateIdx = Math.max(0, findCol(/date/));
  const typeIdx = findCol(/txn_type|type/);
  const docIdx = findCol(/doc_num|num/);
  const nameIdx = findCol(/name|vendor|customer|payee/);
  let amtIdx = findCol(/subt_nat_amount|nat_amount|amount/);
  if (amtIdx < 0) amtIdx = cols.length - 2; // GL: amount is usually 2nd-last (balance is last)
  const out: { date: string; type: string; docNum: string; name: string; amount: number }[] = [];
  const walk = (row: any, acctName: string) => {
    const header = row?.Header?.ColData?.[0]?.value;
    const section = header || acctName;
    const cd: any[] = row?.ColData;
    if (Array.isArray(cd) && cd.length && acctNameRe.test(section || "")) {
      const dv = cd[dateIdx]?.value;
      if (dv && /\d{4}-\d{2}-\d{2}/.test(String(dv))) {
        out.push({
          date: String(dv).slice(0, 10),
          type: typeIdx >= 0 ? String(cd[typeIdx]?.value || "") : "",
          docNum: docIdx >= 0 ? String(cd[docIdx]?.value || "") : "",
          name: nameIdx >= 0 ? String(cd[nameIdx]?.value || "") : "",
          amount: num(amtIdx >= 0 ? cd[amtIdx]?.value : 0),
        });
      }
    }
    for (const k of (row?.Rows?.Row ?? [])) walk(k, section);
  };
  for (const r of (report?.Rows?.Row ?? [])) walk(r, "");
  return out;
}

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
      counterpartyClientId INTEGER,
      periodLabel TEXT NOT NULL,
      periodStart TEXT, periodEnd TEXT,
      subtotal REAL, hst REAL, total REAL,
      reconciled INTEGER DEFAULT 0,
      reconciledAt INTEGER,
      invoiceRef TEXT, billRef TEXT,
      notes TEXT,
      createdAt INTEGER
    )`);
    // counterpartyClientId added after first ship — so a posted period can re-fetch
    // BOTH live QBO docs (invoice from payer, bill from counterparty). Guard existing DBs.
    try { await db.run(sql`ALTER TABLE interco_recharge_log ADD COLUMN counterpartyClientId INTEGER`); } catch { /* exists */ }
    // worksheetJson: a snapshot of what was billed (cost-by-account, HST, excluded,
    // invoice/bill #s) captured AT POST TIME — powers the shareable billback worksheet
    // without needing a live QBO pull, and preserves the audit record of what was billed.
    try { await db.run(sql`ALTER TABLE interco_recharge_log ADD COLUMN worksheetJson TEXT`); } catch { /* exists */ }
    // Shareable read-only billback worksheet links (revocable by token).
    await db.run(sql`CREATE TABLE IF NOT EXISTS interco_recharge_share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logId INTEGER NOT NULL,
      payerClientId INTEGER,
      token TEXT NOT NULL UNIQUE,
      active INTEGER DEFAULT 1,
      createdBy INTEGER,
      createdAt INTEGER,
      revokedAt INTEGER
    )`);
  } catch (e) {
    console.error("[interco-recharge] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}

/** A per-expense-account total for the period (the account ids are the PAYER's own,
 *  read straight off its expense lines — so the zero-out invoice can credit each
 *  account back by exactly what was spent, with NO name guessing). */
export type ExpenseByAccount = { accountId: string; accountName: string; net: number };

/** Accounts that are NEVER recharged to the counterparty — they're the payer's own
 *  banking cost, not a project cost belonging to the other company (Markie 2026-06-26:
 *  "bank charges are not billable back to Holdings"). Conservative, name-based. */
const NON_BILLABLE_ACCT = /bank\s*(charges?|fees?|service)|service\s*charges?|merchant\s*(fees?|charges?)|nsf/i;
function isNonBillableAccount(name: string): boolean { return NON_BILLABLE_ACCT.test(name || ""); }

/** Pull the payer's expense lines (Purchase + Bill) in range → per-line list for the
 *  draft preview + a per-account rollup for the zero-out invoice. Non-billable
 *  accounts (bank charges etc.) are EXCLUDED from both. */
async function pullExpenses(conn: any, start: string, end: string): Promise<{ expenses: RechargeExpense[]; byAccount: ExpenseByAccount[]; excluded: { lines: number; total: number; accounts: string[] }; errors: string[] }> {
  const range = `TxnDate >= '${start}' AND TxnDate <= '${end}'`;
  const expenses: RechargeExpense[] = [];
  const byAcct = new Map<string, ExpenseByAccount>();
  const excludedAccts = new Set<string>();
  let excludedLines = 0, excludedTotal = 0;
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
          // Skip non-billable accounts (bank charges etc.) — not recharged to Holdings.
          if (isNonBillableAccount(acctName)) {
            excludedLines++; excludedTotal += amt; excludedAccts.add(acctName);
            continue;
          }
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
  const excluded = { lines: excludedLines, total: Math.round((excludedTotal + Number.EPSILON) * 100) / 100, accounts: Array.from(excludedAccts) };
  return { expenses, byAccount, excluded, errors };
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
        const { expenses, byAccount, excluded, errors } = await pullExpenses(cr.conn, input.startDate, input.endDate);
        const zeroOut = num((cfg as any).zeroOutExpenses ?? 1) !== 0;
        const draft = buildRecharge({
          periodLabel: input.periodLabel || `${input.startDate} → ${input.endDate}`,
          payerName: input.payerName,
          counterpartyName: input.counterpartyName || cfg.counterpartyName || "",
          revenueAccount: input.revenueAccount || cfg.revenueAccount || "",
          expenseAccount: input.expenseAccount || cfg.expenseAccount || "",
          hstRatePct: input.hstRatePct,
          chargeHst: input.chargeHst,
          expenses,
          zeroOut,
        });
        // HST TIE-OUT: does the recharge's output HST clear Alderson's HST account to $0?
        // If not, a bill isn't captured (e.g. a late prior-period entry) — surface the gap.
        let hstTie: any = null;
        try {
          const hstAcc = await pullHstAccountBalance(cr.conn);
          const rechargeHst = round2(draft.invoice.hst);
          const target = round2(Math.abs(hstAcc.net));   // ITC sitting in the account to clear
          const variance = round2(target - rechargeHst);
          hstTie = {
            hstAccountBalance: round2(hstAcc.net), target, rechargeHst, variance,
            ties: Math.abs(variance) < 1,
            impliedMissingBase: round2(Math.abs(variance) / ((input.hstRatePct || 13) / 100)),
            accounts: hstAcc.accounts,
          };
        } catch (e) { hstTie = { error: e instanceof Error ? e.message : String(e) }; }
        return { ok: true as const, draft, pulled: expenses.length, errors, byAccount, excluded, zeroOut, hstTie };
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
      let excludedSnap: { lines: number; total: number; accounts: string[] } = { lines: 0, total: 0, accounts: [] };
      try {
        const { expenses, byAccount, excluded } = await pullExpenses(cr.conn, input.startDate, input.endDate);
        breakdown = byAccount;
        excludedSnap = excluded;
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

      const periodLabel = input.periodLabel || `${input.startDate} → ${input.endDate}`;
      const result = await postRecharge({
        payerClientId: input.payerClientId, counterpartyClientId: cpId,
        payerName: input.payerName, counterpartyName,
        revenueAccount, expenseAccount,
        hstRatePct: input.hstRatePct, chargeHst: input.chargeHst,
        subtotal, periodLabel,
        zeroOut, expenseBreakdown: breakdown,
      });

      // On a successful live post, record the period to the reconcile log WITH the QBO
      // doc refs + counterparty id, so the panel can re-fetch both documents and show
      // they balance. (Server-side so it's logged even if the UI closes.)
      if (result.ok) {
        const total = round2(result.total);
        const hst = round2(input.chargeHst ? round2(subtotal) * ((input.hstRatePct || 0) / 100) : 0);
        const worksheet = {
          payerName: input.payerName, counterpartyName,
          periodLabel, periodStart: input.startDate, periodEnd: input.endDate,
          byAccount: breakdown, excluded: excludedSnap,
          subtotal: round2(subtotal), hstRatePct: input.hstRatePct, chargeHst: input.chargeHst, hst, total,
          invoiceId: result.invoiceId, billId: result.billId,
          zeroOut, postedAt: new Date().toISOString(),
        };
        let shareToken: string | null = null;
        let drive: any = null;
        try {
          await db.run(sql`INSERT INTO interco_recharge_log
            (payerClientId, counterpartyClientId, periodLabel, periodStart, periodEnd, subtotal, hst, total, reconciled, invoiceRef, billRef, worksheetJson, createdAt)
            VALUES (${input.payerClientId}, ${cpId}, ${periodLabel}, ${input.startDate}, ${input.endDate}, ${round2(subtotal)}, ${hst}, ${total}, 0, ${result.invoiceId}, ${result.billId}, ${JSON.stringify(worksheet)}, ${Date.now()})`);
          // The new log row id (for the auto share link + auto Drive filing).
          const idRow = (await db.all(sql`SELECT id FROM interco_recharge_log WHERE payerClientId=${input.payerClientId} AND invoiceRef=${result.invoiceId} ORDER BY id DESC LIMIT 1`)) as any[];
          const logId = idRow[0]?.id as number | undefined;
          if (logId) {
            // AUTO share link (so the worksheet always has a ready link).
            try {
              shareToken = `bb_${crypto.randomUUID().replace(/-/g, "")}`;
              await db.run(sql`INSERT INTO interco_recharge_share_links (logId, payerClientId, token, active, createdBy, createdAt)
                VALUES (${logId}, ${input.payerClientId}, ${shareToken}, 1, 0, ${Date.now()})`);
            } catch (e) { console.error("[interco-recharge] auto share-link failed:", e instanceof Error ? e.message : e); shareToken = null; }
            // AUTO file the worksheet to BOTH clients' Drive folders (best-effort).
            try {
              const { fileBillbackToDrive } = await import("./billback-drive");
              drive = await fileBillbackToDrive(logId);
            } catch (e) { drive = { ok: false, error: "drive_threw", detail: e instanceof Error ? e.message : String(e) }; }
          }
        } catch (e) { console.error("[interco-recharge] post log insert failed:", e instanceof Error ? e.message : e); }
        return { ...result, counterpartyClientId: cpId, periodLabel, shareToken, drive };
      }
      return result;
    }),

  /** Re-read the POSTED Invoice (payer) + Bill (counterparty) live from QBO so the
   *  panel can show the actual records under the post and confirm they balance. */
  fetchPosted: staffQuery
    .input(z.object({
      payerClientId: z.number(),
      counterpartyClientId: z.number().optional(),
      counterpartyName: z.string().optional(),
      invoiceId: z.string(),
      billId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      let cpId = input.counterpartyClientId ?? 0;
      if (!cpId && input.counterpartyName) {
        const key = `%${input.counterpartyName.split(/\s+/)[0].toLowerCase()}%`;
        const rows = (await db.all(sql`SELECT id FROM clients WHERE lower(name) LIKE ${key} OR lower(company) LIKE ${key} ORDER BY id ASC LIMIT 1`)) as any[];
        cpId = rows[0]?.id ?? 0;
      }
      if (!cpId) return { ok: false as const, error: "counterparty_not_found" };
      const payerConn = await getConnectionForClient(input.payerClientId);
      if ("error" in payerConn) return { ok: false as const, error: `payer: ${payerConn.error}` };
      const cpConn = await getConnectionForClient(cpId);
      if ("error" in cpConn) return { ok: false as const, error: `counterparty: ${cpConn.error}` };
      try {
        const inv = arr(await qboRequest(payerConn.conn, `/query?query=${encodeURIComponent(`SELECT * FROM Invoice WHERE Id = '${input.invoiceId}'`)}`), "Invoice")[0];
        const bill = arr(await qboRequest(cpConn.conn, `/query?query=${encodeURIComponent(`SELECT * FROM Bill WHERE Id = '${input.billId}'`)}`), "Bill")[0];
        if (!inv) return { ok: false as const, error: `invoice ${input.invoiceId} not found in payer's books` };
        if (!bill) return { ok: false as const, error: `bill ${input.billId} not found in counterparty's books` };
        const invoice = normalizeDoc(inv, "invoice");
        const billDoc = normalizeDoc(bill, "bill");
        return {
          ok: true as const,
          invoice, bill: billDoc,
          balances: round2(invoice.total) === round2(billDoc.total),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/async ack|non-JSON|Make bridge/i.test(msg)) return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
        return { ok: false as const, error: msg };
      }
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

  /** HST GAP-FINDER (read-only). Pulls the General Ledger of the HST/GST/suspense
   *  accounts over a WIDE window so it catches exceptions (prior-period bills entered
   *  after filing), then flags which HST transactions fall OUTSIDE the recharge window
   *  [startDate,endDate] — i.e. what the date-range recharge is missing. Nothing posts. */
  hstGapFinder: staffQuery
    .input(z.object({
      payerClientId: z.number(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ledgerFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const cr = await getConnectionForClient(input.payerClientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      // Default the ledger window back 2 years from period end to catch old exceptions.
      const ledgerFrom = input.ledgerFrom || (() => { const d = new Date(input.endDate); d.setUTCFullYear(d.getUTCFullYear() - 2); return d.toISOString().slice(0, 10); })();
      const acctNameRe = /hst|gst|sales tax|suspense/i;
      try {
        const hstAcc = await pullHstAccountBalance(cr.conn);
        const report = await qboRequest(cr.conn, `/reports/GeneralLedger?start_date=${ledgerFrom}&end_date=${input.endDate}&columns=tx_date,txn_type,doc_num,name,subt_nat_amount`);
        const txns = parseGlTxns(report, acctNameRe);
        const within = txns.filter((t) => t.date >= input.startDate && t.date <= input.endDate);
        const outside = txns.filter((t) => !(t.date >= input.startDate && t.date <= input.endDate));
        const sum = (a: any[]) => round2(a.reduce((s, t) => s + Math.abs(num(t.amount)), 0));
        return {
          ok: true as const,
          hstAccounts: hstAcc.accounts, hstAccountNet: hstAcc.net,
          ledgerFrom, window: { start: input.startDate, end: input.endDate },
          ledgerTotal: sum(txns), withinTotal: sum(within), outsideTotal: sum(outside),
          outside: outside.sort((a, b) => a.date.localeCompare(b.date)),
          count: txns.length, outsideCount: outside.length,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/async ack|non-JSON|Make bridge/i.test(msg)) return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
        return { ok: false as const, error: msg };
      }
    }),

  /** BILLABLE RECONCILE (read-only, step 1 of the billable-expenses method). Pulls
   *  ALL of the payer's expenses (Bill + Purchase, account- AND item-based) since the
   *  fiscal-year start, sums the ACTUAL HST on them, and compares to the live HST
   *  account balance. When they tie, that expense set is exactly what must be marked
   *  billable to the counterparty and invoiced. Nothing is written. */
  billableReconcile: staffQuery
    .input(z.object({
      payerClientId: z.number(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const cr = await getConnectionForClient(input.payerClientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      const conn = cr.conn;
      const to = input.to || new Date().toISOString().slice(0, 10);
      const fyeMonth = await clientFyeMonth(input.payerClientId);
      const from = input.from || fiscalYearStartFor(to, fyeMonth);
      const q = (s: string) => qboRequest(conn, `/query?query=${encodeURIComponent(s)}`);
      const range = `TxnDate >= '${from}' AND TxnDate <= '${to}'`;
      // The customer that MUST be attached for the billable to land on the right report.
      await ensureRechargeSchema();
      const cfgRow: any = (await getDb().run(sql`SELECT counterpartyName FROM interco_recharge_config WHERE payerClientId=${input.payerClientId} LIMIT 1`));
      const cpName = String((cfgRow?.rows ?? cfgRow ?? [])[0]?.counterpartyName || "");
      const cpKey = cpName ? normName(cpName.split(/\s+/)[0]) : "";
      let totalExpenses = 0, totalHst = 0, txnCount = 0, itemLines = 0;
      let billableTotal = 0, notBillableTotal = 0;
      const byAcct = new Map<string, { accountName: string; net: number }>();
      const notBillable: { date: string; type: string; docNum: string; name: string; amount: number; account: string; reason: string; customer: string }[] = [];
      try {
        for (const entity of ["Bill", "Purchase"] as const) {
          for (const e of arr(await q(`SELECT * FROM ${entity} WHERE ${range} MAXRESULTS 1000`), entity)) {
            txnCount++;
            totalHst += Math.abs(num(e.TxnTaxDetail?.TotalTax));
            const docRef = e.DocNumber || String(e.Id);
            const nameRef = e.EntityRef?.name || e.VendorRef?.name || "";
            const dateRef = String(e.TxnDate || "").slice(0, 10);
            for (const l of e.Line ?? []) {
              const ab = l.AccountBasedExpenseLineDetail, ib = l.ItemBasedExpenseLineDetail;
              const d = ab || ib;
              if (!d) continue;
              const nm = ab ? (ab.AccountRef?.name || "Expense") : `Item: ${ib.ItemRef?.name || "?"}`;
              if (ab && isNonBillableAccount(nm)) continue;   // skip bank charges
              if (ib) itemLines++;
              const amt = num(l.Amount);
              totalExpenses += amt;
              const cur = byAcct.get(nm) || { accountName: nm, net: 0 };
              cur.net += amt; byAcct.set(nm, cur);
              // SPOT CHECK: a line only lands on the counterparty's billable report if it
              // is marked Billable AND has the right CUSTOMER (Ovita Holdings) attached.
              const status = String(d.BillableStatus || "NotBillable");
              const custName = String(d.CustomerRef?.name || "");
              const isBillable = status === "Billable" || status === "HasBeenBilled";
              const custOk = !cpKey || (custName && normName(custName).includes(cpKey));
              if (isBillable && custName && custOk) billableTotal += amt;
              else {
                notBillableTotal += amt;
                const reason = !isBillable ? "not marked billable"
                  : !custName ? "billable but NO customer attached"
                  : `billable to "${custName}" — not ${cpName}`;
                notBillable.push({ date: dateRef, type: entity, docNum: docRef, name: nameRef, amount: round2(amt), account: nm, reason, customer: custName });
              }
            }
          }
        }
        const hstAcc = await pullHstAccountBalance(conn);
        const target = round2(Math.abs(hstAcc.net));
        totalHst = round2(totalHst);
        const variance = round2(target - totalHst);
        return {
          ok: true as const, from, to,
          totalExpenses: round2(totalExpenses), totalHst,
          hstAccountBalance: round2(hstAcc.net), hstAccounts: hstAcc.accounts,
          variance, ties: Math.abs(variance) < 1,
          txnCount, itemLines,
          billableTotal: round2(billableTotal), notBillableTotal: round2(notBillableTotal),
          notBillableCount: notBillable.length,
          notBillable: notBillable.sort((a, b) => a.date.localeCompare(b.date)),
          byAccount: Array.from(byAcct.values()).map((a) => ({ ...a, net: round2(a.net) })).sort((a, b) => b.net - a.net),
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
      payerClientId: z.number(), counterpartyClientId: z.number().optional(), periodLabel: z.string(),
      periodStart: z.string().optional(), periodEnd: z.string().optional(),
      subtotal: z.number(), hst: z.number(), total: z.number(),
      reconciled: z.boolean().default(false),
      invoiceRef: z.string().optional(), billRef: z.string().optional(), notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      await db.run(sql`INSERT INTO interco_recharge_log
        (payerClientId, counterpartyClientId, periodLabel, periodStart, periodEnd, subtotal, hst, total, reconciled, reconciledAt, invoiceRef, billRef, notes, createdAt)
        VALUES (${input.payerClientId}, ${input.counterpartyClientId ?? null}, ${input.periodLabel}, ${input.periodStart ?? null}, ${input.periodEnd ?? null},
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

  /** Create a shareable read-only billback worksheet link for a posted period (log row). */
  shareCreate: staffQuery
    .input(z.object({ logId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      const rows = (await db.all(sql`SELECT id, payerClientId FROM interco_recharge_log WHERE id=${input.logId} LIMIT 1`)) as any[];
      if (!rows[0]) return { ok: false as const, error: "period_not_found" };
      // Reuse an existing active link if there is one (idempotent-ish; one link per period).
      const existing = (await db.all(sql`SELECT token FROM interco_recharge_share_links WHERE logId=${input.logId} AND active=1 ORDER BY id DESC LIMIT 1`)) as any[];
      if (existing[0]?.token) return { ok: true as const, token: existing[0].token };
      const token = `bb_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.run(sql`INSERT INTO interco_recharge_share_links (logId, payerClientId, token, active, createdBy, createdAt)
        VALUES (${input.logId}, ${rows[0].payerClientId}, ${token}, 1, ${ctx.user.id}, ${Date.now()})`);
      return { ok: true as const, token };
    }),

  shareRevoke: staffQuery
    .input(z.object({ logId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.run(sql`UPDATE interco_recharge_share_links SET active=0, revokedAt=${Date.now()} WHERE logId=${input.logId} AND active=1`);
      return { ok: true as const };
    }),

  /** File the billback worksheet into BOTH clients' Drive folders (payer + counterparty). */
  fileToDrive: staffQuery
    .input(z.object({ logId: z.number() }))
    .mutation(async ({ input }) => {
      const { fileBillbackToDrive } = await import("./billback-drive");
      return await fileBillbackToDrive(input.logId);
    }),

  /** The active share token for a posted period (so the panel can show/copy the link). */
  shareFor: staffQuery
    .input(z.object({ logId: z.number() }))
    .query(async ({ input }) => {
      await ensureRechargeSchema();
      const rows = (await getDb().all(sql`SELECT token FROM interco_recharge_share_links WHERE logId=${input.logId} AND active=1 ORDER BY id DESC LIMIT 1`)) as any[];
      return { token: rows[0]?.token ?? null };
    }),

  /** LIVE report (staff). Builds the billback worksheet from the BILLABLE expenses
   *  marked to the counterparty (Ovita Holdings) right now — no post needed. Renders at
   *  /report/billback/:clientId so Markie can see exactly what will be billed + the HST. */
  previewWorksheet: staffQuery
    .input(z.object({ payerClientId: z.number() }))
    .query(async ({ input }) => {
      const cr = await getConnectionForClient(input.payerClientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      await ensureRechargeSchema();
      const db = getDb();
      const cfgRow: any = (await db.run(sql`SELECT * FROM interco_recharge_config WHERE payerClientId=${input.payerClientId} LIMIT 1`));
      const cfg = (cfgRow?.rows ?? cfgRow ?? [])[0] || {};
      const counterpartyName = String(cfg.counterpartyName || "");
      const cpKey = counterpartyName ? normName(counterpartyName.split(/\s+/)[0]) : "";
      const rate = (num(cfg.chargeHst ?? 1) !== 0) ? (num(cfg.hstRatePct) || 13) / 100 : 0;
      const clientRow = (await db.all(sql`SELECT name FROM clients WHERE id=${input.payerClientId} LIMIT 1`)) as any[];
      const payerName = clientRow[0]?.name || "Payer";
      try {
        const b = await pullBillableExpenses(cr.conn, cpKey);   // NO date window — billable status is the filter
        const subtotal = round2(b.subtotal);
        const hst = round2(subtotal * rate);
        const hstAcc = await pullHstAccountBalance(cr.conn);
        const target = round2(Math.abs(hstAcc.net));
        return {
          ok: true as const, payerName, counterpartyName,
          from: b.minDate, to: b.maxDate,   // actual span of the billable expenses, not a window
          byAccount: b.byAccount, count: b.count,
          subtotal, hstRatePct: num(cfg.hstRatePct) || 13, chargeHst: rate > 0, hst, total: round2(subtotal + hst),
          hstActualOnBillables: b.hstActual,
          hstAccountBalance: round2(hstAcc.net), hstAccounts: hstAcc.accounts,
          tieVariance: round2(target - hst), ties: Math.abs(round2(target - hst)) < 1,
          generatedAt: new Date().toISOString(),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/async ack|non-JSON|Make bridge/i.test(msg)) return { ok: false as const, error: "bridge_not_returning_data", detail: msg };
        return { ok: false as const, error: msg };
      }
    }),

  // ===== PUBLIC (token-gated, read-only) — the branded billback worksheet =====
  publicView: publicQuery
    .input(z.object({ token: z.string().min(6) }))
    .query(async ({ input }) => {
      await ensureRechargeSchema();
      const db = getDb();
      const link = (await db.all(sql`SELECT * FROM interco_recharge_share_links WHERE token=${input.token} LIMIT 1`))[0] as any;
      if (!link || !link.active) return null;
      const row = (await db.all(sql`SELECT * FROM interco_recharge_log WHERE id=${link.logId} LIMIT 1`))[0] as any;
      if (!row) return null;
      let ws: any = {};
      try { ws = row.worksheetJson ? JSON.parse(row.worksheetJson) : {}; } catch { ws = {}; }
      // Resolve display names (snapshot first; fall back to the client rows).
      let payerName = ws.payerName || "";
      let counterpartyName = ws.counterpartyName || "";
      if (!payerName && row.payerClientId) {
        const c = (await db.all(sql`SELECT name FROM clients WHERE id=${row.payerClientId} LIMIT 1`))[0] as any;
        payerName = c?.name || "Payer";
      }
      if (!counterpartyName && row.counterpartyClientId) {
        const c = (await db.all(sql`SELECT name FROM clients WHERE id=${row.counterpartyClientId} LIMIT 1`))[0] as any;
        counterpartyName = c?.name || "Counterparty";
      }
      return {
        payerName, counterpartyName,
        periodLabel: ws.periodLabel || row.periodLabel,
        periodStart: ws.periodStart || row.periodStart, periodEnd: ws.periodEnd || row.periodEnd,
        byAccount: Array.isArray(ws.byAccount) ? ws.byAccount.map((a: any) => ({ accountName: a.accountName, net: a.net })) : [],
        excluded: ws.excluded || { lines: 0, total: 0, accounts: [] },
        subtotal: num(ws.subtotal ?? row.subtotal),
        hstRatePct: num(ws.hstRatePct ?? 13), chargeHst: ws.chargeHst !== false,
        hst: num(ws.hst ?? row.hst), total: num(ws.total ?? row.total),
        invoiceId: ws.invoiceId || row.invoiceRef || "", billId: ws.billId || row.billRef || "",
        zeroOut: ws.zeroOut !== false,
        reconciled: !!row.reconciled,
        postedAt: ws.postedAt || null,
        generatedAt: new Date().toISOString(),
      };
    }),
});
