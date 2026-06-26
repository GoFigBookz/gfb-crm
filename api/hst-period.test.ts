import { describe, it, expect } from "vitest";
import { normalizeFreq, isHstFilingTask, defaultHstRange, fiscalHstRange } from "./hst-period";

describe("normalizeFreq", () => {
  it("maps text to a frequency, defaulting to quarterly", () => {
    expect(normalizeFreq("Monthly")).toBe("monthly");
    expect(normalizeFreq("annual")).toBe("annual");
    expect(normalizeFreq("Quarterly")).toBe("quarterly");
    expect(normalizeFreq(null)).toBe("quarterly");
  });
});

describe("isHstFilingTask", () => {
  it("matches HST/GST filing tasks", () => {
    expect(isHstFilingTask("File quarterly HST return for Joe Smith Co")).toBe(true);
    expect(isHstFilingTask("File HST")).toBe(true);
    expect(isHstFilingTask("Remit GST/HST")).toBe(true);
    expect(isHstFilingTask("File sales tax return")).toBe(true);
  });
  it("ignores non-filing or unrelated tasks", () => {
    expect(isHstFilingTask("Set up HST number")).toBe(false);
    expect(isHstFilingTask("Payroll run")).toBe(false);
    expect(isHstFilingTask("")).toBe(false);
  });
});

describe("defaultHstRange", () => {
  it("quarterly: a 3-month window ending the month before the due month", () => {
    // due 2025-07-31 (Q2 filing) -> period Apr 1 .. Jun 30
    const r = defaultHstRange(new Date(2025, 6, 31), "quarterly");
    expect(r.start).toBe("2025-04-01");
    expect(r.end).toBe("2025-06-30");
  });
  it("annual: 12 months ending the month before the due month", () => {
    const r = defaultHstRange(new Date(2025, 5, 30), "annual"); // due Jun 2025
    expect(r.start).toBe("2024-06-01");
    expect(r.end).toBe("2025-05-31");
  });
  it("monthly: single month ending the month before", () => {
    const r = defaultHstRange(new Date(2025, 2, 31), "monthly"); // due Mar -> Feb
    expect(r.start).toBe("2025-02-01");
    expect(r.end).toBe("2025-02-28");
  });
  it("rolls the year back across January", () => {
    const r = defaultHstRange(new Date(2025, 0, 31), "quarterly"); // due Jan 2025 -> Oct..Dec 2024
    expect(r.start).toBe("2024-10-01");
    expect(r.end).toBe("2024-12-31");
  });
});

describe("fiscalHstRange (Nov 30 fiscal year-end)", () => {
  // FYE = November (11): fiscal quarters end Feb / May / Aug / Nov.
  it("returns Q2 = Mar 1 – May 31 as of a June due date", () => {
    const r = fiscalHstRange(new Date(2026, 5, 30), "quarterly", 11); // asOf 2026-06-30
    expect(r.start).toBe("2026-03-01");
    expect(r.end).toBe("2026-05-31");
    expect(r.quarter).toBe(2);
  });
  it("returns Q1 = Dec 1 – Feb 28 as of a March date", () => {
    const r = fiscalHstRange(new Date(2026, 2, 15), "quarterly", 11);
    expect(r.start).toBe("2025-12-01");
    expect(r.end).toBe("2026-02-28");
    expect(r.quarter).toBe(1);
  });
  it("falls back to the calendar quarter when no fiscal year-end is set", () => {
    const r = fiscalHstRange(new Date(2025, 6, 31), "quarterly", null);
    expect(r.start).toBe("2025-04-01");
    expect(r.end).toBe("2025-06-30");
  });
});
