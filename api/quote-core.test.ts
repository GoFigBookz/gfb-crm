import { describe, it, expect } from "vitest";
import { computeQuote, compareToFlatFee, RATE_CARD, type QuoteScope } from "./quote-core";

function baseScope(over: Partial<QuoteScope> = {}): QuoteScope {
  return {
    avgMonthlyTransactions: 0,
    bookkeepingFrequency: "monthly",
    bankAccountCount: 1,
    creditCardCount: 0,
    hasHST: false,
    hstPeriod: null,
    hasPayroll: false,
    employeeCount: 0,
    payrollFrequency: "none",
    payrollRemitterFreq: "regular",
    hasWSIB: false,
    hasEHT: false,
    paysDividends: false,
    hasInvestments: false,
    hasSubcontractors: false,
    needsYearEnd: false,
    salesPlatformCount: 0,
    invoicingByUs: false,
    billPayByUs: false,
    hasJobCosting: false,
    monthsBehind: 0,
    ...over,
  };
}

describe("transaction tiers (core base $150–$250)", () => {
  it("floor base for ≤50 txns", () => {
    expect(computeQuote(baseScope({ avgMonthlyTransactions: 30 })).recurringMonthly).toBe(150);
  });
  it("$175 base at 100 txns", () => {
    expect(computeQuote(baseScope({ avgMonthlyTransactions: 100 })).recurringMonthly).toBe(175);
  });
  it("$250 base capped at 250 txns", () => {
    expect(computeQuote(baseScope({ avgMonthlyTransactions: 250 })).recurringMonthly).toBe(250);
  });
  it("base stays capped at $250 above 250 txns", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 1000 }));
    expect(q.recurringMonthly).toBe(250);
  });
});

describe("bookkeeping frequency multiplier", () => {
  it("quarterly cadence reduces the base", () => {
    const monthly = computeQuote(baseScope({ avgMonthlyTransactions: 100, bookkeepingFrequency: "monthly" })).recurringMonthly;
    const quarterly = computeQuote(baseScope({ avgMonthlyTransactions: 100, bookkeepingFrequency: "quarterly" })).recurringMonthly;
    expect(quarterly).toBeLessThan(monthly);
    expect(quarterly).toBe(120); // round5(175 * 0.7 ≈ 122.5)
  });
});

describe("add-ons", () => {
  it("HST filing adds by cadence", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, hasHST: true, hstPeriod: "quarterly" }));
    expect(q.recurringMonthly).toBe(150 + 50);
    expect(q.monthlyLineItems.some((i) => i.label.includes("HST"))).toBe(true);
  });
  it("payroll = base + per employee, with run-frequency multiplier", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, hasPayroll: true, employeeCount: 3, payrollFrequency: "biweekly" }));
    // (40 + 3*20) * 1.2 = 120 ; + T4 (3*50/12=12.5) ; + base 150
    const payrollLine = q.monthlyLineItems.find((i) => i.label.startsWith("Payroll"));
    expect(payrollLine?.amount).toBeCloseTo(120, 5);
    expect(q.monthlyLineItems.some((i) => i.label.includes("T4"))).toBe(true);
  });
  it("no payroll line when there are zero employees", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, hasPayroll: true, employeeCount: 0 }));
    expect(q.monthlyLineItems.some((i) => i.label.startsWith("Payroll"))).toBe(false);
  });
  it("accelerated remitter adds a premium line", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, hasPayroll: true, employeeCount: 1, payrollFrequency: "monthly", payrollRemitterFreq: "accelerated" }));
    expect(q.monthlyLineItems.some((i) => i.label.includes("Accelerated"))).toBe(true);
  });
  it("sales platforms billed per platform", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, salesPlatformCount: 2 }));
    expect(q.recurringMonthly).toBe(150 + 2 * RATE_CARD.salesPlatform);
  });
  it("A/R, A/P, job costing each add their line", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, invoicingByUs: true, billPayByUs: true, hasJobCosting: true }));
    expect(q.recurringMonthly).toBe(150 + RATE_CARD.invoicingAR + RATE_CARD.billPayAP + RATE_CARD.jobCosting);
  });
  it("T5 line appears for dividends", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, paysDividends: true }));
    expect(q.monthlyLineItems.some((i) => i.label.includes("T5 slips"))).toBe(true);
  });
});

describe("one-time charges", () => {
  it("always includes onboarding setup", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50 }));
    expect(q.oneTimeTotal).toBe(RATE_CARD.onboardingSetup);
  });
  it("catch-up scales with months behind", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 50, monthsBehind: 6 }));
    expect(q.oneTimeTotal).toBe(RATE_CARD.onboardingSetup + 6 * RATE_CARD.catchUpPerMonthBehind);
  });
});

describe("recurring range", () => {
  it("is a ±15% band around the headline", () => {
    const q = computeQuote(baseScope({ avgMonthlyTransactions: 100 }));
    expect(q.recurringRange.low).toBeLessThan(q.recurringMonthly);
    expect(q.recurringRange.high).toBeGreaterThan(q.recurringMonthly);
  });
});

describe("nearestPackage", () => {
  it("snaps a small base to the lowest package", () => {
    expect(computeQuote(baseScope({ avgMonthlyTransactions: 30 })).nearestPackage.price).toBe(300);
  });
  it("snaps a fully-loaded client to a higher package", () => {
    const big = computeQuote(baseScope({
      avgMonthlyTransactions: 250, hasHST: true, hstPeriod: "monthly",
      hasPayroll: true, employeeCount: 5, payrollFrequency: "biweekly",
      invoicingByUs: true, billPayByUs: true, hasJobCosting: true,
    }));
    expect(big.nearestPackage.price).toBeGreaterThan(300);
  });
});

describe("compareToFlatFee", () => {
  it("flags undercharging when flat is well below scope", () => {
    const c = compareToFlatFee(800, 500);
    expect(c.verdict).toBe("undercharging");
    expect(c.deltaMonthly).toBe(300);
  });
  it("aligned within 10%", () => {
    expect(compareToFlatFee(800, 760).verdict).toBe("aligned");
  });
  it("above market when flat exceeds scope by >10%", () => {
    expect(compareToFlatFee(500, 800).verdict).toBe("above_market");
  });
  it("no_flat_fee when missing or zero", () => {
    expect(compareToFlatFee(800, 0).verdict).toBe("no_flat_fee");
    expect(compareToFlatFee(800, null).verdict).toBe("no_flat_fee");
  });
});
