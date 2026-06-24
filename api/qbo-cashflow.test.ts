import { describe, it, expect } from "vitest";
import { bankBreakdownFromAccounts, periodsPerYear, estimateUpcomingPayroll, staleFeedFromTransactionList } from "./qbo-cashflow";

describe("bankBreakdownFromAccounts", () => {
  it("splits cash by currency, sums CC owed, flags uncategorized, skips inactive", () => {
    const r = bankBreakdownFromAccounts([
      { name: "RBC Chequing", accountType: "Bank", currentBalance: 10000, currencyRef: "CAD", active: true },
      { name: "US Operating", accountType: "Bank", currentBalance: 5000, currencyRef: "USD", active: true },
      { name: "Visa", accountType: "Credit Card", currentBalance: -2300, currencyRef: "CAD", active: true },
      { name: "Uncategorized Expense", accountType: "Expense", currentBalance: 480, currencyRef: "CAD", active: true },
      { name: "Old Savings", accountType: "Bank", currentBalance: 999, currencyRef: "CAD", active: false }, // ignored
    ]);
    expect(r.cashCad).toBe(10000);
    expect(r.cashUsd).toBe(5000);
    expect(r.cashTotal).toBe(15000);
    expect(r.creditCardOwed).toBe(2300);
    expect(r.uncategorizedCount).toBe(1);
    expect(r.uncategorizedBalance).toBe(480);
    expect(r.bankAccounts).toHaveLength(3); // 2 bank + 1 CC, inactive excluded
  });
});

describe("periodsPerYear", () => {
  it("maps CRM frequencies", () => {
    expect(periodsPerYear("weekly")).toBe(52);
    expect(periodsPerYear("bi-weekly")).toBe(26);
    expect(periodsPerYear("semi-monthly")).toBe(24);
    expect(periodsPerYear("monthly")).toBe(12);
    expect(periodsPerYear("self")).toBe(0);
    expect(periodsPerYear(null)).toBe(0);
  });
});

describe("estimateUpcomingPayroll", () => {
  it("estimates a weekly run from salary + hourly, with employer burden, skipping contractors/inactive", () => {
    const emps = [
      { payType: "salary", annualSalary: 52000, isActive: true, isContractor: false },     // 1000/wk
      { payType: "hourly", hourlyRate: 25, hoursPerWeek: 40, isActive: true, isContractor: false }, // 1000/wk
      { payType: "salary", annualSalary: 99999, isActive: false, isContractor: false },    // inactive → 0
      { payType: "contract", hourlyRate: 80, hoursPerWeek: 40, isActive: true, isContractor: true }, // contractor → 0
    ];
    // gross = 2000/wk; ×1.12 = 2240
    expect(estimateUpcomingPayroll(emps, "weekly")).toBe(2240);
  });
  it("returns null when there's no payroll run or no pay", () => {
    expect(estimateUpcomingPayroll([{ payType: "salary", annualSalary: 52000, isActive: true }], "self")).toBeNull();
    expect(estimateUpcomingPayroll([], "weekly")).toBeNull();
  });
  it("scales salary by frequency", () => {
    const emps = [{ payType: "salary", annualSalary: 120000, isActive: true, isContractor: false }];
    expect(estimateUpcomingPayroll(emps, "monthly")).toBe(Math.round((120000 / 12) * 1.12 * 100) / 100); // 11200
  });
});

describe("staleFeedFromTransactionList", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  it("computes per-account days-since-last-txn and flags stale ones", () => {
    const report = {
      Columns: { Column: [{ ColType: "tx_date", ColTitle: "Date" }, { ColType: "account_name", ColTitle: "Account" }] },
      Rows: { Row: [
        { ColData: [{ value: "2026-06-23" }, { value: "RBC Chequing" }] },  // 1 day
        { ColData: [{ value: "2026-06-01" }, { value: "US Operating" }] },  // 23 days → stale
        { ColData: [{ value: "2026-06-20" }, { value: "RBC Chequing" }] },  // older dup, ignored (max kept)
      ] },
    };
    const r = staleFeedFromTransactionList(report, now, 10);
    expect(r.perAccount["RBC Chequing"]).toBe(1);
    expect(r.perAccount["US Operating"]).toBe(23);
    expect(r.maxStaleDays).toBe(23);
    expect(r.staleAccounts).toEqual(["US Operating"]);
  });
  it("falls back to realm-level when there's no account column", () => {
    const report = { Columns: { Column: [{ ColType: "tx_date" }] }, Rows: { Row: [{ ColData: [{ value: "2026-06-14" }] }] } };
    const r = staleFeedFromTransactionList(report, now);
    expect(r.maxStaleDays).toBe(10);
    expect(r.staleAccounts).toEqual([]);
  });
  it("returns empty on an unrecognised shape (never throws)", () => {
    expect(staleFeedFromTransactionList({}, now).maxStaleDays).toBeNull();
    expect(staleFeedFromTransactionList(null, now).maxStaleDays).toBeNull();
  });
});
