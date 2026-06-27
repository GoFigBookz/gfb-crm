/**
 * RECONCILIATION MATCHER — pure core.
 * =============================================================================
 * Purpose:  Match a BANK STATEMENT against the QBO transactions for that account
 *           and period, and bucket the result so reconciliation is "drop two
 *           things, get the answer" instead of eyeballing two screens. Pure +
 *           deterministic (no DB, no network) so it's testable and runs anywhere.
 * Inputs:   two transaction lists (statement, books), each {date, description,
 *           amount} with SIGNED amount (+ money in / − money out). A CSV parser
 *           (parseCsvTransactions) turns pasted statement/QBO-register exports into
 *           that shape, tolerating debit/credit or increase/decrease columns.
 * Outputs:  matched / onlyStatement (missing from books) / onlyBooks
 *           (outstanding — e.g. an uncashed cheque) / amount tie-out.
 * Honest limit: this matches the statement to the BOOKS (register). It cannot read
 *           an in-progress QBO reconcile session (those checkmarks aren't in any
 *           API) — and it doesn't need to: matching to the register IS the recon.
 * =============================================================================
 */

export interface ReconTxn {
  date: string;          // raw or ISO; parsed loosely for windowed matching
  description: string;
  amount: number;        // signed: + in, − out
  _ms?: number;          // parsed epoch ms (internal)
  _used?: boolean;       // internal match flag
}

export interface MatchedPair { statement: ReconTxn; books: ReconTxn; dateGapDays: number; }
export interface ReconResult {
  matched: MatchedPair[];
  onlyStatement: ReconTxn[];   // on the bank statement, not in the books → add it
  onlyBooks: ReconTxn[];       // in the books, not on the statement → outstanding/uncleared
  totals: {
    statementIn: number; statementOut: number; statementNet: number;
    booksIn: number; booksOut: number; booksNet: number;
    netDifference: number;     // statementNet − booksNet (0 = ties out)
  };
  counts: { statement: number; books: number; matched: number; onlyStatement: number; onlyBooks: number };
}

const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Loose date parse → epoch ms (handles ISO, MM/DD/YYYY, DD/MM/YYYY, "Jun 3 2026"). */
export function parseDateLoose(s: string): number | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);            // YYYY-MM-DD
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);              // MM/DD/YYYY (NA default)
  if (m) {
    let a = +m[1], b = +m[2]; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (a > 12 && b <= 12) { const tmp = a; a = b; b = tmp; }       // looks like DD/MM
    return Date.UTC(y, a - 1, b);
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

const dayGap = (a?: number, b?: number) => (a == null || b == null) ? 999 : Math.abs(a - b) / 86_400_000;

/** Parse a number out of a cell ("$1,234.56", "(45.00)" = −45, "1234.56-"). */
function num(v: string): number {
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }       // (123) = negative
  if (/-$/.test(s)) { neg = true; s = s.replace(/-$/, ""); }        // trailing minus
  s = s.replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -Math.abs(n) : n;
}

/** Split one line into fields (quote-aware) on a given delimiter. */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Detect the delimiter: comma, tab, or semicolon — whichever yields the most
 *  consistent multi-column rows. Lets Markie paste straight from Excel/Sheets
 *  (tab-separated) or a European CSV, not just a comma file. */
