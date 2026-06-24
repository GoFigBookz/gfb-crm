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
  const year = ref.getFullYear();
  const rt = (ruleType || "").toLowerCase();

  if (rt.includes("year_end") || rt.includes("yearend")) {
    if (!yearEndMonth) return null; // need the fiscal year-end to place it
    // Keep the close in the same fiscal cycle the task already targets.
    return yearEndCloseDueDate(yearEndMonth, year);
  }
  if (rt.includes("t4")) {
    return t4DueDate(year);
  }
  if (rt.includes("hst") && rt.includes("quarter")) {
    const qEnd = quarterEndForMonth(ref.getMonth() + 1);
    return hstQuarterlyDueDate(qEnd, year);
  }
  return null;
}
