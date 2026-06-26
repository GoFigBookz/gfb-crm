import { describe, it, expect } from "vitest";
import { parseMoney, findMoneys, findDate, parseBankStatement } from "./pdf-statement-core";

describe("parseMoney", () => {
  it("handles commas, $, parens, trailing minus", () => {
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("$2,000.00")).toBe(2000);
    expect(parseMoney("(45.00)")).toBe(-45);
    expect(parseMoney("226.00-")).toBe(-226);
  });
});

describe("findDate", () => {
  it("reads common bank formats + carries the year", () => {
    expect(findDate("2026-03-14 PURCHASE 12.00")?.iso).toBe("2026-03-14");
    expect(findDate("03/14/2026 X")?.iso).toBe("2026-03-14");
    expect(findDate("Mar 14 Home Depot 226.00 1,000.00", 2026)?.iso).toBe("2026-03-14");
    expect(findDate("14 Mar Deposit", 2026)?.iso).toBe("2026-03-14");
    expect(findDate("Service charge 4.00")).toBeNull();
  });
});

describe("findMoneys", () => {
  it("pulls all money tokens in order", () => {
    const m = findMoneys("Mar 14 HOME DEPOT 226.00 1,000.00");
    expect(m.map((x) => x.value)).toEqual([226, 1000]);
  });
});

describe("parseBankStatement — running balance (exact signs + tie-out)", () => {
  const lines = [
    "Opening Balance 1,000.00",
    "Mar 02 Payroll deposit 2,000.00 3,000.00",   // +2000 (balance up)
    "Mar 03 Home Depot cheque 226.00 2,774.00",   // -226  (balance down)
    "Mar 10 Service charge 4.00 2,770.00",        // -4
    "Closing Balance 2,770.00",
  ];
  const r = parseBankStatement(lines, { year: 2026 });

  it("signs amounts from the balance delta (no per-bank template)", () => {
    expect(r.method).toBe("balance");
    const byDesc = Object.fromEntries(r.transactions.map((t) => [t.description.replace(/\s+/g, " ").trim(), t.amount]));
    expect(r.transactions.find((t) => /Payroll/.test(t.description))?.amount).toBe(2000);
    expect(r.transactions.find((t) => /Home Depot/.test(t.description))?.amount).toBe(-226);
    expect(r.transactions.find((t) => /Service/.test(t.description))?.amount).toBe(-4);
  });
  it("ties out: opening + Σ == closing", () => {
    expect(r.openingBalance).toBe(1000);
    expect(r.closingBalance).toBe(2770);
    expect(r.tieOut.ok).toBe(true);
    expect(r.tieOut.diff).toBe(0);
  });
  it("extracts 3 transactions, not the balance summary lines", () => {
    expect(r.transactions).toHaveLength(3);
  });
});

describe("parseBankStatement — no balance column (keyword fallback)", () => {
  const lines = [
    "03/01/2026 Client deposit 1,500.00",
    "03/02/2026 Cheque #101 payment 250.50",
    "03/05/2026 Interac purchase 40.00",
  ];
  const r = parseBankStatement(lines, { year: 2026 });
  it("signs by keyword when there's no running balance", () => {
    expect(r.method).toBe("keyword");
    expect(r.transactions.find((t) => /deposit/i.test(t.description))?.amount).toBe(1500);
    expect(r.transactions.find((t) => /payment/i.test(t.description))?.amount).toBe(-250.5);
  });
});

describe("parseBankStatement — empty / scanned", () => {
  it("warns when nothing parses (likely scanned image)", () => {
    const r = parseBankStatement(["Acme Bank", "Page 1 of 2"], {});
    expect(r.transactions).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/scanned image|No transactions/i);
  });
});
