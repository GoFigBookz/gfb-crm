import { describe, it, expect } from "vitest";
import { bracketTax, federalTax, ontarioTax, annualIncomeTax, reconcileWithholding, TAX_2025 } from "./payroll-tax-core";

describe("payroll-tax-core — brackets", () => {
  it("progressive bracket tax sums bands", () => {
    // first federal band only
    expect(bracketTax(50000, TAX_2025.federalBrackets)).toBeCloseTo(50000 * 0.15, 2);
    // crosses into second band
    const t = bracketTax(100000, TAX_2025.federalBrackets);
    expect(t).toBeCloseTo(57375 * 0.15 + (100000 - 57375) * 0.205, 2);
  });

  it("federal tax subtracts the BPA credit and never goes negative", () => {
    expect(federalTax(0)).toBe(0);
    expect(federalTax(10000)).toBe(0); // below BPA → credit wipes it out
    expect(federalTax(60000)).toBeGreaterThan(0);
  });

  it("ontario tax includes surtax + health premium and is positive at mid income", () => {
    expect(ontarioTax(0)).toBeGreaterThanOrEqual(0);
    expect(ontarioTax(120000)).toBeGreaterThan(0);
  });

  it("annual tax = federal + ontario", () => {
    expect(annualIncomeTax(90000)).toBeCloseTo(federalTax(90000) + ontarioTax(90000), 2);
  });
});

describe("payroll-tax-core — withholding reconciliation", () => {
  it("flags under-withholding when QBO deducted too little", () => {
    // Half a year, $60k YTD gross → annualizes to $120k. Expected YTD tax is sizeable.
    const r = reconcileWithholding(60000, 2000, 0.5);
    expect(r.annualizedIncome).toBe(120000);
    expect(r.expectedYtdTax).toBeGreaterThan(2000);
    expect(r.variance).toBeLessThan(0);
    expect(r.underWithheld).toBe(true);
  });

  it("does NOT flag when withholding is on track", () => {
    const full = annualIncomeTax(120000);
    const r = reconcileWithholding(60000, full / 2, 0.5);
    expect(Math.abs(r.variance)).toBeLessThan(1);
    expect(r.underWithheld).toBe(false);
  });

  it("expectedYtdTax = annualTax × fraction", () => {
    const r = reconcileWithholding(50000, 5000, 0.5);
    expect(r.expectedYtdTax).toBeCloseTo(r.annualTaxExpected * 0.5, 1);
  });
});