export function detectDelimiter(lines: string[]): string {
  const cands = ["\t", ",", ";"];
  let best = ","; let bestScore = -1;
  for (const d of cands) {
    const counts = lines.slice(0, 10).map((l) => splitLine(l, d).length);
    const max = Math.max(...counts, 1);
    if (max < 2) continue;                                 // no real columns with this delim
    const consistent = counts.filter((c) => c === max).length;
    const score = max * 10 + consistent;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

const findCol = (headers: string[], ...keys: string[]) =>
  headers.findIndex((h) => keys.some((k) => h.toLowerCase().includes(k)));

/**
 * Parse pasted CSV (a bank statement export OR a QBO account-register export) into
 * ReconTxn[]. Handles a single signed Amount column, OR separate debit/credit
 * (withdrawal/deposit), OR QBO's increase/decrease. Skips header/balance/blank rows.
 */
export function parseCsvTransactions(text: string): ReconTxn[] {
  const lines = (text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = detectDelimiter(lines);                    // comma | tab | semicolon
  const splitCsvLine = (l: string) => splitLine(l, delim);
  // header = first line that has a date-ish and an amount-ish column name
  let headerIdx = lines.findIndex((l) => {
    const lo = l.toLowerCase();
    return /date/.test(lo) && /(amount|debit|credit|withdraw|deposit|increase|decrease)/.test(lo);
  });
  if (headerIdx < 0) headerIdx = 0;
  const headers = splitCsvLine(lines[headerIdx]);
  const dateI = findCol(headers, "date");
  const descI = findCol(headers, "description", "payee", "name", "memo", "details", "transaction");
  const amtI = findCol(headers, "amount");
  const debitI = findCol(headers, "debit", "withdrawal", "decrease", "money out", "paid out");
  const creditI = findCol(headers, "credit", "deposit", "increase", "money in", "paid in");

  const out: ReconTxn[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    if (!f.length) continue;
    const rawDate = dateI >= 0 ? f[dateI] : f[0];
    const ms = parseDateLoose(rawDate);
    if (ms == null) continue;                                       // not a transaction row
    let amount = NaN;
    if (amtI >= 0 && f[amtI]) amount = num(f[amtI]);
    if (!Number.isFinite(amount)) {
      const d = debitI >= 0 ? num(f[debitI]) : NaN;
      const c = creditI >= 0 ? num(f[creditI]) : NaN;
      const dv = Number.isFinite(d) ? Math.abs(d) : 0;
      const cv = Number.isFinite(c) ? Math.abs(c) : 0;
      if (dv || cv) amount = cv - dv;
    }
    if (!Number.isFinite(amount) || amount === 0) continue;
    out.push({ date: rawDate, description: descI >= 0 ? (f[descI] || "") : "", amount: money(amount), _ms: ms });
  }
  return out;
}

/**
 * Match statement ↔ books by exact amount within a date window (default 6 days),
 * greedy on the closest date. Returns matched pairs + each side's leftovers + tie-out.
 */
export function matchStatements(statement: ReconTxn[], books: ReconTxn[], opts?: { dateWindowDays?: number }): ReconResult {
  const win = opts?.dateWindowDays ?? 6;
  const stmt = statement.map((t) => ({ ...t, _ms: t._ms ?? parseDateLoose(t.date) ?? undefined, _used: false }));
  const bk = books.map((t) => ({ ...t, _ms: t._ms ?? parseDateLoose(t.date) ?? undefined, _used: false }));

  // index books by amount-in-cents for fast lookup
  const byCents = new Map<number, ReconTxn[]>();
  for (const b of bk) {
    const k = cents(b.amount);
    if (!byCents.has(k)) byCents.set(k, []);
    byCents.get(k)!.push(b);
  }

  const matched: MatchedPair[] = [];
  for (const s of stmt) {
    const cand = byCents.get(cents(s.amount));
    if (!cand) continue;
    let best: ReconTxn | null = null; let bestGap = Infinity;
    for (const b of cand) {
      if (b._used) continue;
      const gap = dayGap(s._ms, b._ms);
      if (gap <= win && gap < bestGap) { best = b; bestGap = gap; }
    }
    if (best) { best._used = true; s._used = true; matched.push({ statement: s, books: best, dateGapDays: Math.round(bestGap) }); }
  }

  const onlyStatement = stmt.filter((t) => !t._used);
  const onlyBooks = bk.filter((t) => !t._used);

  const sumIn = (a: ReconTxn[]) => money(a.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0));
  const sumOut = (a: ReconTxn[]) => money(a.reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0));
  const statementIn = sumIn(stmt), statementOut = sumOut(stmt);
  const booksIn = sumIn(bk), booksOut = sumOut(bk);
  const statementNet = money(statementIn - statementOut), booksNet = money(booksIn - booksOut);

  return {
    matched,
    onlyStatement: onlyStatement.map(({ _used, ...t }) => t),
    onlyBooks: onlyBooks.map(({ _used, ...t }) => t),
    totals: { statementIn, statementOut, statementNet, booksIn, booksOut, booksNet, netDifference: money(statementNet - booksNet) },
    counts: { statement: stmt.length, books: bk.length, matched: matched.length, onlyStatement: onlyStatement.length, onlyBooks: onlyBooks.length },
  };
}

// =============================================================================
// POST-RECONCILIATION CLEANUP (Markie 2026-06-27, backlog #87): after the match,
// flag the things a bookkeeper should chase — stale/uncashed cheques still
// outstanding, and likely duplicate (double-entered) transactions. Read-only +
// deterministic; surfaces a review list, never edits the books.
// =============================================================================

export interface StaleItem extends ReconTxn { ageDays: number; }
export interface DuplicatePair { a: ReconTxn; b: ReconTxn; dayGap: number; reason: string; }
export interface CleanupFlags {
  stale: StaleItem[];           // outstanding (uncleared) items older than the threshold
  duplicates: DuplicatePair[];  // same amount + similar payee within a tight window
  asOfMs: number;
}

/** Reduce a description to a comparison key (drop cheque/ref #s, casing, punctuation). */
function payeeKey(desc: string): string {
  return (desc || "").toUpperCase()
    .replace(/\bCHE?QUE?\b|\bCHK\b|\bCHEQUE\b|\bNO\.?\b|\bREF\b/g, " ")
    .replace(/#?\s*\d+/g, " ")
    .replace(/[^A-Z& ]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

/**
 * Flag post-reconciliation cleanup items.
 *  - stale: items still OUTSTANDING (typically the matcher's `onlyBooks`) whose
 *    date is older than `staleDays` (default 180 = the 6-month CRA staleness mark
 *    for cheques). These are uncashed cheques / uncleared entries to chase or void.
 *  - duplicates: within `allBooks`, two entries with the SAME amount and a similar
 *    payee dated within `dupWindowDays` (default 4) — a likely double-entry.
 * asOfMs defaults to the newest date seen (so it works on historical exports too).
 */
export function findCleanupFlags(
  outstanding: ReconTxn[],
  allBooks: ReconTxn[],
  opts?: { staleDays?: number; dupWindowDays?: number; asOfMs?: number },
): CleanupFlags {
  const staleDays = opts?.staleDays ?? 180;
  const dupWindow = opts?.dupWindowDays ?? 4;
  const ms = (t: ReconTxn) => t._ms ?? parseDateLoose(t.date) ?? undefined;
  const allMs = [...outstanding, ...allBooks].map(ms).filter((x): x is number => x != null);
  const asOf = opts?.asOfMs ?? (allMs.length ? Math.max(...allMs) : Date.now());

  const stale: StaleItem[] = outstanding
    .map((t) => ({ t, m: ms(t) }))
    .filter(({ m }) => m != null && (asOf - (m as number)) / 86_400_000 >= staleDays)
    .map(({ t, m }) => ({ ...t, ageDays: Math.round((asOf - (m as number)) / 86_400_000) }))
    .sort((a, b) => b.ageDays - a.ageDays);

  // Duplicates: group by amount-in-cents, then pair up close-dated, similar-payee rows.
  const byCents = new Map<number, ReconTxn[]>();
  for (const t of allBooks) {
    const k = cents(t.amount);
    if (!byCents.has(k)) byCents.set(k, []);
    byCents.get(k)!.push(t);
  }
  const duplicates: DuplicatePair[] = [];
  for (const group of byCents.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const gap = dayGap(ms(a), ms(b));
        if (gap > dupWindow) continue;
        const ka = payeeKey(a.description), kb = payeeKey(b.description);
        const samePayee = ka && kb && (ka === kb || ka.includes(kb) || kb.includes(ka));
        // Same amount + close date is suspicious; same payee too makes it a strong flag.
        const reason = samePayee
          ? `Same ${money(Math.abs(a.amount))} to "${a.description}" ${Math.round(gap)} day(s) apart`
          : `Two ${money(Math.abs(a.amount))} entries ${Math.round(gap)} day(s) apart`;
        if (samePayee || gap <= 1) duplicates.push({ a, b, dayGap: Math.round(gap), reason });
      }
    }
  }
  return { stale, duplicates, asOfMs: asOf };
}
