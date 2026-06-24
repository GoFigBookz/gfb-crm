/**
 * QBO CASH-FLOW SNAPSHOT (Markie 2026-06-24 — the real priority)
 * =============================================================================
 * Per client, cheaply, from the daily QBO sync: cash position, money in vs out,
 * to-post hygiene, a stale-feed (disconnect) proxy, and — the big one — whether
 * CAD cash covers the upcoming payroll run (USD-paid clients need a CAD transfer).
 *
 * Bank balances / credit-card / uncategorized come from the already-synced Chart
 * of Accounts (qbo_accounts) → ZERO extra QBO calls. AP needs one Bill query;
 * staleness needs one TransactionList. AR reuses synced invoices. The "actual"
 * bank balance / live feed status isn't in the accounting API (Markie's call:
 * QBO book balance + stale-feed flag for now), so staleness is the disconnect
 * proxy. All report parsing is defensive — never throws, returns nulls on a
 * shape we haven't seen.
 */

const USD = "usd";

export interface BankAccountLine { name: string; balance: number; currency: string; type: string; staleDays: number | null }
export interface BankBreakdown {
  cashTotal: number; cashCad: number; cashUsd: number; creditCardOwed: number;
  uncategorizedBalance: number; uncategorizedCount: number;
  bankAccounts: BankAccountLine[];
}

/** Roll the synced Chart of Accounts into a cash picture. Bank → cash (split by
 *  currency for the USD→CAD transfer call), Credit Card → owed, Uncategorized /
 *  Ask-My-Accountant → to-post hygiene. */
export function bankBreakdownFromAccounts(
  rows: Array<{ name?: string | null; accountType?: string | null; currentBalance?: number | null; currencyRef?: string | null; active?: boolean | null }>,
): BankBreakdown {
  let cashCad = 0, cashUsd = 0, creditCardOwed = 0, uncategorizedBalance = 0, uncategorizedCount = 0;
  const bankAccounts: BankAccountLine[] = [];
  for (const a of rows) {
    if (a.active === false) continue;
    const type = (a.accountType || "").toLowerCase();
    const bal = Number(a.currentBalance) || 0;
    const cur = (a.currencyRef || "").toLowerCase();
    const name = a.name || "(unnamed)";
    if (/uncategor|ask my accountant/i.test(name)) {
      if (bal !== 0) { uncategorizedBalance += Math.abs(bal); uncategorizedCount++; }
    }
    if (type === "bank") {
      if (cur === USD) cashUsd += bal; else cashCad += bal;
      bankAccounts.push({ name, balance: bal, currency: cur === USD ? "USD" : "CAD", type: "Bank", staleDays: null });
    } else if (type === "credit card" || type === "creditcard") {
      creditCardOwed += Math.abs(bal);
      bankAccounts.push({ name, balance: bal, currency: cur === USD ? "USD" : "CAD", type: "Credit Card", staleDays: null });
    }
  }
  return { cashTotal: cashCad + cashUsd, cashCad, cashUsd, creditCardOwed, uncategorizedBalance, uncategorizedCount, bankAccounts };
}

/** Periods per year for a CRM payroll frequency. "self"/unknown → 0 (no run). */
export function periodsPerYear(freq: string | null | undefined): number {
  switch ((freq || "").toLowerCase()) {
    case "weekly": return 52;
    case "bi-weekly": case "biweekly": return 26;
    case "semi-monthly": case "semi_monthly": return 24;
    case "monthly": return 12;
    default: return 0;
  }
}

/** Estimate the CAD cash an upcoming payroll RUN will need: gross per period
 *  across active, non-contractor employees, grossed up ~12% for employer CPP/EI
 *  + remittances (a planning estimate, clearly labelled in the UI). */
