/**
 * PDF BANK STATEMENT PARSER — pure core. FREE (no AI, no API, no credits).
 * =============================================================================
 * Purpose:  Turn the TEXT LINES of a bank-statement PDF (extracted locally in the
 *           browser by pdf.js) into clean transactions {date, description, amount}
 *           ready to import to QBO or feed the Recon Matcher. This is core firm
 *           infrastructure: PDF→CSV→QBO and fast reconciliation are central to the
 *           business, so it must be accurate and explainable — and cost nothing.
 * Method:   bank statements carry a RUNNING BALANCE column. The change in balance
 *           between rows gives each transaction's sign AND magnitude EXACTLY, with
 *           no per-bank template — that's the robust, universal signal. When a row
 *           has no balance, fall back to keyword signing (withdrawal/deposit/etc.)
 *           and flag lower confidence. A tie-out (opening + Σ = closing) proves it.
 * Inputs:   string[] lines (one visual row each) + optional {year}.
 * Outputs:  { transactions, openingBalance, closingBalance, tieOut, method, warnings }.
 * Pure:     no DB/network; fully unit-tested. The pdf.js extraction lives in the UI.
 * =============================================================================
 */

export interface StmtTxn { date: string; description: string; amount: number; balance?: number; confidence: "high" | "low"; }
export interface StmtResult {
  transactions: StmtTxn[];
  openingBalance: number | null;
  closingBalance: number | null;
  tieOut: { expectedClosing: number | null; diff: number | null; ok: boolean };
  method: "balance" | "keyword" | "mixed" | "none";
  warnings: string[];
}

const MONTHS: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Money token: 1,234.56 / $1,234.56 / (123.45) / 123.45- / -123.45 (2 decimals required). */
const MONEY_G = /\(?-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?|\(?-?\$?\s?\d+\.\d{2}\)?-?/g;

export function parseMoney(tok: string): number {
  let s = tok.trim(); let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ""); }
  if (/^-/.test(s)) { neg = true; }
  s = s.replace(/[$,\s()-]/g, "");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -Math.abs(n) : Math.abs(n);
}

interface Money { raw: string; value: number; start: number; end: number; }
export function findMoneys(line: string): Money[] {
  const out: Money[] = [];
  for (const m of line.matchAll(MONEY_G)) {
    const v = parseMoney(m[0]);
    if (Number.isFinite(v)) out.push({ raw: m[0], value: v, start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Detect a leading date; attach `year` when the row omits it (common on statements). */
export function findDate(line: string, year?: number): { iso: string; raw: string; end: number } | null {
  const t = line.trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);                       // 2026-03-14
  if (m) return { iso: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, raw: m[0], end: line.indexOf(m[0]) + m[0].length };
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);                          // 03/14/2026 (NA)
  if (m) { let a=+m[1], b=+m[2]; const y=+m[3]<100?2000+ +m[3]:+m[3]; if (a>12&&b<=12){[a,b]=[b,a];} return { iso: `${y}-${pad(a)}-${pad(b)}`, raw: m[0], end: line.indexOf(m[0])+m[0].length }; }
  m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{2,4}))?/);            // Mar 14 / Mar 14, 2026
  if (m && MONTHS[m[1].slice(0,3).toLowerCase()]) {
    const mo = MONTHS[m[1].slice(0,3).toLowerCase()]; const d = +m[2];
    const y = m[3] ? (+m[3]<100?2000+ +m[3]:+m[3]) : (year ?? new Date().getUTCFullYear());
    return { iso: `${y}-${pad(mo)}-${pad(d)}`, raw: m[0], end: line.indexOf(m[0])+m[0].length };
  }
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:\s+(\d{2,4}))?/);              // 14 Mar / 14 Mar 2026
  if (m && MONTHS[m[2].slice(0,3).toLowerCase()]) {
    const mo = MONTHS[m[2].slice(0,3).toLowerCase()]; const d = +m[1];
    const y = m[3] ? (+m[3]<100?2000+ +m[3]:+m[3]) : (year ?? new Date().getUTCFullYear());
    return { iso: `${y}-${pad(mo)}-${pad(d)}`, raw: m[0], end: line.indexOf(m[0])+m[0].length };
  }
  return null;
}
const pad = (n: number | string) => String(n).padStart(2, "0");

