import { describe, it, expect } from "vitest";
import { yearEndCloseDueDate, hstQuarterlyDueDate, quarterEndForMonth, t4DueDate, correctedDueDate } from "./task-date-rules";

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("task date rules", () => {
  it("year-end close → 30th of the month after year-end", () => {
    expect(ymd(yearEndCloseDueDate(9, 2026))).toBe("2026-10-30");   // Sept → Oct 30
    expect(ymd(yearEndCloseDueDate(6, 2026))).toBe("2026-7-30");    // June → Jul 30
  });
  it("year-end Dec → Jan 30 of the NEXT year", () => {
    expect(ymd(yearEndCloseDueDate(12, 2026))).toBe("2027-1-30");
  });
  it("year-end clamps day to the month's last day (Jan → Feb 28)", () => {
    expect(ymd(yearEndCloseDueDate(1, 2026))).toBe("2026-2-28");    // Feb has no 30th
  });
  it("HST quarterly → 15th of the month after the quarter end", () => {
    expect(ymd(hstQuarterlyDueDate(3, 2026))).toBe("2026-4-15");
    expect(ymd(hstQuarterlyDueDate(12, 2026))).toBe("2027-1-15");   // Dec quarter → Jan 15 next yr
  });
  it("quarterEndForMonth picks the right calendar quarter end", () => {
    expect(quarterEndForMonth(2)).toBe(12); // before Q1 end → wraps to prior Dec
    expect(quarterEndForMonth(5)).toBe(3);
    expect(quarterEndForMonth(8)).toBe(6);
    expect(quarterEndForMonth(11)).toBe(9);
    expect(quarterEndForMonth(12)).toBe(12);
  });
  it("T4 prep → Jan 20", () => {
    expect(ymd(t4DueDate(2026))).toBe("2026-1-20");
  });
  it("correctedDueDate routes by ruleType", () => {
    expect(ymd(correctedDueDate("year_end", new Date(2026, 5, 15), 9)!)).toBe("2026-10-30");
    expect(ymd(correctedDueDate("hst_quarterly", new Date(2026, 4, 1), null)!)).toBe("2026-4-15");
    expect(ymd(correctedDueDate("t4_slips", new Date(2026, 1, 1), null)!)).toBe("2026-1-20");
    expect(correctedDueDate("year_end", new Date(2026, 5, 15), null)).toBeNull(); // no fiscal yr-end
    expect(correctedDueDate("monthly_bookkeeping", new Date(), 9)).toBeNull();    // no rule
  });
});
