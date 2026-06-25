/**
 * TASK DATE RULES (Markie 2026-06-24) — canonical due dates for recurring
 * compliance tasks. Pure + unit-tested so re-dating live tasks is safe.
 *
 *  - Year-end close → the 30th of the month AFTER the fiscal year-end
 *    (Sept year-end → Oct 30). Day clamped to the month's last day.
 *  - HST/GST (quarterly) → the 15th of the month following the quarter end.
 *  - T4 / T4A prep → January 20.
 */

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate(); // day 0 of next month = last day
}

/** Local-noon date (avoids any timezone day-drift when stored/displayed). */
function at(year: number, month1to12: number, day: number): Date {
  const d = Math.min(day, lastDayOfMonth(year, month1to12));
  return new Date(year, month1to12 - 1, d, 12, 0, 0);
}

/** Year-end close: 30th of the month AFTER the year-end month, in the right year. */
export function yearEndCloseDueDate(yearEndMonth: number, periodYear: number): Date {
  let m = yearEndMonth + 1;
  let y = periodYear;
  if (m > 12) { m = 1; y = periodYear + 1; } // Dec year-end → Jan next year
  return at(y, m, 30);
}

/** HST quarterly: 15th of the month after the quarter end. quarterEndMonth ∈ 3,6,9,12. */
export function hstQuarterlyDueDate(quarterEndMonth: number, periodYear: number): Date {
  let m = quarterEndMonth + 1;
  let y = periodYear;
  if (m > 12) { m = 1; y = periodYear + 1; } // Dec quarter → Jan 15 next year
  return at(y, m, 15);
}

/** Nearest calendar quarter-end (3/6/9/12) on or before the given month. */
export function quarterEndForMonth(month1to12: number): number {
  return [3, 6, 9, 12].filter((q) => q <= month1to12).pop() ?? 12;
}

/** T4/T4A prep → Jan 20 of the given filing year. */
export function t4DueDate(filingYear: number): Date {
  return at(filingYear, 1, 20);
}

// =============================================================================
// START + DUE schedules (Markie 2026-06-25). A task has a START (when to begin)
// and a DUE (our internal deadline = one week BEFORE the statutory deadline so
// it's filed with room to spare).
// =============================================================================
const DAY_MS = 86400000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

export type Schedule = { start: Date; due: Date; deadline: Date };

/** Quarterly HST/GST (and WSIB — same cadence). quarterEndMonth ∈ 3,6,9,12.
 *  Statutory deadline = last day of the month AFTER the quarter end (e.g. Q1→Apr 30).
 *  START = the 5th of that month (Apr 5); DUE = one week before the deadline (Apr 23). */
export function hstQuarterlySchedule(quarterEndMonth: number, periodYear: number): Schedule {
  let m = quarterEndMonth + 1, y = periodYear;
  if (m > 12) { m = 1; y += 1; }
  const deadline = at(y, m, lastDayOfMonth(y, m));
  return { start: at(y, m, 5), due: addDays(deadline, -7), deadline };
}

/** Monthly HST/GST. periodMonth = the month being filed; deadline = end of the next month. */
export function hstMonthlySchedule(periodMonth: number, periodYear: number): Schedule {
  let m = periodMonth + 1, y = periodYear;
  if (m > 12) { m = 1; y += 1; }
  const deadline = at(y, m, lastDayOfMonth(y, m));
  return { start: at(y, m, 5), due: addDays(deadline, -7), deadline };
}

/** Annual HST/GST → statutory deadline ≈ 3 months after the fiscal year-end. */
export function hstAnnualSchedule(yearEndMonth: number, periodYear: number): Schedule {
  let m = yearEndMonth + 3, y = periodYear;
  while (m > 12) { m -= 12; y += 1; }
  const deadline = at(y, m, lastDayOfMonth(y, m));
  return { start: at(y, m, 5), due: addDays(deadline, -7), deadline };
}