export function estimateUpcomingPayroll(
  employees: Array<{ payType?: string | null; annualSalary?: number | null; hourlyRate?: number | null; hoursPerWeek?: number | null; isActive?: boolean | null; isContractor?: boolean | null }>,
  freq: string | null | undefined,
): number | null {
  const ppy = periodsPerYear(freq);
  if (ppy === 0) return null;
  const weeksPerPeriod = 52 / ppy;
  let gross = 0;
  for (const e of employees) {
    if (e.isActive === false || e.isContractor === true) continue;
    if ((e.payType || "salary") === "hourly") {
      gross += (Number(e.hourlyRate) || 0) * (Number(e.hoursPerWeek) || 0) * weeksPerPeriod;
    } else if ((e.payType || "salary") === "salary") {
      gross += (Number(e.annualSalary) || 0) / ppy;
    } // commission/contract excluded from a fixed-run estimate
  }
  if (gross <= 0) return null;
  return Math.round(gross * 1.12 * 100) / 100; // + employer burden
}

/** Approximate the next pay date from a frequency (amount matters more than the
 *  exact day; this just gives the cockpit a near horizon). */
export function nextPayrollDate(freq: string | null | undefined, from: Date): Date | null {
  const ppy = periodsPerYear(freq);
  if (ppy === 0) return null;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0);
  switch ((freq || "").toLowerCase()) {
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "bi-weekly": case "biweekly": d.setDate(d.getDate() + 14); break;
    case "semi-monthly": case "semi_monthly": d.setDate(d.getDate() <= 15 ? 15 : 0 /* last day rollover */); if (d.getDate() === 0) { d.setMonth(d.getMonth() + 1, 0); } break;
    case "monthly": d.setMonth(d.getMonth() + 1, 1); break;
  }
  return d;
}

/** Per-account days-since-last-transaction from a QBO TransactionList report.
 *  Returns the worst (max) staleness + the names of accounts past `thresholdDays`.
 *  Defensive: an unrecognised report shape yields an empty result, not a throw. */
export function staleFeedFromTransactionList(
  report: any,
  now: Date,
  thresholdDays = 10,
): { perAccount: Record<string, number>; maxStaleDays: number | null; staleAccounts: string[] } {
  const empty = { perAccount: {} as Record<string, number>, maxStaleDays: null as number | null, staleAccounts: [] as string[] };
  try {
    const cols: any[] = report?.Columns?.Column ?? [];
    const colType = (c: any): string => String(c?.ColType ?? c?.ColTitle ?? "").toLowerCase();
    let dateIdx = cols.findIndex((c) => /date/.test(colType(c)));
    let acctIdx = cols.findIndex((c) => /account/.test(colType(c)));
    if (dateIdx < 0) dateIdx = 0;
    if (acctIdx < 0) acctIdx = -1; // no account column → realm-level only

    const lastByAccount: Record<string, number> = {};
    let lastOverall = 0;
    const walk = (row: any) => {
      const cd: any[] = row?.ColData;
      if (Array.isArray(cd) && cd.length) {
        const dv = cd[dateIdx]?.value;
        const t = dv ? Date.parse(String(dv)) : NaN;
        if (!isNaN(t)) {
          lastOverall = Math.max(lastOverall, t);
          const acct = acctIdx >= 0 ? String(cd[acctIdx]?.value || "").trim() : "";
          if (acct) lastByAccount[acct] = Math.max(lastByAccount[acct] || 0, t);
        }
      }
      for (const k of (row?.Rows?.Row ?? [])) walk(k);
    };
    for (const r of (report?.Rows?.Row ?? [])) walk(r);

    const dayMs = 86400000;
    const perAccount: Record<string, number> = {};
    for (const [acct, t] of Object.entries(lastByAccount)) perAccount[acct] = Math.floor((now.getTime() - t) / dayMs);
    let maxStaleDays: number | null = null;
    if (Object.keys(perAccount).length) maxStaleDays = Math.max(...Object.values(perAccount));
    else if (lastOverall) maxStaleDays = Math.floor((now.getTime() - lastOverall) / dayMs);
    const staleAccounts = Object.entries(perAccount).filter(([, d]) => d >= thresholdDays).map(([a]) => a);
    return { perAccount, maxStaleDays, staleAccounts };
  } catch {
    return empty;
  }
}
