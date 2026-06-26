import { describe, it, expect } from "vitest";
import { checkClearingRecon } from "./interco-recon-core";

describe("checkClearingRecon", () => {
  it("equal and opposite → reconciled (sum ≈ 0)", () => {
    const r = checkClearingRecon(12500, -12500);
    expect(r.reconciled).toBe(true);
    expect(r.sum).toBe(0);
    expect(r.variance).toBe(0);
  });
  it("equal magnitude same sign (QBO shows both positive) → reconciled", () => {
    const r = checkClearingRecon(12500, 12500);
    expect(r.reconciled).toBe(true);
    expect(r.absDiff).toBe(0);
  });
  it("off by $100 → not reconciled, variance surfaced", () => {
    const r = checkClearingRecon(12500, -12400);
    expect(r.reconciled).toBe(false);
    expect(r.variance).toBe(100);
  });
  it("within a cent → reconciled", () => {
    const r = checkClearingRecon(12500.00, -12499.995);
    expect(r.reconciled).toBe(true);
  });
});
