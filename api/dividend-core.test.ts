import { describe, it, expect } from "vitest";
import { computeT5Boxes, buildT5Slip } from "./dividend-core";

const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

describe("T5 dividend boxes", () => {
  it("eligible: 38% gross-up, DTC 15.0198% of taxable", () => {
    const b = computeT5Boxes(1000, "eligible");
    expect(b.actual).toBe(1000);
    expect(near(b.taxable, 1380)).toBe(true);       // 1000 × 1.38
    expect(near(b.dtc, 1380 * 0.150198)).toBe(true); // ≈ 207.27
    expect([b.actualBox, b.taxableBox, b.dtcBox]).toEqual(["24", "25", "26"]);
  });

  it("non-eligible: 15% gross-up, DTC 9.0301% of taxable", () => {
    const b = computeT5Boxes(1000, "non_eligible");
    expect(near(b.taxable, 1150)).toBe(true);        // 1000 × 1.15
    expect(near(b.dtc, 1150 * 0.090301)).toBe(true); // ≈ 103.85
    expect([b.actualBox, b.taxableBox, b.dtcBox]).toEqual(["10", "11", "12"]);
  });

  it("a slip totals eligible + non-eligible", () => {
    const s = buildT5Slip(1000, 500);
    expect(near(s.totalActual, 1500)).toBe(true);
    expect(near(s.totalTaxable, 1380 + 575)).toBe(true);
    expect(s.totalDtc).toBeGreaterThan(0);
  });

  it("zero dividends → zero boxes", () => {
    const b = computeT5Boxes(0, "eligible");
    expect(b.taxable).toBe(0);
    expect(b.dtc).toBe(0);
  });
});
