import { describe, it, expect } from "vitest";
import {
  runHstReview, tieOut, isTaxableCode, checkUnreviewedAccounts, checkControlAccountCoding,
  checkMissingTaxCode, checkSalesWithoutTax, checkDuplicates, checkMealsFullItc,
  checkWrongTaxCode, hstAccountTieOut, findHstControlAccounts,
  hstReasonableness,
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

describe("HST reasonableness test", () => {
  const tie = (collected: number, salesBase: number, itc: number, purchaseBase: number) =>
    ({ collected, itc, net: collected - itc, salesBase, purchaseBase });

  it("greens both sides when effective rate ≈ 13%", () => {
    const r = hstReasonableness(tie(1300, 10000, 650, 5000));
    expect(r.output.effectiveRatePct).toBe(13);
    expect(r.output.verdict).toBe("green");
    expect(r.itc.verdict).toBe("green");
    expect(r.overall).toBe("green");
  });

  it("reds a taxable base with ~$0 HST (missing tax code)", () => {
    const r = hstReasonableness(tie(0, 10000, 650, 5000));
    expect(r.output.verdict).toBe("red");
    expect(r.overall).toBe("red");
  });

  it("yellow when a couple points off, red when far off", () => {
    expect(hstReasonableness(tie(1100, 10000, 650, 5000)).output.verdict).toBe("yellow"); // 11% → 2 pts
    expect(hstReasonableness(tie(500, 10000, 650, 5000)).output.verdict).toBe("red");      // 5% → 8 pts
  });

  it("flags an over-13% rate (double-taxed) as off", () => {
    expect(hstReasonableness(tie(1600, 10000, 650, 5000)).output.verdict).toBe("yellow"); // 16% → 3 pts
    expect(hstReasonableness(tie(1800, 10000, 650, 5000)).output.verdict).toBe("red");    // 18% → 5 pts
  });

  it("returns n/a (not a failure) when there is no base to test", () => {
    const r = hstReasonableness(tie(0, 0, 650, 5000));
    expect(r.output.verdict).toBe("na");
    expect(r.overall).toBe("green"); // itc side is green; na doesn't dominate
  });

  it("overall takes the worst of the two sides", () => {
    const r = hstReasonableness(tie(1300, 10000, 1500, 5000)); // itc 30% → red
    expect(r.output.verdict).toBe("green");
    expect(r.itc.verdict).toBe("red");
    expect(r.overall).toBe("red");
  });
});

describe("checkWrongTaxCode — the exception accountants chase", () => {
  it("flags a taxable expense coded exempt/zero/out-of-scope, skips genuinely-exempt accounts", () => {
    const txns: RawTxn[] = [
      exp("1", "Home Depot", [{ accountName: "Repairs & Maintenance", amount: 500, taxCodeName: "Out of Scope" }]),
      exp("2", "Sun Life", [{ accountName: "Insurance", amount: 300, taxCodeName: "Exempt" }]),          // legit exempt → skip
      exp("3", "Staples", [{ accountName: "Office Supplies", amount: 200, taxCodeName: "HST ON" }]),       // correct → no flag
      exp("4", "Payroll", [{ accountName: "Wages & Salaries", amount: 4000, taxCodeName: "Out of Scope" }]), // legit → skip
    ];
    const f = checkWrongTaxCode(txns);
    expect(f.length).toBe(1);
    expect(f[0].ref).toContain("Home Depot");
    expect(f[0].check).toBe("wrong_tax_code");
  });
});

describe("hstAccountTieOut — confirm the chart-of-accounts HST balance", () => {
  it("ties when the HST control account matches the implied net", () => {
    const accounts: RawAccount[] = [
      { id: "10", name: "GST/HST Payable", type: "Other Current Liability", subType: "GlobalTaxPayable", balance: 1300 },
    ];
    const r = hstAccountTieOut(accounts, { net: 1300 });
    expect(r.tied).toBe(true);
    expect(r.controlBalance).toBe(1300);
    expect(r.verdict).toBe("green");
  });

  it("flags a gap between the control account and the implied net", () => {
    const accounts: RawAccount[] = [
      { id: "10", name: "HST Suspense", type: "Other Current Liability", subType: "GlobalTaxSuspense", balance: 900 },
    ];
    const r = hstAccountTieOut(accounts, { net: 1300 });
    expect(r.tied).toBe(false);
    expect(r.diff).toBe(-400);
    expect(r.message).toMatch(/gap/);
  });

  it("finds the control account by name when subtype is absent, and reports 'na' when none exists", () => {
    expect(findHstControlAccounts([{ id: "1", name: "HST Payable", balance: 5 }]).length).toBe(1);
    const none = hstAccountTieOut([{ id: "1", name: "Chequing", type: "Bank", balance: 100 }], { net: 200 });
    expect(none.verdict).toBe("na");
    expect(none.controlAccounts.length).toBe(0);
  });
});

describe("runHstReview — wrong-code + account tie-out wired in", () => {
  it("surfaces a wrong-code finding and a high control-account gap finding", () => {
    const accounts: RawAccount[] = [{ id: "10", name: "GST/HST Payable", subType: "GlobalTaxPayable", balance: 5000 }];
    const txns: RawTxn[] = [
      exp("1", "Lumber Yard", [{ accountName: "Materials", amount: 1000, taxCodeName: "Out of Scope" }]),
    ];
    const r = runHstReview({ accounts, taxCodes: [], txns });
    expect(r.findings.some((f) => f.check === "wrong_tax_code")).toBe(true);
    expect(r.findings.some((f) => f.check === "hst_account_tieout")).toBe(true);
    expect(r.accountTieOut.tied).toBe(false);
  });
});
