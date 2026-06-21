/**
 * Canadian statutory-holiday calendar (Ontario ESA public holidays).
 * =============================================================================
 * The CRM payroll surface is a TIMESHEET that feeds QuickBooks Payroll — so we
 * don't compute net pay here. But a timesheet DOES need to know "is there a stat
 * holiday in this pay period that needs to be paid out?" This module answers that.
 *
 * Ontario's 9 ESA public holidays: New Year's, Family Day, Good Friday, Victoria
 * Day, Canada Day, Labour Day, Thanksgiving, Christmas, Boxing Day. (Civic Holiday
 * in August and Remembrance Day are NOT ESA public holidays in Ontario.)
 *
 * Pure + dependency-free so it's easy to verify.
 * =============================================================================
 */
export type StatHoliday = { date: string; name: string }; // date = YYYY-MM-DD

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Anonymous Gregorian computus → Easter Sunday for a given year. */
export function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);     // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** The nth (1-based) occurrence of a weekday (0=Sun..6=Sat) in a month (0-based). */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

/** Victoria Day = the Monday preceding May 25. */
function victoriaDay(year: number): Date {
  const d = new Date(year, 4, 25); // May 25
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1); // back up to Monday
  return d;
}

/** If a fixed-date holiday lands on a weekend, the observed day shifts (lieu day). */
function observed(d: Date): Date {
  const wd = d.getDay();
  if (wd === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2); // Sat → Mon
  if (wd === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); // Sun → Mon
  return d;
}

/** Ontario ESA public holidays for a calendar year (actual dates, not lieu). */
export function ontarioStatHolidays(year: number): StatHoliday[] {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
  const list: StatHoliday[] = [
    { date: iso(new Date(year, 0, 1)), name: "New Year's Day" },
    { date: iso(nthWeekday(year, 1, 1, 3)), name: "Family Day" },          // 3rd Mon Feb
    { date: iso(goodFriday), name: "Good Friday" },
    { date: iso(victoriaDay(year)), name: "Victoria Day" },
    { date: iso(new Date(year, 6, 1)), name: "Canada Day" },
    { date: iso(nthWeekday(year, 8, 1, 1)), name: "Labour Day" },          // 1st Mon Sep
    { date: iso(nthWeekday(year, 9, 1, 2)), name: "Thanksgiving" },        // 2nd Mon Oct
    { date: iso(new Date(year, 11, 25)), name: "Christmas Day" },
    { date: iso(new Date(year, 11, 26)), name: "Boxing Day" },
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Stat holidays whose actual date falls within [startISO, endISO] inclusive. */
export function statHolidaysInRange(startISO: string, endISO: string): StatHoliday[] {
  if (!startISO || !endISO || endISO < startISO) return [];
  const years = new Set<number>([Number(startISO.slice(0, 4)), Number(endISO.slice(0, 4))]);
  const all: StatHoliday[] = [];
  for (const y of years) if (Number.isFinite(y)) all.push(...ontarioStatHolidays(y));
  return all.filter((h) => h.date >= startISO && h.date <= endISO)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((h, idx, arr) => idx === 0 || h.date !== arr[idx - 1].date); // dedupe year overlap
}

/** Convenience: does the observed (lieu-shifted) day land in range? */
export function statHolidaysObservedInRange(startISO: string, endISO: string): StatHoliday[] {
  return statHolidaysInRange(startISO, endISO).map((h) => {
    const [y, m, d] = h.date.split("-").map(Number);
    return { date: iso(observed(new Date(y, m - 1, d))), name: h.name };
  });
}
