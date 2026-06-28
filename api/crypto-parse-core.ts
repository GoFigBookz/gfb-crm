/**
 * CRYPTO REPORT PARSER — pure, forgiving CSV/table reader.
 * =============================================================================
 * Markie gets a REPORT from the client (Adbank, Motion Invest) — not a wallet
 * login — and every exchange formats differently. So this detects the columns by
 * header synonyms instead of assuming one layout, and maps each row to a
 * normalized CryptoTxn the ACB engine understands.
 *
 * Recognizes buys, sells, sends/spends, receipts, and MINING/STAKING/airdrop
 * rewards (Adbank mines) — rewards are an `acquire` at fair-market-value AND
 * flagged as income (business income to a crypto company), which the UI surfaces.
 *
 * Inputs:  raw CSV/TSV text (paste or file).
 * Outputs: { rows: ParsedRow[], warnings: string[], columns } — rows are
 *          editable in the UI before the ACB engine runs.
 * Errors:  pure — unrecognized rows are skipped WITH a warning, never thrown.
 * =============================================================================
 */
import type { CryptoDirection } from "./crypto-core";

export interface ParsedRow {
  date: string;          // yyyy-mm-dd
  asset: string;         // ticker, upper-case
  direction: CryptoDirection;
  qty: number;
  cadValue: number;      // 0 if the report didn't give one (priced later via CoinGecko)
  feeCad: number;
  income: boolean;       // mining/staking/reward/airdrop → business income to flag
  rawType: string;       // the original type/side text, for review
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
  columns: Record<string, string | null>; // which header we matched for each field
}

const SYNONYMS: Record<string, string[]> = {
  date: ["date", "time", "timestamp", "date(utc)", "date (utc)", "trade date", "datetime", "created at", "completed at"],
  asset: ["asset", "symbol", "currency", "coin", "token", "base currency", "ticker", "instrument"],
  qty: ["amount", "quantity", "qty", "units", "size", "volume", "filled"],
  cadValue: ["cad value", "value (cad)", "value cad", "cad", "total (cad)", "total cad", "proceeds", "subtotal", "fiat amount", "total value", "amount (cad)", "cad amount", "total"],
  fee: ["fee", "fees", "commission", "fee (cad)", "fee cad", "trading fee"],
  type: ["type", "side", "transaction type", "activity", "action", "operation", "kind", "category"],
};

const ACQUIRE_WORDS = ["buy", "bought", "purchase", "purchased", "receive", "received", "deposit", "credit", "in", "long"];
const DISPOSE_WORDS = ["sell", "sold", "sale", "send", "sent", "withdraw", "withdrawal", "spend", "spent", "payment", "paid", "debit", "out", "short"];
const INCOME_WORDS = ["mining", "mined", "mine", "reward", "rewards", "staking", "stake", "interest", "airdrop", "income", "earn"];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/^"|"$/g, "");

function splitLine(line: string, delim: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === delim && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim().replace(/^"|"$/g, ""));
}

function matchHeader(headers: string[], field: string): number {
  const syns = SYNONYMS[field];
  // exact first, then contains
  for (let i = 0; i < headers.length; i++) if (syns.includes(headers[i])) return i;
  for (let i = 0; i < headers.length; i++) if (syns.some((s) => headers[i].includes(s))) return i;
  return -1;
}

const toNum = (s: string) => { const n = parseFloat(String(s ?? "").replace(/[$,\s]/g, "").replace(/[()]/g, "")); return Number.isFinite(n) ? Math.abs(n) : 0; };

function toIsoDate(s: string): string {
  const t = String(s ?? "").trim();
  // already iso-ish
  const iso = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // dd/mm/yyyy or mm/dd/yyyy → assume dd/mm if first >12, else mm/dd
  const dmy = t.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    let a = +dmy[1], b = +dmy[2];
    const day = a > 12 ? a : b, mon = a > 12 ? b : a;
    return `${dmy[3]}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return t;
}

function classify(typeText: string): { direction: CryptoDirection; income: boolean } | null {
  const t = norm(typeText);
  if (!t) return null;
  const income = INCOME_WORDS.some((w) => t.includes(w));
  if (income) return { direction: "acquire", income: true };
  if (ACQUIRE_WORDS.some((w) => t === w || t.includes(w))) return { direction: "acquire", income: false };
  if (DISPOSE_WORDS.some((w) => t === w || t.includes(w))) return { direction: "dispose", income: false };
  return null;
}

export function parseCryptoCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], warnings: ["Need a header row plus at least one transaction."], columns: {} };

  const delim = (lines[0].match(/\t/) ? "\t" : (lines[0].split(";").length > lines[0].split(",").length ? ";" : ","));
  const headers = splitLine(lines[0], delim).map(norm);
  const idx = {
    date: matchHeader(headers, "date"),
    asset: matchHeader(headers, "asset"),
    qty: matchHeader(headers, "qty"),
    cadValue: matchHeader(headers, "cadValue"),
    fee: matchHeader(headers, "fee"),
    type: matchHeader(headers, "type"),
  };
  const columns: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(idx)) columns[k] = v >= 0 ? headers[v] : null;

  if (idx.date < 0 || idx.asset < 0 || idx.qty < 0 || idx.type < 0) {
    warnings.push("Couldn't find all of date / asset / amount / type columns — check the report has a header row.");
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const get = (j: number) => (j >= 0 && j < cells.length ? cells[j] : "");
    const cls = classify(get(idx.type));
    if (!cls) { warnings.push(`Row ${i}: couldn't tell if "${get(idx.type) || "(blank type)"}" is a buy or sell — skipped.`); continue; }
    const qty = toNum(get(idx.qty));
    const asset = norm(get(idx.asset)).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!asset || qty <= 0) { warnings.push(`Row ${i}: missing asset or amount — skipped.`); continue; }
    rows.push({
      date: toIsoDate(get(idx.date)),
      asset,
      direction: cls.direction,
      qty,
      cadValue: toNum(get(idx.cadValue)),
      feeCad: toNum(get(idx.fee)),
      income: cls.income,
      rawType: get(idx.type),
    });
  }
  if (!rows.length && !warnings.length) warnings.push("No transactions recognized.");
  return { rows, warnings, columns };
}
