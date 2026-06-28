import { describe, it, expect } from "vitest";
import { parseReconPaste, parseLooseDate, accountStatus, summarizeRecon } from "./recon-tracker-core";

describe("parseLooseDate", () => {
  it("reads 'Apr 01, 2026' and 'May 31, 2026'", () => {
    expect(parseLooseDate("Apr 01, 2026")).toBe("2026-04-01");
    expect(parseLooseDate("May 31, 2026")).toBe("2026-05-31");
  });
  it("reads 'May 2026' as the month-end", () => {
    expect(parseLooseDate("May 2026")).toBe("2026-05-31");
    expect(parseLooseDate("Feb 2026")).toBe("2026-02-28");
  });
});

describe("parseReconPaste — the exact format Markie pastes", () => {
  const block = `
* PayPal  - Reconciled until May 31, 2026
* Stripe - The Stripe account has no transactions, which Stripe account should I look into?
* RBC CAD *0488 - Reconciled up to Apr 01, 2026  (Need Apr & May statements)
* AMEX  *1001 - Reconciled up to Jan 05, 2026  (Need Jan-May statements)
`;
  const rows = parseReconPaste(block);

  it("pulls the account name, reconciled-through date, and statements-needed", () => {
    const paypal = rows.find((r) => r.name.startsWith("PayPal"))!;
    expect(paypal.reconciledThrough).toBe("2026-05-31");
    expect(paypal.kind).toBe("processor");

    const rbc = rows.find((r) => r.name.startsWith("RBC CAD"))!;
    expect(rbc.reconciledThrough).toBe("2026-04-01");
    expect(rbc.needsStatements).toMatch(/Apr & May/);
    expect(rbc.kind).toBe("bank");

    const amex = rows.find((r) => r.name.startsWith("AMEX"))!;
    expect(amex.reconciledThrough).toBe("2026-01-05");
    expect(amex.kind).toBe("credit_card");
  });

  it("keeps the Stripe 'no transactions' line as a note, not a fake date", () => {
    const stripe = rows.find((r) => r.name === "Stripe")!;
    expect(stripe.reconciledThrough).toBeNull();
    expect(stripe.note).toMatch(/no transactions/i);
  });

  it("reads 'Done for May 2026' as reconciled through month-end", () => {
    const r = parseReconPaste("CAD Chequing - Done for May 2026");
    expect(r[0].reconciledThrough).toBe("2026-05-31");
  });
});

describe("accountStatus + rollup vs the close period-end", () => {
  const periodEnd = "2026-05-31";
  it("flags an account reconciled short of period-end as behind, with months behind", () => {
    const amex = accountStatus({ name: "AMEX", reconciledThrough: "2026-01-05" }, periodEnd);
    expect(amex.behind).toBe(true);
    expect(amex.monthsBehind).toBeGreaterThanOrEqual(4);
  });
  it("an account reconciled to period-end is current", () => {
    const pp = accountStatus({ name: "PayPal", reconciledThrough: "2026-05-31" }, periodEnd);
    expect(pp.current).toBe(true);
    expect(pp.behind).toBe(false);
  });
  it("no recon date = not done", () => {
    expect(accountStatus({ name: "New" }, periodEnd).behind).toBe(true);
  });
  it("rollup builds the statement pull-list and worst-behind", () => {
    const accts = parseReconPaste(`
RBC CAD *0488 - Reconciled up to Apr 01, 2026  (Need Apr & May statements)
AMEX *1001 - Reconciled up to Jan 05, 2026  (Need Jan-May statements)
PayPal - Reconciled until May 31, 2026
`);
    const r = summarizeRecon(accts, periodEnd);
    expect(r.total).toBe(3);
    expect(r.current).toBe(1);
    expect(r.behind).toBe(2);
    expect(r.needingStatements).toBe(2);
    expect(r.statementPullList.map((p) => p.name)).toContain("AMEX *1001");
    expect(r.worstMonthsBehind).toBeGreaterThanOrEqual(4);
  });
});