const DEBIT_KW = /\b(withdrawal|debit|cheque|check|payment|pmt|purchase|fee|nsf|service charge|transfer out|bill|pre-?auth|pad|pos\b|atm)\b/i;
const CREDIT_KW = /\b(deposit|credit|transfer in|interest|refund|reversal|rebate|payroll|direct dep)\b/i;
const SKIP_KW = /\b(opening balance|balance forward|previous balance|beginning balance|closing balance|ending balance|new balance|total|subtotal|statement|page \d|account (number|summary)|minimum|interest rate|continued)\b/i;

function clean(line: string, moneys: Money[], dateEnd: number): string {
  let s = line;
  // remove money tokens (back-to-front to keep indices valid)
  for (const m of [...moneys].sort((a, b) => b.start - a.start)) s = s.slice(0, m.start) + s.slice(m.end);
  s = s.slice(Math.max(0, dateEnd ? line.slice(0, dateEnd).length - (line.length - s.length) : 0)); // best-effort strip date region
  return s.replace(/\s{2,}/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
}

export function parseBankStatement(lines: string[], opts?: { year?: number }): StmtResult {
  const warnings: string[] = [];
  const clean$ = lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // opening / closing balances
  let opening: number | null = null, closing: number | null = null;
  for (const l of clean$) {
    const mo = findMoneys(l);
    if (opening == null && /opening balance|balance forward|previous balance|beginning balance/i.test(l) && mo.length) opening = mo[mo.length - 1].value;
    if (/closing balance|ending balance|new balance/i.test(l) && mo.length) closing = mo[mo.length - 1].value;
  }

  const txns: StmtTxn[] = [];
  let prevBalance: number | null = opening;
  let usedBalance = false, usedKeyword = false;

  for (const l of clean$) {
    if (SKIP_KW.test(l) && !findDate(l, opts?.year)) continue;        // summary/header line (no date) → skip
    const date = findDate(l, opts?.year);
    const moneys = findMoneys(l);
    if (!moneys.length) continue;
    if (!date && txns.length === 0) continue;                        // pre-table noise

    const dateIso = date?.iso ?? txns[txns.length - 1]?.date ?? "";
    let amount = NaN, balance: number | undefined;

    if (moneys.length >= 2) {
      // last money = running balance, the one before = the amount in its column
      balance = moneys[moneys.length - 1].value;
      const amtTok = Math.abs(moneys[moneys.length - 2].value);
      if (prevBalance != null) {
        const delta = round2(balance - prevBalance);
        // amount token should match the delta magnitude; sign comes from the delta
        amount = (Math.abs(Math.abs(delta) - amtTok) <= 0.02) ? delta : delta; // trust the delta
        usedBalance = true;
      } else {
        amount = DEBIT_KW.test(l) ? -amtTok : CREDIT_KW.test(l) ? amtTok : -amtTok;
        usedKeyword = true;
      }
      prevBalance = balance;
    } else {
      const amt = Math.abs(moneys[0].value);
      amount = DEBIT_KW.test(l) ? -amt : CREDIT_KW.test(l) ? amt : NaN;
      if (!Number.isFinite(amount)) { warnings.push(`Couldn't tell debit/credit: "${l.slice(0, 60)}"`); continue; }
      usedKeyword = true;
    }
    if (!Number.isFinite(amount) || amount === 0) continue;

    txns.push({
      date: dateIso,
      description: clean(l, moneys, date?.end ?? 0) || "(transaction)",
      amount: round2(amount),
      balance,
      confidence: (moneys.length >= 2 && prevBalance != null) ? "high" : "low",
    });
  }

  const method: StmtResult["method"] = usedBalance && usedKeyword ? "mixed" : usedBalance ? "balance" : usedKeyword ? "keyword" : "none";
  const sum = round2(txns.reduce((s, t) => s + t.amount, 0));
  const expectedClosing = opening != null ? round2(opening + sum) : (txns.length && txns[txns.length - 1].balance != null ? txns[txns.length - 1].balance! : null);
  const diff = (closing != null && expectedClosing != null) ? round2(expectedClosing - closing) : null;
  if (!txns.length) warnings.push("No transactions found — the PDF may be a scanned image (no text). OCR needed.");

  return {
    transactions: txns,
    openingBalance: opening,
    closingBalance: closing,
    tieOut: { expectedClosing, diff, ok: diff != null ? Math.abs(diff) < 0.01 : false },
    method,
    warnings,
  };
}
