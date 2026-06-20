/**
 * FIGGY JR — MONTH-END CLOSE STATUS (pure core)
 * =============================================================================
 * Computes "where is this client in their month-end close" from cheap, reliable
 * signals: the client's filing config (HST period, fiscal year-end), the count
 * of transactions still awaiting review/posting (Triage queue), and the close
 * checklist %. PURE functions — no DB, no network, no clock except the `asOf`
 * you pass in — so it's deterministic and unit-tested (like the vendor brain
 * core). The tRPC layer (`month-end-router.ts`) gathers the inputs and calls
 * these; a portfolio board and the auto-driven checklist reuse the SAME core.
 *
 * Design notes:
 *  - This layer is INTENTIONALLY config + cheap-signal driven, not a live-QBO
 *    fan-out (that would hammer the Make ops cap on a portfolio load). Live-QBO
 *    enrichment (HST owing for the period, A/P–A/R aging) layers on top later
 *    and is best-effort.
 *  - "Filed?" is judged by a stored last-filed date vs the period end — honest:
 *    if we don't have that signal we say "unknown", never a false green.
 * =============================================================================
 */

export type HstPeriod = "monthly" | "quarterly" | "annual";
export type Traffic = "green" | "yellow" | "red";
export type ClientType = "monthly" | "quarterly" | "annual" | "payroll" | "wholesale";

/** Wholesale = flow-through (we just resell QBO). It has no books to close, no
 *  quote, and no recurring compliance tasks. Everything else is operational. */
export function isOperationalClient(clientType: string | null | undefined): boolean {
  return (clientType || "monthly") !== "wholesale";
}

/** Should this client surface on the close board for the month containing `asOf`?
 *  - wholesale → never (it's not a bookkeeping engagement)
 *  - monthly / payroll, or ANY payroll client → always (monthly cadence)
 *  - quarterly → only in the months right after a calendar quarter ends
 *    (Jan, Apr, Jul, Oct)
 *  - annual → only within 3 months after the fiscal year-end month
 *  This is what lets the board hide the annual/quarterly one-offs you don't
 *  need to look at every month. */