/** T4/T4A prep — statutory deadline Feb 28; START Jan 15, DUE Feb 15. */
export function t4Schedule(filingYear: number): Schedule {
  return { start: at(filingYear, 1, 15), due: at(filingYear, 2, 15), deadline: at(filingYear, 2, 28) };
}

/** Year-end close — START first of the month after year-end (begin promptly, NOT
 *  weeks later); DUE the 30th of that month. */
export function yearEndSchedule(yearEndMonth: number, periodYear: number): Schedule {
  let m = yearEndMonth + 1, y = periodYear;
  if (m > 12) { m = 1; y += 1; }
  return { start: at(y, m, 1), due: at(y, m, 30), deadline: at(y, m, lastDayOfMonth(y, m)) };
}

/**
 * Given a task's rule type + current due date (+ fiscal year-end / HST period),
 * return the corrected { start, due } — or null if no rule applies. Picks the
 * occurrence nearest the current due so re-running never drifts the year.
 */
export function taskSchedule(
  ruleType: string | null | undefined,
  currentDue: Date | null,
  opts: { yearEndMonth?: number | null; hstPeriod?: string | null },
): Schedule | null {
  const ref = currentDue ?? new Date();
  const rt = (ruleType || "").toLowerCase();
  const nearest = (fn: (y: number) => Schedule): Schedule => {
    const cands = [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1].map(fn);
    return cands.reduce((best, s) => Math.abs(s.due.getTime() - ref.getTime()) < Math.abs(best.due.getTime() - ref.getTime()) ? s : best);
  };

  if (rt.includes("t4")) return nearest(t4Schedule);
  if (rt.includes("year_end") || rt.includes("yearend") || rt.includes("year-end")) {
    if (!opts.yearEndMonth) return null;
    return nearest((y) => yearEndSchedule(opts.yearEndMonth!, y));
  }
  if (rt.includes("wsib")) {
    const qEnd = quarterEndForMonth(ref.getMonth() + 1);
    return nearest((y) => hstQuarterlySchedule(qEnd, y));
  }
  if (rt.includes("hst") || rt.includes("gst")) {
    const period = (opts.hstPeriod || "quarterly").toLowerCase();
    if (period === "monthly") return nearest((y) => hstMonthlySchedule(ref.getMonth() + 1, y));
    if (period === "annual") {
      if (!opts.yearEndMonth) return null;
      return nearest((y) => hstAnnualSchedule(opts.yearEndMonth!, y));
    }
    const qEnd = quarterEndForMonth(ref.getMonth() + 1);
    return nearest((y) => hstQuarterlySchedule(qEnd, y));
  }
  return null;
}

/**
 * Given an existing task's ruleType + current due date (+ optional fiscal year-end
 * month), return the corrected due date per the rules above — or null if no rule
 * applies (leave it alone). Preserves the task's year context.
 */
export function correctedDueDate(
  ruleType: string | null | undefined,
  currentDue: Date | null,
  yearEndMonth: number | null,
): Date | null {
  const ref = currentDue ?? new Date();
  const rt = (ruleType || "").toLowerCase();
  // Pick the occurrence NEAREST the current due date (across last/this/next year)
  // so re-running is idempotent — never drifts a task into a different year.
  const nearest = (fn: (y: number) => Date): Date => {
    const cands = [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1].map(fn);
    return cands.reduce((best, d) => Math.abs(d.getTime() - ref.getTime()) < Math.abs(best.getTime() - ref.getTime()) ? d : best);
  };

  if (rt.includes("year_end") || rt.includes("yearend")) {
    if (!yearEndMonth) return null; // need the fiscal year-end to place it
    return nearest((y) => yearEndCloseDueDate(yearEndMonth, y));
  }
  if (rt.includes("t4")) {
    return nearest((y) => t4DueDate(y));
  }
  if (rt.includes("hst") && rt.includes("quarter")) {
    const qEnd = quarterEndForMonth(ref.getMonth() + 1);
    return nearest((y) => hstQuarterlyDueDate(qEnd, y));
  }
  return null;
}
