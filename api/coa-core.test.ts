import { describe, it, expect } from "vitest";
import { buildCoaCsv, diffCharts, parseTrialBalance, reconcileToTrialBalance, reviewChartForCleanup, suggestCleanName, type AcctRow } from "./coa-core";

const A = (num: string, name: string, type = "Expense", balance = 0): AcctRow => ({ num, name, type, balance, active: true });

describe("coa-core — csv", () => {
  it("builds a CSV with a header + escaped fields", () => {
    const csv = buildCoaCsv([A("1500", "Accounts, Receivable", "Accounts Receivable", 1200)]);
    expect(csv.split("\n")[0]).toBe("Number,Name,Type,SubType,Balance,Active");
    expect(csv).toContain('"Accounts, Receivable"');
  });
});

describe("coa-core — diff two charts (marry Clark OS ↔ CW)", () => {
  it("matches by number, flags name/type/number differences + onlys", () => {
    const os = [A("1000", "Chequing", "Bank", 5000), A("1500", "Accounts Receivable", "Accounts Receivable", 1200), A("1200", "Inventory", "Other Current Asset", 800)];
    const cw = [A("1000", "Operating Chequing", "Bank", 6000), A("1500", "Accounts Receivable", "Accounts Receivable", 900), A("1205", "Inventory", "Other Current Asset", 700)];
    const { entries, summary } = diffCharts(os, cw);
    expect(summary.match).toBe(1);                                  // 1500 matches
    expect(entries.find((e) => e.num === "1000")?.issue).toBe("name_differs"); // Chequing vs Operating Chequing
    expect(entries.find((e) => e.a?.name === "Inventory")?.issue).toBe("number_differs"); // 1200 vs 1205, same name
  });
});

describe("coa-core — single-chart cleanup review (no marrying needed)", () => {
  it("suggests professional Title Case + keeps acronyms", () => {
    expect(suggestCleanName("office supplies")).toBe("Office Supplies");
    expect(suggestCleanName("HST PAYABLE")).toBe("HST Payable");
    expect(suggestCleanName("cost of goods sold")).toBe("Cost of Goods Sold");
    expect(suggestCleanName("PayPal Fees")).toBe("PayPal Fees");
  });

  it("flags duplicates, missing numbers, casing, abbreviations + inactive-with-balance", () => {
    const rows: AcctRow[] = [
      { num: "6000", name: "office supplies", type: "Expense", balance: 100, active: true },
      { num: "6000", name: "Office Supplies", type: "Expense", balance: 50, active: true },   // dup number
      { num: "", name: "Misc Exp", type: "Expense", balance: 0, active: true },               // missing num + abbrev
      { num: "1900", name: "Old Account", type: "Bank", balance: 250, active: false },        // inactive w/ balance
      { num: "4000", name: "Sales Revenue", type: "Income", balance: 9000, active: true },    // clean
    ];
    const { findings, summary } = reviewChartForCleanup(rows);
    expect(findings.some((f) => f.issue === "duplicate_number" && f.num === "6000")).toBe(true);
    expect(findings.some((f) => f.issue === "missing_number")).toBe(true);
    expect(findings.some((f) => f.issue === "abbreviation" && f.suggestion === "Miscellaneous Expense")).toBe(true);
    expect(findings.some((f) => f.issue === "inactive_with_balance")).toBe(true);
    expect(findings.some((f) => f.issue === "casing" && f.suggestion === "Office Supplies")).toBe(true);
    expect(summary.clean).toBe(1); // only Sales Revenue is untouched
  });
});

describe("coa-core — trial balance parse + reconcile (the tie-out gate)", () => {
  it("parses pasted TB with numbers, $ and parens-negatives", () => {
    const tb = parseTrialBalance("Account, Balance\n1000  Chequing  $5,000.00\n1500\tAccounts Receivable\t1,200.00\n3000 Retained Earnings (2,300.00)");
    expect(tb.find((t) => t.num === "1000")?.balance).toBe(5000);
    expect(tb.find((t) => t.num === "3000")?.balance).toBe(-2300);
  });

  it("reconciles QBO balances to the TB and flags differences", () => {
    const qbo = [A("1000", "Chequing", "Bank", 5000), A("1500", "Accounts Receivable", "Accounts Receivable", 1250)];
    const tb = parseTrialBalance("1000 Chequing 5000\n1500 Accounts Receivable 1200\n2000 Accounts Payable 900");
    const r = reconcileToTrialBalance(qbo, tb);
    expect(r.tied).toBe(false);
    expect(r.entries.find((e) => e.num === "1500")?.status).toBe("differs"); // 1250 vs 1200
    expect(r.entries.find((e) => e.num === "1500")?.diff).toBe(50);
    expect(r.entries.find((e) => e.num === "2000")?.status).toBe("only_tb"); // AP missing from QBO pull
    expect(r.entries.find((e) => e.num === "1000")?.status).toBe("match");
  });
});
