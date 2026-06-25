/**
 * BUSINESS TIMEZONE — Go Fig Bookz runs on Ontario time.
 * =============================================================================
 * Every due date/time in the CRM is canonical in America/Toronto (Eastern) —
 * that's where the firm, the clients, payroll and CRA live, so deadlines NEVER
 * move when Markie travels. Ontario, Florida and Playa del Carmen are all Eastern
 * already, so most trips show nothing. When his device is in a genuinely different
 * zone (Mountain, Pacific, Newfoundland, Europe…) we flag it and translate the
 * Eastern time into his local time so he knows when it actually lands.
 *
 * Dependency-free (uses Intl) so it works the same on every device.
 * =============================================================================
 */
export const BUSINESS_TZ = "America/Toronto";
export const BUSINESS_LABEL = "Eastern";

/** Minutes a timezone is offset from UTC at a given instant (EDT = -240). */
function offsetMinutes(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  // Intl renders 24:xx for midnight in some envs — normalise.
  const hour = m.hour === "24" ? 0 : Number(m.hour);
  const asUTC = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), hour, Number(m.minute), Number(m.second));
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function deviceTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || BUSINESS_TZ; }
  catch { return BUSINESS_TZ; }
}

/** Short zone abbreviation for a tz at a given time, e.g. "MDT", "PST". */
export function zoneAbbrev(tz: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch { return ""; }
}

/** Friendly tz name, e.g. "America/Denver" → "Denver". */
export function tzCity(tz: string): string {
  const seg = tz.split("/").pop() || tz;
  return seg.replace(/_/g, " ");
}

export type AwayInfo = {
  away: boolean;
  deviceTz: string;
  deviceCity: string;
  deviceAbbrev: string;
  businessAbbrev: string;
  /** device minus Ontario, in minutes (+ = ahead of Ontario, − = behind). */
  diffMinutes: number;
  /** e.g. "2 hrs behind Ontario" */
  diffLabel: string;
};

/** Is the device in a different wall-clock from Ontario right now, and by how much. */
export function awayInfo(date: Date = new Date()): AwayInfo {
  const dtz = deviceTz();
  const diff = offsetMinutes(dtz, date) - offsetMinutes(BUSINESS_TZ, date);
  const hrs = Math.abs(diff) / 60;
  const hrsLabel = Number.isInteger(hrs) ? `${hrs} hr${hrs === 1 ? "" : "s"}` : `${hrs.toFixed(1)} hrs`;
  return {
    away: diff !== 0,
    deviceTz: dtz,
    deviceCity: tzCity(dtz),
    deviceAbbrev: zoneAbbrev(dtz, date),
    businessAbbrev: zoneAbbrev(BUSINESS_TZ, date),
    diffMinutes: diff,
    diffLabel: diff === 0 ? "same as Ontario" : `${hrsLabel} ${diff < 0 ? "behind" : "ahead of"} Ontario`,
  };
}

/** Wall-clock time of an instant in a given tz, e.g. "5:00 PM". */
export function timeInZone(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
  } catch {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
}

/** Eastern wall-clock for a timed event (the canonical "due" time). */
export function businessTime(date: Date): string {
  return timeInZone(date, BUSINESS_TZ);
}

/**
 * Label for a timed event: Eastern time as primary; when the device is away,
 * append the local equivalent, e.g. "5:00 PM ET (3:00 PM local)".
 */
export function eventTimeLabel(date: Date, info?: AwayInfo): string {
  const a = info ?? awayInfo(date);
  const et = businessTime(date);
  if (!a.away) return et;
  return `${et} ${a.businessAbbrev} (${timeInZone(date, a.deviceTz)} local)`;
}

/**
 * Which calendar DAY a calendar item belongs on — the off-by-a-day fix. All-day
 * events and date-only values (Google all-day events, Google Tasks) are stored at
 * UTC midnight; rendering `new Date(utcMidnight)` in Ontario (UTC-4/-5) lands on
 * the PREVIOUS evening, so the item shows a day early. For any all-day / exact-
 * UTC-midnight value we rebuild the date at LOCAL noon of its UTC calendar day;
 * real timed values (an 8am block, a 2pm meeting) pass through unchanged.
 */
export function placementDate(value: Date | string | number, isAllDay?: boolean): Date {
  const d = new Date(value);
  const midnightUTC = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isAllDay || midnightUTC) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
  return d;
}
