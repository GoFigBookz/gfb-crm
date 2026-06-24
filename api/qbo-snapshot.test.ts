import { describe, it, expect } from "vitest";
import { balanceSheetFromAccounts, reportGroupValue, profitAndLossFromReport } from "./qbo-snapshot";

describe("balanceSheetFromAccounts", () => {
  it("sums CurrentBalance by classification, skips inactive", () => {
    const rows = [
      { classification: "Asset", currentBalance: 1000, active: true },
      { classification: "Asset", currentBalance: 500, active: true },
      { classification: "Liability", currentBalance: 300, active: true },
      { classification: "Equity", currentBalance: 1200, active: true },
      { classification: "Asset", currentBalance: 9999, active: false }, // ignored
      { classification: "Revenue", currentBalance: 5000, active: true }, // not a BS line
    ];
    expect(balanceSheetFromAccounts(rows)).toEqual({ assets: 1500, liabilities: 300, equity: 1200 });
  });
  it("is case-insensitive and tolerates nulls", () => {
    const rows = [
      { classification: "asset", currentBalance: 100, active: null },
      { classification: null, currentBalance: 50, active: true },
      { classification: "LIABILITY", currentBalance: null, active: true },
    ];
    expect(balanceSheetFromAccounts(rows as any)).toEqual({ assets: 100, liabilities: 0, equity: 0 });
  });
});

// Representative QBO ProfitAndLoss report (calendar YTD, accrual).
const PL_REPORT = {
  Header: { ReportName: "ProfitAndLoss" },
  Columns: { Column: [{ ColTitle: "" }, { ColTitle: "Total" }] },
  Rows: {
    Row: [
      { group: "Income", type: "Section", Summary: { ColData: [{ value: "Total Income" }, { value: "50000.00" }] } },
      { group: "COGS", type: "Section", Summary: { ColData: [{ value: "Total Cost of Goods Sold" }, { value: "10000.00" }] } },
      { group: "GrossProfit", Summary: { ColData: [{ value: "Gross Profit" }, { value: "40000.00" }] } },
      { group: "Expenses", type: "Section", Summary: { ColData: [{ value: "Total Expenses" }, { value: "15000.00" }] } },
      { group: "NetIncome", Summary: { ColData: [{ value: "Net Income" }, { value: "25000.00" }] } },
    ],
  },
};

describe("reportGroupValue", () => {
  it("extracts the total for a top-level group", () => {
    expect(reportGroupValue(PL_REPORT, "Income")).toBe(50000);
    expect(reportGroupValue(PL_REPORT, "NetIncome")).toBe(25000);
    expect(reportGroupValue(PL_REPORT, "Expenses")).toBe(15000);
  });
  it("returns null for a missing group or empty report", () => {
    expect(reportGroupValue(PL_REPORT, "Nonexistent")).toBeNull();
    expect(reportGroupValue({}, "Income")).toBeNull();
    expect(reportGroupValue(null, "Income")).toBeNull();
  });
  it("finds a group nested under a section", () => {
    const nested = { Rows: { Row: [{ group: "Outer", Rows: { Row: [{ group: "NetIncome", Summary: { ColData: [{ value: "x" }, { value: "777" }] } }] } }] } };
    expect(reportGroupValue(nested, "NetIncome")).toBe(777);
  });
});

describe("profitAndLossFromReport", () => {
  it("reconciles expenses to revenue − netIncome (folds in COGS)", () => {
    const r = profitAndLossFromReport(PL_REPORT);
    expect(r.revenue).toBe(50000);
    expect(r.netIncome).toBe(25000);
    expect(r.expenses).toBe(25000); // 50000 − 25000 = COGS 10000 + Expenses 15000
  });
  it("falls back to Expenses+COGS when NetIncome is absent", () => {
    const noNet = { Rows: { Row: [
      { group: "Income", Summary: { ColData: [{ value: "Total Income" }, { value: "800" }] } },
      { group: "COGS", Summary: { ColData: [{ value: "COGS" }, { value: "100" }] } },
      { group: "Expenses", Summary: { ColData: [{ value: "Total Expenses" }, { value: "200" }] } },
    ] } };
    const r = profitAndLossFromReport(noNet);
    expect(r.revenue).toBe(800);
    expect(r.netIncome).toBeNull();
    expect(r.expenses).toBe(300);
  });
  it("returns all-null for an unrecognised shape (never throws)", () => {
    expect(profitAndLossFromReport({ foo: "bar" })).toEqual({ revenue: null, expenses: null, netIncome: null });
  });
});
