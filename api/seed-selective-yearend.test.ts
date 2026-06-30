import { describe, it, expect } from "vitest";
import { mostRecentCompletedFiscalYear } from "./seed-selective-yearend";

describe("mostRecentCompletedFiscalYear — which year a 'Start a year-end' opens", () => {
  it("Dec year-end: before Dec 31 → last year; on/after → this year", () => {
    expect(mostRecentCompletedFiscalYear(new Date("2026-06-28T12:00:00Z"), 12)).toBe(2025);
    expect(mostRecentCompletedFiscalYear(new Date("2026-12-31T12:00:00Z"), 12)).toBe(2026);
    expect(mostRecentCompletedFiscalYear(new Date("2027-01-02T12:00:00Z"), 12)).toBe(2026);
  });

  it("non-Dec year-end (e.g. March 31) flips at that month, not December", () => {
    // FYE Mar 31: in June 2026, the FY2026 (ended Mar 31 2026) is complete → 2026.
    expect(mostRecentCompletedFiscalYear(new Date("2026-06-28T12:00:00Z"), 3)).toBe(2026);
    // In February 2026, FY2026 hasn't ended yet → most recent complete is 2025.
    expect(mostRecentCompletedFiscalYear(new Date("2026-02-15T12:00:00Z"), 3)).toBe(2025);
  });

  it("defaults to December when no FYE month is set", () => {
    expect(mostRecentCompletedFiscalYear(new Date("2026-06-28T12:00:00Z"), null)).toBe(2025);
  });
});
