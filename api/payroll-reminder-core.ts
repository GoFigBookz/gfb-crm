/**
 * PAYROLL REMINDER DATE CORE — pure, dependency-free, fully testable.
 * =============================================================================
 * The money-critical bit of the recurring payroll reminders: WHICH calendar day
 * each payroll run lands on. Extracted from seed-payroll-recurring.ts so it can be
 * unit-tested in isolation (the seed just maps clients onto these runs + writes
 * tasks/events).
 *
 * Rules (Markie):
 *  - Weekly clients run EVERY Wednesday.
 *  - Biweekly clients run every OTHER Wednesday, measured from a FIXED confirmed
 *    payroll Wednesday (so the cadence never drifts with the server's boot day —
 *    the bug that put runs on a Thursday).
 *  - If a payroll Wednesday is a stat holiday (banks closed), the run moves EARLIER
 *    to the prior business day, flagged so the UI can warn.
 *
 * All math is on YYYY-MM-DD strings via UTC-noon, so it's timezone-independent and
 * a calendar day can't drift.
 * =============================================================================
 */
export type ReminderRun = {
  wedISO: string;       // the payroll Wednesday
  runISO: string;       // when to actually run it (= wedISO unless stat-shifted earlier)
  isBiweekly: boolean;  // true on the every-other-Wednesday beat (biweekly clients fire)
  statShifted: boolean; // true if moved off a stat-holiday Wednesday
};

/** Parse YYYY-MM-DD → a stable UTC-noon Date (no TZ drift on day boundaries). */
function utcNoon(iso: string): Date {
  return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12, 0, 0));
}
function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
/** Whole days between two ISO dates (a − b). */
export function daysBetween(aISO: string, bISO: string): number {
  return Math.round((utcNoon(aISO).getTime() - utcNoon(bISO).getTime()) / 86400000);
}
/** Day of week for a calendar date: 0=Sun … 3=Wed … 6=Sat. */
export function weekdayOf(iso: string): number {
  return utcNoon(iso).getUTCDay();
}
/** Latest business day on/before `iso` that isn't a weekend or a stat holiday. */
export function priorBusinessDay(iso: string, holidays: Set<string>): string {
  let cur = iso;
  for (let i = 0; i < 14; i++) {
    const wd = weekdayOf(cur);
    if (wd !== 0 && wd !== 6 && !holidays.has(cur)) return cur;
    const d = utcNoon(cur);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = toISO(d);
  }
  return cur;
}

/**
 * Every payroll Wednesday in [todayISO, todayISO + windowDays], with its biweekly
 * flag (relative to anchorISO) and stat-holiday shift applied.
 */
export function computeReminderRuns(
  todayISO: string,
  anchorISO: string,
  holidays: Set<string>,
  windowDays = 56,
): ReminderRun[] {
  const out: ReminderRun[] = [];
  const base = utcNoon(todayISO);
  for (let i = 0; i <= windowDays; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    if (d.getUTCDay() !== 3) continue; // Wednesday only
    const wedISO = toISO(d);
    const isBiweekly = ((daysBetween(wedISO, anchorISO) % 14) + 14) % 14 === 0;
    const statShifted = holidays.has(wedISO);
    const runISO = statShifted ? priorBusinessDay(wedISO, holidays) : wedISO;
    out.push({ wedISO, runISO, isBiweekly, statShifted });
  }
  return out;
}
