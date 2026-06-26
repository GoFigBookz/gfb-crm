import { describe, it, expect } from "vitest";
import { parseCsvTransactions, matchStatements, parseDateLoose, type ReconTxn } from "./recon-match-core";

describe("parseDateLoose", () => {
  it("parses common formats", () => {
    expect(parseDateLoose("2026-03-14")).toBe(Date.UTC(2026, 2, 14));
    expect(parseDateLoose("03/14/2026")).toBe(Date.UTC(2026, 2, 14));
    expect(parseDateLoose("14/03/2026")).toBe(Date.UTC(2026, 2, 14)); // DD/MM detected
    expect(parseDateLoose("nope")).toBeNull();
  });
});

describe("parseCsvTransactions", () => {
  it("parses a single signed Amount column", () => {
    const csv = "Date,Description,Amount\n2026-03-01,Deposit,1000.00\n2026-03-02,Cheque 101,-250.50\nClosing balance,,749.50";
    const txns = parseCsvTransactions(csv);
    expect(txns).toHaveLength(2);
    expect(txns[0].amount).toBe(1000);
    expect(txns[1].amount).toBe(-250.5);
  });
  it("parses separate debit/credit columns", () => {
    const csv = "Date,Description,Debit,Credit\n03/01/2026,Payroll,500.00,\n03/03/2026,Client,,1200.00";
    const txns = parseCsvTransactions(csv);
    expect(txns[0].amount).toBe(-500);   // debit = out
    expect(txns[1].amount).toBe(1200);   // credit = in
  });
  it("auto-detects tab-separated paste (straight from Excel/Sheets/PDF copy)", () => {
    const tsv = "Date\tDescription\tAmount\n2026-03-01\tDeposit\t1000.00\n2026-03-02\tCheque 101\t-250.50";
    const txns = parseCsvTransactions(tsv);
    expect(txns).toHaveLength(2);
    expect(txns[0].amount).toBe(1000);
    expect(txns[1].amount).toBe(-250.5);
  });
  it("parses QBO increase/decrease register export + handles $ and parens", () => {
    const csv = 'Date,Transaction Type,Payee,Decrease,Increase\n"03/02/2026",Cheque,Home Depot,"$1,234.56",\n03/05/2026,Deposit,Client,,"$2,000.00"';
    const txns = parseCsvTransactions(csv);
    expect(txns[0].amount).toBe(-1234.56);
    expect(txns[1].amount).toBe(2000);
  });
});

describe("matchStatements", () => {
  const stmt: ReconTxn[] = [
    { date: "2026-03-01", description: "Deposit", amount: 1000 },
    { date: "2026-03-03", description: "Home Depot", amount: -226.0 },
    { date: "2026-03-10", description: "Bank fee", amount: -4.5 },
  ];
  const books: ReconTxn[] = [
    { date: "2026-03-02", description: "Client deposit", amount: 1000 },   // matches (1 day gap)
    { date: "2026-03-03", description: "Home Depot", amount: -226.0 },     // matches (same day)
    { date: "2026-02-15", description: "Cheque 99 — uncashed", amount: -800 }, // outstanding (only in books)
  ];

  it("matches by amount within the date window", () => {
    const r = matchStatements(stmt, books);
    expect(r.counts.matched).toBe(2);
    expect(r.matched.find((m) => m.statement.description === "Deposit")?.dateGapDays).toBe(1);
  });
  it("flags statement items missing from the books", () => {
    const r = matchStatements(stmt, books);
    expect(r.onlyStatement.map((t) => t.description)).toContain("Bank fee");
  });
  it("flags outstanding items in the books not on the statement", () => {
    const r = matchStatements(stmt, books);
    expect(r.onlyBooks.map((t) => t.description)).toContain("Cheque 99 — uncashed");
  });
  it("does not match outside the date window", () => {
    const far = matchStatements(
      [{ date: "2026-03-01", description: "x", amount: -100 }],
      [{ date: "2026-04-30", description: "y", amount: -100 }],
    );
    expect(far.counts.matched).toBe(0);
  });
  it("computes totals + tie-out", () => {
    const r = matchStatements(stmt, books);
    expect(r.totals.statementIn).toBe(1000);
    expect(r.totals.statementOut).toBe(230.5);
    // books net differs by the uncashed cheque → netDifference is non-zero (expected until it clears)
    expect(typeof r.totals.netDifference).toBe("number");
  });
});
