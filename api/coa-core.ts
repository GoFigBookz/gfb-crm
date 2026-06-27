/**
 * CHART OF ACCOUNTS (COA) TOOLKIT — pure core (no I/O).
 * =============================================================================
 * Markie's cleanup workflow: EXPORT a client's chart of accounts → clean it up
 * (externally, in Sheets/Excel, with AI) → COMPARE (esp. Clark OS vs CW, which should
 * "marry each other") → make sure it ties to the accountant's TRIAL BALANCE → apply.
 * This file is the pure brain: normalize accounts, diff two charts, reconcile to a
 * pasted trial balance, build the CSV. Chart of accounts is LOCKED — this tool only
 * EXPORTS + COMPARES + CHECKS; it never edits QBO (push-back is a separate, gated step).
 * =============================================================================
 */

export interface AcctRow {
  num: string;        // account number ("1500")
  name: string;       // "Accounts Receivable"
  type: string;       // QBO AccountType ("Bank", "Accounts Receivable", …)
  subType?: string;   // QBO AccountSubType
  balance: number;    // CurrentBalance
  active?: boolean;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const normName = (s?: string | null) => (s || "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
const normNum = (s?: string | null) => (s || "").trim();

/** CSV of a chart (for the export the client cleans up externally). */
export function buildCoaCsv(rows: AcctRow[]): string {
  const head = ["Number", "Name", "Type", "SubType", "Balance", "Active"];
  const esc = (v: any) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = rows.map((r) => [r.num, r.name, r.type, r.subType ?? "", r.balance, r.active === false ? "no" : "yes"].map(esc).join(","));
  return [head.join(","), ...body].join("\n");
}

export interface CoaDiffEntry {
  num: string;
  a?: AcctRow;        // in chart A (e.g. Clark OS)
  b?: AcctRow;        // in chart B (e.g. Clark CW)
  issue: "only_a" | "only_b" | "name_differs" | "type_differs" | "number_differs" | "match";
}

/**
 * Compare two charts so they can be "married". Primary key = account NUMBER (Markie
 * wants matching numbers across entities); also surfaces same-name/different-number and
 * same-number/different-name so the human sees exactly what to align.
 */
export function diffCharts(a: AcctRow[], b: AcctRow[]): { entries: CoaDiffEntry[]; summary: { match: number; onlyA: number; onlyB: number; mismatches: number } } {
  const byNumA = new Map(a.filter((x) => x.num).map((x) => [normNum(x.num), x]));
  const byNumB = new Map(b.filter((x) => x.num).map((x) => [normNum(x.num), x]));
  const byNameB = new Map(b.map((x) => [normName(x.name), x]));
  const seenB = new Set<string>();
  const entries: CoaDiffEntry[] = [];

  for (const ra of a) {
    const key = normNum(ra.num);
    const rb = key ? byNumB.get(key) : undefined;
    if (rb) {
      seenB.add(key);
      if (normName(ra.name) !== normName(rb.name)) entries.push({ num: ra.num, a: ra, b: rb, issue: "name_differs" });
      else if (ra.type !== rb.type) entries.push({ num: ra.num, a: ra, b: rb, issue: "type_differs" });
      else entries.push({ num: ra.num, a: ra, b: rb, issue: "match" });
    } else {
      // No number match — is the same NAME present under a different number in B?
      const sameName = byNameB.get(normName(ra.name));
      if (sameName && normNum(sameName.num) !== key) { entries.push({ num: ra.num, a: ra, b: sameName, issue: "number_differs" }); seenB.add(normNum(sameName.num)); }
      else entries.push({ num: ra.num, a: ra, issue: "only_a" });
    }
  }
  for (const rb of b) {
    const key = normNum(rb.num);
    if (key && seenB.has(key)) continue;
    if (!key && byNameB.get(normName(rb.name)) && [...entries].some((e) => e.b === rb)) continue;
    if ([...entries].some((e) => e.b === rb)) continue;
    entries.push({ num: rb.num, b: rb, issue: "only_b" });
  }

  const summary = {
    match: entries.filter((e) => e.issue === "match").length,
    onlyA: entries.filter((e) => e.issue === "only_a").length,
    onlyB: entries.filter((e) => e.issue === "only_b").length,
    mismatches: entries.filter((e) => ["name_differs", "type_differs", "number_differs"].includes(e.issue)).length,
  };
  entries.sort((x, y) => order(x.issue) - order(y.issue) || normNum(x.num).localeCompare(normNum(y.num)));
  return { entries, summary };
}
const order = (i: CoaDiffEntry["issue"]) => ({ number_differs: 0, name_differs: 1, type_differs: 2, only_a: 3, only_b: 4, match: 5 }[i]);

/**
 * STANDARD chart-of-accounts templates by business TYPE (Markie: "all construction/trade
 * companies should have similar accounts"). These are STARTING points the human aligns to —
 * never auto-applied (chart is LOCKED). Numbers follow a conventional 1xxx asset / 2xxx
 * liability / 3xxx equity / 4xxx revenue / 5xxx COGS / 6xxx expense layout.
 */
export interface TemplateAcct { num: string; name: string; type: string }
export const COA_TEMPLATES: Record<string, { label: string; accounts: TemplateAcct[] }> = {
  construction: {
    label: "Construction / Trades",
    accounts: [
      { num: "1000", name: "Chequing", type: "Bank" },
      { num: "1010", name: "Savings", type: "Bank" },
      { num: "1100", name: "Accounts Receivable", type: "Accounts Receivable" },
      { num: "1200", name: "Inventory / Materials", type: "Other Current Asset" },
      { num: "1250", name: "Work in Progress", type: "Other Current Asset" },
      { num: "1300", name: "Prepaid Expenses", type: "Other Current Asset" },
      { num: "1500", name: "Vehicles", type: "Fixed Asset" },
      { num: "1510", name: "Equipment & Tools", type: "Fixed Asset" },
      { num: "1590", name: "Accumulated Depreciation", type: "Fixed Asset" },
      { num: "2000", name: "Accounts Payable", type: "Accounts Payable" },
      { num: "2100", name: "Credit Card", type: "Credit Card" },
      { num: "2200", name: "HST/GST Payable", type: "Other Current Liability" },
      { num: "2300", name: "Payroll Liabilities", type: "Other Current Liability" },
      { num: "2400", name: "Holdback Payable", type: "Other Current Liability" },
      { num: "3000", name: "Owner's Equity", type: "Equity" },
      { num: "3100", name: "Retained Earnings", type: "Equity" },
      { num: "4000", name: "Construction Revenue", type: "Income" },
      { num: "4100", name: "Service Revenue", type: "Income" },
      { num: "5000", name: "Materials", type: "Cost of Goods Sold" },
      { num: "5100", name: "Subcontractors", type: "Cost of Goods Sold" },
      { num: "5200", name: "Direct Labour", type: "Cost of Goods Sold" },
      { num: "5300", name: "Equipment Rental", type: "Cost of Goods Sold" },
      { num: "6000", name: "Advertising & Marketing", type: "Expense" },
      { num: "6100", name: "Insurance", type: "Expense" },
      { num: "6200", name: "Office & Admin", type: "Expense" },
      { num: "6300", name: "Vehicle - Fuel", type: "Expense" },
      { num: "6310", name: "Vehicle - Repairs", type: "Expense" },
      { num: "6400", name: "Repairs & Maintenance", type: "Expense" },
      { num: "6500", name: "Professional Fees", type: "Expense" },
      { num: "6600", name: "Wages & Salaries", type: "Expense" },
      { num: "6700", name: "Meals & Entertainment", type: "Expense" },
      { num: "6800", name: "Bank Charges", type: "Expense" },
    ],
  },
};

/** Compare a client's chart to a standard template — what's MISSING vs the standard,
 *  what's EXTRA, what matches. Reuses diffCharts (template = chart B). */
export function diffToTemplate(chart: AcctRow[], templateKey: string) {
  const tpl = COA_TEMPLATES[templateKey];
  if (!tpl) return null;
  const tplRows: AcctRow[] = tpl.accounts.map((t) => ({ num: t.num, name: t.name, type: t.type, balance: 0 }));
  const { entries, summary } = diffCharts(chart, tplRows);
  // In this framing: only_b = in template but NOT in client's chart (a gap to consider).
  return { label: tpl.label, entries, summary: { ...summary, missingFromChart: summary.onlyB, extraInChart: summary.onlyA } };
}

export interface TbLine { num?: string; name: string; balance: number }

/** Parse a pasted accountant's trial balance: "1500  Accounts Receivable  12,345.67" or
 *  CSV-ish "name, balance" / "num, name, balance". Tolerant of $ and commas and tabs. */
export function parseTrialBalance(text: string): TbLine[] {
  const out: TbLine[] = [];
  // Trailing balance token at end of line: optional $/(/-, digits w/ commas, optional decimals, optional )/%.
  const balRe = /[-(]?\$?\s*\d[\d,]*(?:\.\d+)?\)?%?\s*$/;
  for (const raw of (text || "").split("\n")) {
    const line = raw.trim();
    if (!line || /^(account|name|number|total)\b/i.test(line)) continue;
    const m = line.match(balRe);
    if (!m) continue;
    const balTok = m[0].trim();
    const neg = /^\(.*\)$/.test(balTok) || /^-/.test(balTok);
    const mag = Number(balTok.replace(/[()$,%\s]/g, "").replace(/-/g, ""));
    if (!Number.isFinite(mag)) continue;
    const bal = neg ? -Math.abs(mag) : mag;
    // Everything before the balance is num + name (split off a leading account number).
    const rest = line.slice(0, m.index).replace(/[\t,]+$/, "").trim();
    const lead = rest.split(/\s+/)[0] || "";
    const hasNum = /^\d{2,6}$/.test(lead);
    const name = (hasNum ? rest.slice(lead.length) : rest).replace(/[\t,]/g, " ").replace(/\s+/g, " ").trim();
    if (!name && !hasNum) continue;
    out.push({ num: hasNum ? lead : undefined, name, balance: r2(bal) });
  }
  return out;
}

export interface TbReconcileEntry { num?: string; name: string; qbo: number | null; tb: number | null; diff: number; status: "match" | "differs" | "only_qbo" | "only_tb" }

/** Reconcile the QBO chart balances against the accountant's trial balance — the gate
 *  Markie wants BEFORE cleanup: do the numbers tie? Match by number, else by name. */
export function reconcileToTrialBalance(qbo: AcctRow[], tb: TbLine[], tolerance = 0.01): { entries: TbReconcileEntry[]; tied: boolean; mismatches: number } {
  const tbByNum = new Map(tb.filter((t) => t.num).map((t) => [normNum(t.num!), t]));
  const tbByName = new Map(tb.map((t) => [normName(t.name), t]));
  const used = new Set<TbLine>();
  const entries: TbReconcileEntry[] = [];
  for (const a of qbo) {
    const t = (a.num && tbByNum.get(normNum(a.num))) || tbByName.get(normName(a.name));
    if (t) {
      used.add(t);
      const diff = r2(a.balance - t.balance);
      entries.push({ num: a.num, name: a.name, qbo: r2(a.balance), tb: r2(t.balance), diff, status: Math.abs(diff) <= tolerance ? "match" : "differs" });
    } else {
      entries.push({ num: a.num, name: a.name, qbo: r2(a.balance), tb: null, diff: r2(a.balance), status: "only_qbo" });
    }
  }
  for (const t of tb) {
    if (used.has(t)) continue;
    entries.push({ num: t.num, name: t.name, qbo: null, tb: r2(t.balance), diff: r2(-t.balance), status: "only_tb" });
  }
  const mismatches = entries.filter((e) => e.status !== "match").length;
  entries.sort((x, y) => rank(x.status) - rank(y.status) || Math.abs(y.diff) - Math.abs(x.diff));
  return { entries, tied: mismatches === 0, mismatches };
}
const rank = (s: TbReconcileEntry["status"]) => ({ differs: 0, only_qbo: 1, only_tb: 2, match: 3 }[s]);
