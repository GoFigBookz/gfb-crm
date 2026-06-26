import { describe, it, expect } from "vitest";
import {
  runHstReview, tieOut, isTaxableCode, checkUnreviewedAccounts, checkControlAccountCoding,
  checkMissingTaxCode, checkSalesWithoutTax, checkDuplicates, checkMealsFullItc,
  type RawTxn, type RawAccount,
} from "./hst-review-core";

const acct = (id: string, name: string, balance = 0, type = "Expense"): RawAccount => ({ id, name, type, balance });
const exp = (id: string, name: string, lines: any[], docNumber?: string, date = "2025-03-10"): RawTxn => ({
  id, type: "Bill", date, name, docNumber, total: lines.reduce((s, l) => s + l.amount, 0), lines,
});
const sale = (id: string, total: number, taxTotal: number, accountName = "Sales"): RawTxn => ({
  id, type: "Invoice", date: "2025-03-12", name: "Customer", total, taxTotal, lines: [{ accountName, amount: total - taxTotal, taxAmount: taxTotal }],
});

describe("tax code classification", () => {
  it("treats exempt/zero/out-of-scope as non-taxable", () => {
    expect(isTaxableCode({ id: "1", name: "Exempt" })).toBe(false);
    expect(isTaxableCode({ id: "2", name: "Out of Scope" })).toBe(false);
    expect(isTaxableCode({ id: "3", name: "HST ON", taxable: true })).toBe(true);
    expect(isTaxableCode(undefined)).toBe(false);
  });
});

describe("unreviewed accounts", () => {
  it("flags non-zero uncategorized / ask-my-accountant / OBE balances", () => {
    const f = checkUnreviewedAccounts([
      acct("1", "Uncategorized Expense", 1240.5),
      acct("2", "Ask My Accountant", -300),
      acct("3", "Opening Balance Equity", 5000),
      acct("4", "Office Supplies", 800), // normal — not flagged
      acct("5", "Uncategorized Asset", 0), // zero — not flagged
    ]);
    expect(f.map((x) => x.ref)).toEqual([
      "Account: Uncategorized Expense", "Account: Ask My Accountant", "Account: Opening Balance Equity",
    ]);
    expect(f.every((x) => x.severity === "high")).toBe(true);
  });
});

describe("control-account coding", () => {
  it("flags a line coded straight to HST/AP/clearing", () => {
    const f = checkControlAccountCoding([
      exp("t1", "Central Spa", [{ accountName: "Accounts Payable", amount: 100 }]),
      exp("t2", "Vendor", [{ accountName: "HST Payable", amount: 50 }]),
      exp("t3", "Vendor", [{ accountName: "Repairs & Maintenance", amount: 75 }]), // ok
    ]);
    expect(f).toHaveLength(2);
    expect(f.every((x) => x.severity === "high")).toBe(true);
  });
});

describe("missing tax code", () => {
  it("flags taxable-account lines with no tax code, ignores control accounts", () => {
    const f = checkMissingTaxCode([
      exp("t1", "Home Depot", [{ accountName: "Materials", amount: 200 }]), // no code -> flag
      exp("t2", "Bell", [{ accountName: "Telephone", amount: 90, taxCodeName: "HST ON" }]), // coded -> ok
      exp("t3", "x", [{ accountName: "Accounts Payable", amount: 500 }]), // control -> skip here
    ]);
    expect(f).toHaveLength(1);
    expect(f[0].ref).toMatch(/Home Depot/);
  });
});

describe("sales without tax", () => {
  it("flags a taxable-looking sale with no HST", () => {
    const f = checkSalesWithoutTax([sale("s1", 1130, 0), sale("s2", 1130, 130)]);
    expect(f).toHaveLength(1);
    expect(f[0].amount).toBe(1130);
    expect(f[0].severity).toBe("high");
  });
});

describe("duplicates", () => {
  it("flags same vendor+amount+doc#", () => {
    const f = checkDuplicates([
      exp("a", "Home Depot", [{ accountName: "Materials", amount: 226 }], "INV-9"),
      exp("b", "Home Depot", [{ accountName: "Materials", amount: 226 }], "INV-9"),
      exp("c", "Home Depot", [{ accountName: "Materials", amount: 226 }], "INV-10"), // diff doc -> ok
    ]);
    expect(f).toHaveLength(1);
  });
});

describe("meals full ITC", () => {
  it("flags meals claiming ~full 13% instead of 50%", () => {
    const full = checkMealsFullItc([exp("m1", "Keg", [{ accountName: "Meals & Entertainment", amount: 100, taxAmount: 13 }])]);
    const half = checkMealsFullItc([exp("m2", "Keg", [{ accountName: "Meals & Entertainment", amount: 100, taxAmount: 6.5 }])]);
    expect(full).toHaveLength(1);
    expect(half).toHaveLength(0);
  });
});

describe("tie-out + full report", () => {
  it("computes implied collected / ITC / net", () => {
    const t = tieOut([
      sale("s1", 1130, 130),
      exp("e1", "Vendor", [{ accountName: "Materials", amount: 100, taxAmount: 13 }]),
    ]);
    expect(t.collected).toBe(130);
    expect(t.itc).toBe(13);
    expect(t.net).toBe(117);
  });
  it("runHstReview returns sorted findings + severity counts + tie", () => {
    const report = runHstReview({
      accounts: [acct("1", "Uncategorized Expense", 500)],
      taxCodes: [{ id: "1", name: "HST ON", taxable: true }],
      txns: [
        sale("s1", 1130, 0), // high
        exp("e1", "Home Depot", [{ accountName: "Materials", amount: 200 }]), // medium (missing code)
      ],
    });
    expect(report.findings[0].severity).toBe("high"); // sorted high-first
    expect(report.bySeverity.high).toBeGreaterThanOrEqual(2);
    expect(report.counts.transactions).toBe(2);
    expect(report.tie.collected).toBe(0);
  });
});
