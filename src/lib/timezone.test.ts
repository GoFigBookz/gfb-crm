import { describe, it, expect } from "vitest";
import { placementDate } from "./timezone";

/**
 * The calendar off-by-a-day fix. We assert on the LOCAL calendar day the value
 * lands on, which is what `isSameDay(item.date, gridDay)` compares in the UI.
 */
describe("placementDate (calendar off-by-a-day)", () => {
  const localYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("an all-day value stored at UTC midnight lands on THAT calendar day, not the day before", () => {
    // Google all-day event for June 25 → stored as 2026-06-25T00:00:00Z.
    const d = placementDate("2026-06-25T00:00:00.000Z");
    expect(localYmd(d)).toBe("2026-06-25");
    expect(d.getHours()).toBe(12); // rebuilt at local noon
  });

  it("isAllDay flag forces the UTC calendar day regardless of stored time", () => {
    const d = placementDate("2026-12-25T00:00:00.000Z", true);
    expect(localYmd(d)).toBe("2026-12-25");
  });

  it("a real timed value passes through unchanged (no day shift)", () => {
    // 8am Toronto on Jul 8 2026 (EDT, UTC-4) = 12:00Z. Must stay on Jul 8.
    const eightAmToronto = new Date("2026-07-08T12:00:00.000Z");
    const d = placementDate(eightAmToronto);
    expect(localYmd(d)).toBe(localYmd(eightAmToronto));
    expect(d.getTime()).toBe(eightAmToronto.getTime()); // untouched
  });

  it("accepts Date, string, and number inputs", () => {
    const iso = "2026-03-01T00:00:00.000Z";
    expect(localYmd(placementDate(iso))).toBe("2026-03-01");
    expect(localYmd(placementDate(new Date(iso)))).toBe("2026-03-01");
    expect(localYmd(placementDate(new Date(iso).getTime()))).toBe("2026-03-01");
  });
});
