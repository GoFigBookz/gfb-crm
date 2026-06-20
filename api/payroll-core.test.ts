import { describe, it, expect } from "vitest";
import { estimateFromGross, estimateFromNet, salaryPerPeriod, periodsPerYear, SELECTIVE_RATES } from "./payroll-core";

describe("payroll-core — Selective Painting flat estimator", () => {
  it("gross→net uses the verified 0.7739 factor", () => {
    const e = estimateFromGross(1000);
    expect(e.cppEmployee).toBe(59.5);
    expect(e.eiEmployee).toBe(16.6);
    expect(e.federalTax).toBe(150);
    expect(e.netPay).toBe(773.9); // 1000 * (1 - .0595 - .0166 - .15)
  });

  it("employer portions: CPP 1x, EI 1.4x", () => {
    const e = estimateFromGross(1000);
    expect(e.cppEmployer).toBe(59.5);
    expect(e.eiEmployer).toBe(23.24); // 16.6 * 1.4
  });

  it("CRA remittance = sum of all five", () => {
    const e = estimateFromGross(1000);
    expect(e.craRemittance).toBeCloseTo(308.84, 2);
  });

  it("estimateFromNet inverts back to the gross", () => {
    const e = estimateFromNet(773.9);
    expect(e.grossPay).toBeCloseTo(1000, 1);
    expect(e.netPay).toBeCloseTo(773.9, 1);
  });

  it("rates match the live sheet", () => {
    expect(SELECTIVE_RATES).toEqual({ cpp: 0.0595, ei: 0.0166, tax: 0.15, eiEmployerMult: 1.4 });
  });
});

describe("payroll-core — salary per period", () => {
  it("periods per year by frequency", () => {
    expect(periodsPerYear("weekly")).toBe(52);
    expect(periodsPerYear("biweekly")).toBe(26);
    expect(periodsPerYear("semi_monthly")).toBe(24);
    expect(periodsPerYear("monthly")).toBe(12);
  });
  it("salary splits across periods", () => {
    expect(salaryPerPeriod(120000, "monthly")).toBe(10000);
    expect(salaryPerPeriod(52000, "weekly")).toBe(1000);
    expect(salaryPerPeriod(null, "monthly")).toBe(0);
  });
});
