import { describe, it, expect } from "vitest";
import { easternDayRangeUtc, longShiftNote } from "./timesheet-core";

describe("easternDayRangeUtc", () => {
  it("maps a summer (EDT, UTC-4) day to the right UTC window", () => {
    const { start, end } = easternDayRangeUtc("2026-06-23", "2026-06-23");
    expect(start).toBe("2026-06-23T04:00:00.000Z"); // Eastern midnight = 04:00 UTC in EDT
    expect(end).toBe("2026-06-24T03:59:59.000Z");
  });
  it("handles winter (EST, UTC-5) — DST-aware", () => {
    const { start } = easternDayRangeUtc("2026-01-15", "2026-01-15");
    expect(start).toBe("2026-01-15T05:00:00.000Z");
  });
  it("spans a multi-day pay period", () => {
    const { start, end } = easternDayRangeUtc("2026-06-09", "2026-06-22");
    expect(start).toBe("2026-06-09T04:00:00.000Z");
    expect(end).toBe("2026-06-23T03:59:59.000Z");
  });
});

describe("longShiftNote", () => {
  it("flags a shift over the limit", () => {
    expect(longShiftNote(14.2, 10)).toContain("missed clock-out");
    expect(longShiftNote(14.2, 10)).toContain("14.2h");
  });
  it("does not flag a normal shift", () => {
    expect(longShiftNote(8, 10)).toBeNull();
    expect(longShiftNote(10, 10)).toBeNull(); // exactly the limit is fine
  });
});
