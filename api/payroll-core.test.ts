import { describe, it, expect } from "vitest";
import { estimateFromGross, estimateFromNet, salaryPerPeriod, periodsPerYear, SELECTIVE_RATES, nextPayPeriod, normalizeFrequency } from "./payroll-core";

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

describe("payroll-core — frequency + next pay period", () => {
  it("normalizes loose frequency strings", () => {
    expect(normalizeFrequency("Bi-weekly")).toBe("biweekly");
    expect(normalizeFrequency("Semi-Monthly")).toBe("semi_monthly");
    expect(normalizeFrequency("Weekly")).toBe("weekly");
    expect(normalizeFrequency("self")).toBe("monthly");
  });

  it("monthly advances to the next calendar month", () => {
    const p = nextPayPeriod("monthly", new Date(2026, 5, 1), new Date(2026, 5, 30));
    expect(p.start.getMonth()).toBe(6); // July
    expect(p.start.getDate()).toBe(1);
    expect(p.end.getMonth()).toBe(6);
    expect(p.end.getDate()).toBe(31);
  });

  it("biweekly advances 14 days from the day after last end", () => {
    const p = nextPayPeriod("biweekly", new Date(2026, 5, 1), new Date(2026, 5, 14));
    expect(p.start.getDate()).toBe(15);
    expect(p.end.getDate()).toBe(28); // 15 + 13
  });

  it("semi-monthly toggles 1-15 <-> 16-EOM", () => {
    const firstHalf = nextPayPeriod("semi_monthly", new Date(2026, 5, 1), new Date(2026, 5, 15));
    expect(firstHalf.start.getDate()).toBe(16);
    const secondHalf = nextPayPeriod("semi_monthly", new Date(2026, 5, 16), new Date(2026, 5, 30));
    expect(secondHalf.start.getDate()).toBe(1);
    expect(secondHalf.start.getMonth()).toBe(6); // next month
  });
});
