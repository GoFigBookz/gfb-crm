import { describe, it, expect } from "vitest";
import { buildRecharge, round2 } from "./interco-recharge-core";

const base = {
  periodLabel: "Fiscal Q2 ending 2026-05-31",
  payerName: "Alderson Developments Ltd.",
  counterpartyName: "Ovita Holdings Inc.",
  revenueAccount: "Sales",
  expenseAccount: "Alderson Project Management Costs",
  hstRatePct: 13,
  chargeHst: true,
};

describe("buildRecharge", () => {
  it("sums net expenses, charges 13% HST, ties invoice to mirror bill", () => {
    const r = buildRecharge({ ...base, expenses: [
      { description: "Site supervision", net: 1000 },
      { description: "Permits", net: 234.99 },
    ]});
    expect(r.invoice.subtotal).toBe(1234.99);
    expect(r.invoice.hst).toBe(round2(1234.99 * 0.13)); // 160.55
    expect(r.invoice.total).toBe(round2(1234.99 + 1234.99 * 0.13));
    // mirror bill is the same money, expense side
    expect(r.bill.total).toBe(r.invoice.total);
    expect(r.bill.party).toBe("Alderson Developments Ltd.");
    expect(r.bill.account).toBe("Alderson Project Management Costs");
    expect(r.invoice.party).toBe("Ovita Holdings Inc.");
    expect(r.invoice.account).toBe("Sales");
    expect(r.validation.ok).toBe(true);
  });

  it("Section 156 election → chargeHst false → no HST", () => {
    const r = buildRecharge({ ...base, chargeHst: false, expenses: [{ description: "x", net: 500 }] });
    expect(r.invoice.hst).toBe(0);
    expect(r.invoice.total).toBe(500);
    expect(r.bill.total).toBe(500);
  });

  it("flags an empty recharge", () => {
    const r = buildRecharge({ ...base, expenses: [] });
    expect(r.validation.ok).toBe(false);
    expect(r.validation.errors.join(" ")).toMatch(/No expense lines/);
  });

  it("flags negative lines for review", () => {
    const r = buildRecharge({ ...base, expenses: [{ description: "credit", net: -50 }] });
    expect(r.validation.ok).toBe(false);
    expect(r.validation.errors.join(" ")).toMatch(/negative/);
  });

  it("rounds HST to the cent", () => {
    const r = buildRecharge({ ...base, expenses: [{ description: "odd", net: 33.33 }] });
    expect(r.invoice.hst).toBe(4.33); // 33.33 * 0.13 = 4.3329 -> 4.33
    expect(r.invoice.total).toBe(37.66);
  });
});
