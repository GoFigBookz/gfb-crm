/**
 * TIMESHEET CORE — shared, pure helpers for importing worked hours from any
 * source (Jobber now, TouchBistro next). Unit-tested.
 *  - easternDayRangeUtc: turn a pay period's local (Eastern) day boundaries into
 *    the exact UTC instants to query, DST-aware — so edge-of-day shifts aren't
 *    missed or double-counted.
 *  - longShiftNote: flag a worker whose LONGEST single shift exceeds the limit
 *    (a likely missed clock-out) so it surfaces on the timesheet for review.
 */

const DEFAULT_TZ = "America/Toronto";

/** Offset (ms) between a given instant's wall-clock in `timeZone` and UTC. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

/** The UTC instant whose wall-clock time in `timeZone` is dateStr + timeStr. */
function wallToUtcISO(dateStr: string, timeStr: string, timeZone: string): string {
  const guess = new Date(`${dateStr}T${timeStr}Z`);
  const off = tzOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - off).toISOString();
}

/** Pay-period [start 00:00 → end 23:59:59] as UTC ISO, in the given TZ (Eastern). */
export function easternDayRangeUtc(startISO: string, endISO: string, timeZone: string = DEFAULT_TZ): { start: string; end: string } {
  return {
    start: wallToUtcISO(startISO, "00:00:00", timeZone),
    end: wallToUtcISO(endISO, "23:59:59", timeZone),
  };
}

/** Hours above which a single shift is suspicious (likely a missed clock-out). */
export const LONG_SHIFT_HOURS = Number(process.env.PAYROLL_LONG_SHIFT_HOURS) || 10;

/** A review note if the worker's longest single shift exceeds the limit, else null. */
export function longShiftNote(maxShiftHours: number, threshold: number = LONG_SHIFT_HOURS): string | null {
  if (maxShiftHours > threshold) {
    return `⚠ Possible missed clock-out: ${maxShiftHours.toFixed(1)}h single shift — verify before running.`;
  }
  return null;
}
