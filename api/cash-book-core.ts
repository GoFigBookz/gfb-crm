/**
 * CASH BOOK — pure core (deterministic, no I/O).
 * =============================================================================
 * Purpose:  A simple, accurate single-account cash book for micro-clients and
 *           holding companies that don't warrant a full QBO file (Markie: "a cash
 *           book… small amount of business… holding companies… checks and balances
 *           and everything must be accurate"). Money in / money out, categorized,
 *           with a running balance, a bank reconciliation check, and a year-end
 *           category summary Markie uses to prepare the T2.
 * Design:   ONE responsibility per function; client-agnostic; every total rounded
 *           to cents so the books always tie. Amounts are stored as positive
 *           magnitudes with a direction ("in" | "out") — never a signed blob — so
 *           the data is unambiguous and a typo can't silently flip a deposit into
 *           a withdrawal.
 * Inputs:   CashEntry[] (date, direction, amount, category, …), an opening balance.
 * Outputs:  register rows w/ running balance, period/category summaries, a
 *           reconciliation result vs a real bank-statement closing balance.
 * Errors:   validateEntry() surfaces problems (non-positive amount, bad direction)
 *           rather than guessing — fail safely, never post an uncertain figure.
 * =============================================================================
 */

export type Direction = "in" | "out";

export interface CashEntry {
  id?: number;
  entryDate: string | Date;   // ISO string or Date
  direction: Direction;       // in = deposit/receipt, out = payment/withdrawal
  amount: number;             // positive magnitude, dollars
  category?: string | null;   // e.g. "Sales", "Professional fees", "Bank charges"
  description?: string | null;
  reference?: string | null;  // cheque #, transfer id, etc.
  hst?: number | null;        // HST/GST portion of the amount, if tracked (dollars)
  cleared?: boolean;          // has it cleared the bank statement?
}

export interface RegisterRow extends CashEntry {
  signed: number;             // +amount for in, -amount for out
  balance: number;            // running balance after this row
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Signed value of one entry: deposits add, payments subtract. */
export function signedAmount(e: Pick<CashEntry, "direction" | "amount">): number {
  const a = Math.abs(Number(e.amount) || 0);
  return e.direction === "out" ? -a : a;
}

/**
 * Order entries oldest→newest and attach a running balance. Stable: entries on the
 * same day keep their input order (so a same-day deposit-then-payment reads right).
 */
export function buildRegister(entries: CashEntry[], openingBalance = 0): RegisterRow[] {
  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => ms(a.e.entryDate) - ms(b.e.entryDate) || a.i - b.i)
    .map((x) => x.e);
  let bal = r2(openingBalance);
  const rows: RegisterRow[] = [];
  for (const e of sorted) {
    const signed = r2(signedAmount(e));
    bal = r2(bal + signed);
    rows.push({ ...e, signed, balance: bal });
  }
  return rows;
}

/** Closing balance = opening + every signed entry. */
export function closingBalance(entries: CashEntry[], openingBalance = 0): number {
  return r2(entries.reduce((sum, e) => sum + signedAmount(e), openingBalance));
}

export interface CashSummary {
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  net: number;            // totalIn - totalOut
  closingBalance: number; // opening + net
  hstCollected: number;   // HST on money-in entries
  hstPaid: number;        // HST on money-out entries
  count: number;
}

/** Totals over the given entries (optionally pre-filter by date before calling). */
export function summarize(entries: CashEntry[], openingBalance = 0): CashSummary {
  let totalIn = 0, totalOut = 0, hstCollected = 0, hstPaid = 0;
  for (const e of entries) {
    const a = Math.abs(Number(e.amount) || 0);
    const h = Math.abs(Number(e.hst) || 0);
    if (e.direction === "out") { totalOut += a; hstPaid += h; }
    else { totalIn += a; hstCollected += h; }
  }
  totalIn = r2(totalIn); totalOut = r2(totalOut);
  return {
    openingBalance: r2(openingBalance),
    totalIn, totalOut,
    net: r2(totalIn - totalOut),
    closingBalance: r2(openingBalance + totalIn - totalOut),
    hstCollected: r2(hstCollected),
    hstPaid: r2(hstPaid),
    count: entries.length,
  };
}

