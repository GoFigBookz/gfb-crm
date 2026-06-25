import { describe, it, expect } from "vitest";
import { buildLoanLedger, summarizeLoan, accrueSimpleInterest, validateLoanEntry, type LoanEntry } from "./loan-tracker-core";

const E = (entryDate: string, amount: number, kind: LoanEntry["kind"], id?: number): LoanEntry => ({ entryDate, amount, kind, id });

describe("loan tracker core", () => {
  it("builds a running balance owed, oldest→newest", () => {
    const rows = buildLoanLedger([
      E("2026-03-01", 10000, "advance", 1),
      E("2026-04-01", -2500, "repayment", 2),
      E("2026-05-01", -2500, "repayment", 3),
    ]);
    expect(rows.map((r) => r.runningBalance)).toEqual([10000, 7500, 5000]);
  });

  it("orders by date regardless of input order, stable by id on ties", () => {
    const rows = buildLoanLedger([
      E("2026-04-01", -1000, "repayment", 2),
      E("2026-03-01", 5000, "opening", 1),
      E("2026-04-01", -500, "repayment", 3),
    ]);
    expect(rows.map((r) => r.runningBalance)).toEqual([5000, 4000, 3500]);
  });

  it("summarizes balance, advanced, repaid, interest, and direction", () => {
    const s = summarizeLoan([
      E("2026-03-01", 10000, "advance"),
      E("2026-03-31", 50, "interest"),
      E("2026-04-01", -3000, "repayment"),
    ]);
    expect(s.balance).toBe(7050);
    expect(s.totalAdvanced).toBe(10050); // advance + interest grew the loan
    expect(s.totalRepaid).toBe(3000);
    expect(s.totalInterest).toBe(50);
    expect(s.direction).toBe("owed_to_lender");
    expect(s.lastActivity).toBe(new Date("2026-04-01").toISOString());
  });

  it("flags a flipped (overpaid) loan as owed_to_borrower; settled at zero", () => {
    expect(summarizeLoan([E("2026-03-01", 1000, "advance"), E("2026-04-01", -1500, "repayment")]).direction).toBe("owed_to_borrower");
    expect(summarizeLoan([E("2026-03-01", 1000, "advance"), E("2026-04-01", -1000, "repayment")]).direction).toBe("settled");
    expect(summarizeLoan([]).direction).toBe("settled");
  });

  it("rounds to cents (no float drift)", () => {
    const s = summarizeLoan([E("2026-03-01", 0.1, "advance"), E("2026-03-02", 0.2, "advance")]);
    expect(s.balance).toBe(0.3);
  });

  it("simple interest = principal × rate × days/365", () => {
    expect(accrueSimpleInterest(10000, 5, 365)).toBe(500);
    expect(accrueSimpleInterest(10000, 5, 30)).toBe(41.1);
    expect(accrueSimpleInterest(0, 5, 30)).toBe(0);
    expect(accrueSimpleInterest(10000, 0, 30)).toBe(0);
  });

  it("validates entry sign vs kind", () => {
    expect(validateLoanEntry({ amount: -100, kind: "repayment" })).toBeNull();
    expect(validateLoanEntry({ amount: 100, kind: "repayment" })).toMatch(/negative/);
    expect(validateLoanEntry({ amount: -100, kind: "advance" })).toMatch(/positive/);
    expect(validateLoanEntry({ amount: 0, kind: "advance" })).toMatch(/zero/);
    expect(validateLoanEntry({ amount: 0, kind: "adjust" })).toBeNull();
    expect(validateLoanEntry({ amount: NaN, kind: "advance" })).toMatch(/number/);
  });
});
