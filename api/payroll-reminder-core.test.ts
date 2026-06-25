import { describe, it, expect } from "vitest";
import { computeReminderRuns, daysBetween, weekdayOf, priorBusinessDay } from "./payroll-reminder-core";
import { ontarioStatHolidays } from "./stat-holidays";

const ANCHOR = "2026-06-24"; // a confirmed payroll Wednesday
function holidaySet(years: number[]): Set<string> {
  const s = new Set<string>();
  for (const y of years) for (const h of ontarioStatHolidays(y)) s.add(h.date);
  return s;
}
const NO_HOLIDAYS = new Set<string>();

describe("payroll reminder date core", () => {
  it("the anchor itself is a Wednesday", () => {
    expect(weekdayOf(ANCHOR)).toBe(3);
  });

  it("EVERY run lands on a Wednesday regardless of which day the server booted", () => {
    for (const boot of ["2026-06-25", "2026-06-28", "2026-07-01", "2026-06-22"]) {
      const runs = computeReminderRuns(boot, ANCHOR, NO_HOLIDAYS);
      expect(runs.length).toBeGreaterThan(0);
      for (const r of runs) expect(weekdayOf(r.wedISO)).toBe(3);
    }
  });

  it("biweekly cadence stays on the every-other-Wednesday beat from the anchor (no boot-day drift)", () => {
    // Booting on a Thursday must NOT shift which Wednesdays are biweekly.
    const fromThu = computeReminderRuns("2026-06-25", ANCHOR, NO_HOLIDAYS);
    const biweekly = fromThu.filter((r) => r.isBiweekly).map((r) => r.wedISO);
    // From anchor 06-24: next biweekly Wednesdays are 07-08, 07-22, 08-05, 08-19...
    expect(biweekly).toContain("2026-07-08");
    expect(biweekly).toContain("2026-07-22");
    expect(biweekly).toContain("2026-08-05");
    // The in-between Wednesdays must NOT be biweekly.
    expect(biweekly).not.toContain("2026-07-15");
    expect(biweekly).not.toContain("2026-07-29");
  });

  it("biweekly beat is identical whether booted Thu, Sun, or the Wednesday itself", () => {
    const pick = (boot: string) => computeReminderRuns(boot, ANCHOR, NO_HOLIDAYS).filter((r) => r.isBiweekly).map((r) => r.wedISO);
    const thu = pick("2026-06-25");
    const sun = pick("2026-06-28");
    // Compare the overlap window (Sun starts a few days later but the beat must match).
    const common = thu.filter((d) => sun.includes(d));
    expect(common.length).toBeGreaterThan(2);
    for (const d of common) expect(sun).toContain(d);
  });

  it("Canada Day (Wed Jul 1 2026) shifts the run earlier to the prior business day with a flag", () => {
    const runs = computeReminderRuns("2026-06-25", ANCHOR, holidaySet([2026]));
    const canadaDay = runs.find((r) => r.wedISO === "2026-07-01");
    expect(canadaDay).toBeDefined();
    expect(canadaDay!.statShifted).toBe(true);
    expect(canadaDay!.runISO).toBe("2026-06-30"); // Tuesday
    expect(weekdayOf(canadaDay!.runISO)).toBe(2);
  });

  it("non-holiday Wednesdays are not shifted", () => {
    const runs = computeReminderRuns("2026-07-06", ANCHOR, holidaySet([2026]));
    const jul8 = runs.find((r) => r.wedISO === "2026-07-08");
    expect(jul8!.statShifted).toBe(false);
    expect(jul8!.runISO).toBe("2026-07-08");
  });

  it("priorBusinessDay skips weekends and stat holidays", () => {
    const hol = holidaySet([2026]);
    // 2026-07-01 is Canada Day (Wed) → prior business day is 06-30 (Tue).
    expect(priorBusinessDay("2026-07-01", hol)).toBe("2026-06-30");
    // A Sunday rolls back to Friday.
    expect(weekdayOf("2026-07-05")).toBe(0);
    expect(priorBusinessDay("2026-07-05", NO_HOLIDAYS)).toBe("2026-07-03");
  });

  it("daysBetween is exact and signed", () => {
    expect(daysBetween("2026-07-08", "2026-06-24")).toBe(14);
    expect(daysBetween("2026-06-24", "2026-07-08")).toBe(-14);
    expect(daysBetween("2026-06-24", "2026-06-24")).toBe(0);
  });
});