export interface CategoryTotal {
  category: string;
  direction: Direction;
  total: number;
  hst: number;
  count: number;
}

/**
 * Category totals split by direction — the backbone of the year-end summary Markie
 * hands to the T2. Uncategorized entries roll up under "(uncategorized)" so nothing
 * is silently dropped.
 */
export function categoryTotals(entries: CashEntry[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const e of entries) {
    const cat = (e.category || "").trim() || "(uncategorized)";
    const key = `${e.direction}:${cat}`;
    const cur = map.get(key) || { category: cat, direction: e.direction, total: 0, hst: 0, count: 0 };
    cur.total = r2(cur.total + Math.abs(Number(e.amount) || 0));
    cur.hst = r2(cur.hst + Math.abs(Number(e.hst) || 0));
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort(
    (a, b) => (a.direction === b.direction ? b.total - a.total : a.direction === "out" ? 1 : -1),
  );
}

/** Inclusive [start, end] filter on entryDate (ISO yyyy-mm-dd compares fine here). */
export function inRange(entries: CashEntry[], start?: string, end?: string): CashEntry[] {
  const s = start ? ms(start) : -Infinity;
  // end is inclusive to end-of-day
  const e = end ? ms(end) + 24 * 3600 * 1000 - 1 : Infinity;
  return entries.filter((x) => { const t = ms(x.entryDate); return t >= s && t <= e; });
}

export interface Reconciliation {
  bookBalance: number;        // opening + all entries
  clearedBalance: number;     // opening + only cleared entries
  statementBalance: number;   // the real bank closing figure entered by the user
  difference: number;         // statementBalance - clearedBalance (0 = reconciled)
  reconciled: boolean;
  unclearedCount: number;
  unclearedTotal: number;     // signed total still outstanding (in transit)
}

/**
 * Reconcile against a real bank-statement closing balance. We compare the bank to
 * the CLEARED book balance (uncleared items are still in transit), the way a real
 * bank rec works. reconciled = the cleared book ties to the statement to the cent.
 */
export function reconcile(entries: CashEntry[], statementBalance: number, openingBalance = 0): Reconciliation {
  const cleared = entries.filter((e) => e.cleared);
  const uncleared = entries.filter((e) => !e.cleared);
  const bookBalance = closingBalance(entries, openingBalance);
  const clearedBalance = closingBalance(cleared, openingBalance);
  const difference = r2(statementBalance - clearedBalance);
  return {
    bookBalance,
    clearedBalance,
    statementBalance: r2(statementBalance),
    difference,
    reconciled: Math.abs(difference) < 0.005,
    unclearedCount: uncleared.length,
    unclearedTotal: r2(uncleared.reduce((s, e) => s + signedAmount(e), 0)),
  };
}

export interface EntryProblem { field: string; message: string }

/** Validate one entry before it's saved. Empty array = OK. */
export function validateEntry(e: Partial<CashEntry>): EntryProblem[] {
  const problems: EntryProblem[] = [];
  if (!e.entryDate || isNaN(ms(e.entryDate as any))) problems.push({ field: "entryDate", message: "A valid date is required." });
  if (e.direction !== "in" && e.direction !== "out") problems.push({ field: "direction", message: "Direction must be 'in' or 'out'." });
  const amt = Number(e.amount);
  if (!isFinite(amt) || amt <= 0) problems.push({ field: "amount", message: "Amount must be a positive number." });
  if (e.hst != null) {
    const h = Number(e.hst);
    if (!isFinite(h) || h < 0) problems.push({ field: "hst", message: "HST can't be negative." });
    else if (isFinite(amt) && h > amt + 0.005) problems.push({ field: "hst", message: "HST can't exceed the entry amount." });
  }
  return problems;
}

/**
 * Money-IN categories that are NOT revenue/sales (so they're excluded from the HST
 * line-101 sales figure): owner money put into the business, loan proceeds, and
 * transfers between the owner's own accounts. Matched case-insensitively by substring.
 */
export const NON_REVENUE_IN = ["owner contribution", "owner deposit", "loan", "transfer", "capital", "refund"];

function isRevenueIn(category?: string | null): boolean {
  const c = (category || "").toLowerCase();
  return !NON_REVENUE_IN.some((k) => c.includes(k));
}

export interface HstWorksheet {
  start?: string;
  end?: string;
  line101Sales: number;       // revenue (money-in, net of HST), excluding non-revenue receipts
  line105Collected: number;   // HST/GST collected on sales (line 105)
  line108Itc: number;         // input tax credits — HST/GST paid on expenses (line 108)
  line109NetTax: number;      // net tax = collected - ITCs (line 109)
  owing: number;              // > 0 = remit to CRA; < 0 = refund
  isRefund: boolean;
  salesCount: number;         // # of money-in entries that carried HST
  itcCount: number;           // # of money-out entries that carried HST
  untaxedSales: number;       // revenue money-in with NO hst recorded (flag to confirm)
}

/**
 * Build an HST/GST return worksheet from cash-book entries for a period. Deterministic
 * — purely sums what's recorded; it does NOT decide tax treatment. line 101 excludes
 * non-revenue receipts (owner money, loans, transfers). HONEST: this is a worksheet to
 * confirm + file, NOT an e-filed return; untaxedSales surfaces revenue with no HST so a
 * cash basis / exempt / missed-HST case is visible rather than silently assumed.
 */
export function hstWorksheet(entries: CashEntry[], opts: { start?: string; end?: string } = {}): HstWorksheet {
  const scoped = (opts.start || opts.end) ? inRange(entries, opts.start, opts.end) : entries;
  let line101 = 0, collected = 0, itc = 0, salesCount = 0, itcCount = 0, untaxed = 0;
  for (const e of scoped) {
    const amt = Math.abs(Number(e.amount) || 0);
    const h = Math.abs(Number(e.hst) || 0);
    if (e.direction === "in") {
      if (!isRevenueIn(e.category)) continue; // skip owner money / loans / transfers
      line101 += amt - h;          // sales net of the HST portion
      if (h > 0) { collected += h; salesCount += 1; } else { untaxed += amt; }
    } else {
      if (h > 0) { itc += h; itcCount += 1; }
    }
  }
  const net = r2(collected - itc);
  return {
    start: opts.start, end: opts.end,
    line101Sales: r2(line101),
    line105Collected: r2(collected),
    line108Itc: r2(itc),
    line109NetTax: net,
    owing: net,
    isRefund: net < 0,
    salesCount, itcCount,
    untaxedSales: r2(untaxed),
  };
}

/** A reasonable starter category set for a micro-business cash book (editable/free-text in the UI). */
export const DEFAULT_CATEGORIES: { name: string; direction: Direction }[] = [
  { name: "Sales / revenue", direction: "in" },
  { name: "Owner contribution", direction: "in" },
  { name: "Interest income", direction: "in" },
  { name: "Other income", direction: "in" },
  { name: "Subcontractors", direction: "out" },
  { name: "Materials / supplies", direction: "out" },
  { name: "Rent", direction: "out" },
  { name: "Utilities", direction: "out" },
  { name: "Insurance", direction: "out" },
  { name: "Vehicle / fuel", direction: "out" },
  { name: "Professional fees", direction: "out" },
  { name: "Bank charges", direction: "out" },
  { name: "Office / software", direction: "out" },
  { name: "Meals & entertainment", direction: "out" },
  { name: "Owner draw", direction: "out" },
  { name: "Taxes / HST remittance", direction: "out" },
  { name: "Other expense", direction: "out" },
];