export function isRelevantForPeriod(
  c: { clientType?: string | null; hasPayroll?: boolean | null; yearEndMonth?: string | null },
  asOf: Date = new Date(),
): boolean {
  const type = (c.clientType || "monthly") as ClientType;
  if (type === "wholesale") return false;
  if (c.hasPayroll || type === "monthly" || type === "payroll") return true;
  const m = asOf.getMonth(); // 0-11
  if (type === "quarterly") return m === 0 || m === 3 || m === 6 || m === 9; // Jan/Apr/Jul/Oct
  if (type === "annual") {
    // Year-end month → relevant in fye month + next 3 (the close window).
    const fyeIdx = c.yearEndMonth ? MONTHS.indexOf(c.yearEndMonth as MonthAbbr) : 11; // default Dec
    if (fyeIdx < 0) return true;
    const since = (m - fyeIdx + 12) % 12;
    return since <= 3;
  }
  return true;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export type MonthAbbr = (typeof MONTHS)[number];

const DAY = 86_400_000;
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY);
}
/** Add `n` whole months to a date (UTC), clamping the day to month length. */
function addMonths(d: Date, n: number): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return r;
}
/** Last day (23:59:59.999 not needed — we use date math) of a month, UTC. */
function endOfMonth(year: number, monthIdx0: number): Date {
  return new Date(Date.UTC(year, monthIdx0 + 1, 0));
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------------
// HST / GST status
// ----------------------------------------------------------------------------
export type HstStatus = {
  applicable: boolean;
  period: HstPeriod | null;
  /** the most-recently-ENDED filing period as of `asOf` (the one that needs filing) */
  periodLabel: string | null;
  periodEnd: string | null;   // YYYY-MM-DD
  dueDate: string | null;     // YYYY-MM-DD
  filed: boolean | null;      // null = unknown (no last-filed signal)
  overdue: boolean;
  daysToDue: number | null;   // negative = past due
  status: Traffic;
  reason: string;
};

/**
 * Compute the HST filing status for the most recent ended period.
 * CRA due dates: monthly & quarterly filers — 1 month after period end;
 * annual filers — 3 months after fiscal year end (common case; sole-prop
 * June-15 nuance not modelled — flagged, never auto-trusted).
 */
export function computeHstStatus(opts: {
  hasHST: boolean;
  period: HstPeriod | null | undefined;
  asOf: Date;
  lastFiled?: Date | null;
  /** fiscal year-end month (1-12) — needed only for annual filers */
  fiscalYearEndMonth?: number | null;
}): HstStatus {
  const { hasHST, asOf } = opts;
  if (!hasHST || !opts.period) {
    return {
      applicable: false, period: opts.period ?? null, periodLabel: null, periodEnd: null,
      dueDate: null, filed: null, overdue: false, daysToDue: null, status: "green",
      reason: hasHST ? "HST registered but no filing period set" : "Not HST registered",
    };
  }
  const period = opts.period;
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth(); // 0-11

  let periodEnd: Date;
  let periodLabel: string;
  let dueMonthsAfter = 1;

  if (period === "monthly") {
    // most recent fully-ended month = previous calendar month
    periodEnd = endOfMonth(y, m - 1);
    periodLabel = `${MONTHS[periodEnd.getUTCMonth()]} ${periodEnd.getUTCFullYear()}`;
  } else if (period === "quarterly") {
    // most recent ended calendar quarter
    const qIdx = Math.floor(m / 3);        // current quarter 0-3
    const endIdx0 = qIdx * 3 - 1;          // last month of the PREVIOUS quarter
    periodEnd = endOfMonth(y, endIdx0);
    const q = Math.floor(periodEnd.getUTCMonth() / 3) + 1;
    periodLabel = `Q${q} ${periodEnd.getUTCFullYear()}`;
  } else {
    // annual: period end = the most recent fiscal year-end on/before asOf
    dueMonthsAfter = 3;
    const fyeMonth0 = (opts.fiscalYearEndMonth ?? 12) - 1;
    let end = endOfMonth(y, fyeMonth0);
    if (end.getTime() > asOf.getTime()) end = endOfMonth(y - 1, fyeMonth0);
    periodEnd = end;
    periodLabel = `FY ${periodEnd.getUTCFullYear()}`;
  }

  const dueDate = addMonths(periodEnd, dueMonthsAfter);
  const filed = opts.lastFiled != null ? opts.lastFiled.getTime() >= periodEnd.getTime() : null;
  const daysToDue = daysBetween(dueDate, asOf);
  const overdue = filed === false ? asOf.getTime() > dueDate.getTime() : (filed == null ? asOf.getTime() > dueDate.getTime() : false);

  let status: Traffic;
  let reason: string;
  if (filed === true) {
    status = "green"; reason = `${periodLabel} filed`;
  } else if (overdue) {
    status = "red"; reason = `${periodLabel} OVERDUE (was due ${ymd(dueDate)})`;
  } else if (daysToDue <= 14) {
    status = "yellow"; reason = `${periodLabel} due ${ymd(dueDate)} (${daysToDue}d)`;
  } else {
    status = filed == null ? "yellow" : "green";
    reason = filed == null ? `${periodLabel} — filing status unknown` : `${periodLabel} due ${ymd(dueDate)}`;
  }

  return {
    applicable: true, period, periodLabel, periodEnd: ymd(periodEnd), dueDate: ymd(dueDate),
    filed, overdue, daysToDue, status, reason,
  };
}

// ----------------------------------------------------------------------------
// Fiscal year-end status
// ----------------------------------------------------------------------------
export type YearEndStatus = {
  applicable: boolean;
  fyeMonth: MonthAbbr | null;
  lastFyeDate: string | null;
  daysSinceFye: number | null;
  status: Traffic;
  reason: string;
};

/** Status of the most recent fiscal year-end (is the year-end close likely due/late). */
export function computeYearEndStatus(opts: {
  yearEndMonth: MonthAbbr | null | undefined;
  asOf: Date;
}): YearEndStatus {
  const { yearEndMonth, asOf } = opts;
  if (!yearEndMonth) {
    return { applicable: false, fyeMonth: null, lastFyeDate: null, daysSinceFye: null, status: "green", reason: "No fiscal year-end set" };
  }
  const mIdx = MONTHS.indexOf(yearEndMonth);
  if (mIdx < 0) {
    return { applicable: false, fyeMonth: null, lastFyeDate: null, daysSinceFye: null, status: "green", reason: "Unrecognized year-end month" };
  }
  let fye = endOfMonth(asOf.getUTCFullYear(), mIdx);
  if (fye.getTime() > asOf.getTime()) fye = endOfMonth(asOf.getUTCFullYear() - 1, mIdx);
  const days = daysBetween(asOf, fye);

  // Year-end work typically wraps in the months after FYE; flag as it ages.
  let status: Traffic;
  let reason: string;
  if (days <= 90) { status = "green"; reason = `Year-end ${ymd(fye)} (${days}d ago)`; }
  else if (days <= 180) { status = "yellow"; reason = `Year-end ${ymd(fye)} — ${days}d ago, wrap up`; }
  else { status = "red"; reason = `Year-end ${ymd(fye)} — ${days}d ago, overdue`; }

  return { applicable: true, fyeMonth: yearEndMonth, lastFyeDate: ymd(fye), daysSinceFye: days, status, reason };
}

// ----------------------------------------------------------------------------
// Overall close status (the per-client traffic light)
// ----------------------------------------------------------------------------
export type CloseStatus = {
  status: Traffic;
  reasons: string[];
  toReview: number;
  checklistPercent: number | null;
  hst: HstStatus;
  yearEnd: YearEndStatus;
};

const worse = (a: Traffic, b: Traffic): Traffic => {
  const rank = { green: 0, yellow: 1, red: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
};

/** Roll the signals into one client-level traffic light + the reasons behind it. */
export function rollUpCloseStatus(opts: {
  toReview: number;
  checklistPercent?: number | null;
  hst: HstStatus;
  yearEnd: YearEndStatus;
}): CloseStatus {
  const { toReview, hst, yearEnd } = opts;
  const checklistPercent = opts.checklistPercent ?? null;
  const reasons: string[] = [];
  let status: Traffic = "green";

  if (toReview > 20) { status = worse(status, "red"); reasons.push(`${toReview} transactions awaiting review`); }
  else if (toReview > 0) { status = worse(status, "yellow"); reasons.push(`${toReview} transactions awaiting review`); }

  if (hst.applicable) { status = worse(status, hst.status); if (hst.status !== "green") reasons.push(hst.reason); }
  if (yearEnd.applicable) { status = worse(status, yearEnd.status); if (yearEnd.status !== "green") reasons.push(yearEnd.reason); }

  if (checklistPercent != null && checklistPercent < 100) {
    const sev: Traffic = checklistPercent < 50 ? "yellow" : "yellow";
    status = worse(status, sev);
    reasons.push(`Close checklist ${checklistPercent}%`);
  }

  if (reasons.length === 0) reasons.push("Up to date");
  return { status, reasons, toReview, checklistPercent, hst, yearEnd };
}
