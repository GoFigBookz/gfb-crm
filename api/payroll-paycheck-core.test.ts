import { describe, it, expect } from "vitest";
import { computePaycheck, grossFromNet, CPP_EI_2026 } from "./payroll-paycheck-core";

describe("payroll-paycheck-core", () => {
  it("computes a monthly paycheck with all deductions and a sane net", () => {
    const pc = computePaycheck(5000, "monthly");
    expect(pc.periodsPerYear).toBe(12);
    expect(pc.annualizedGross).toBe(60000);
    expect(pc.cpp).toBeGreaterThan(0);
    expect(pc.ei).toBeGreaterThan(0);
    expect(pc.incomeTax).toBeGreaterThan(0);
    // Net is gross minus all deductions, and clearly less than gross.
    expect(pc.netPay).toBeCloseTo(pc.gross - pc.totalDeductions, 2);
    expect(pc.netPay).toBeLessThan(pc.gross);
    expect(pc.netPay).toBeGreaterThan(pc.gross * 0.6);
  });

  it("EI is gross × rate (under the ceiling) and matches employer 1.4×", () => {
    const pc = computePaycheck(3000, "monthly");
    expect(pc.ei).toBeCloseTo(3000 * CPP_EI_2026.eiRate, 1);
    expect(pc.employerEi).toBeCloseTo(pc.ei * 1.4, 2);
  });

  it("CPP applies the per-period basic exemption", () => {
    const pc = computePaycheck(5000, "monthly");
    // (60000 - 3500) * 5.95% / 12
    expect(pc.cpp).toBeCloseTo((60000 - 3500) * 0.0595 / 12, 1);
  });

  it("employer CPP matches 1× and employer cost includes employer portions", () => {
    const pc = computePaycheck(5000, "monthly");
    expect(pc.employerCpp).toBeCloseTo(pc.cpp, 2);
    expect(pc.employerCost).toBeCloseTo(pc.gross + pc.employerCpp + pc.employerCpp2 + pc.employerEi, 2);
  });

  it("low income below the federal BPA pays ~no federal tax", () => {
    const pc = computePaycheck(1000, "monthly"); // $12k/yr, under BPA
    expect(pc.federalTax).toBe(0);
  });

  it("CPP2 kicks in for high earners above YMPE", () => {
    const pc = computePaycheck(8000, "monthly"); // $96k/yr > YMPE
    expect(pc.cpp2).toBeGreaterThan(0);
  });

  it("grossFromNet inverts computePaycheck", () => {
    const g = grossFromNet(3000, "monthly");
    const pc = computePaycheck(g, "monthly");
    expect(pc.netPay).toBeCloseTo(3000, 0);
  });
});
