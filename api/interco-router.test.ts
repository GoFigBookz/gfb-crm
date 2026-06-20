import { describe, it, expect } from "vitest";
import { buildIntercoJe } from "./interco-router";

const nameOf = (id: number) => ({ 2: "Motion Invest", 3: "Seahorse" }[id] ?? `#${id}`);

describe("buildIntercoJe", () => {
  it("nets many lines per counterparty and balances debits/credits", () => {
    const je = buildIntercoJe({
      intercoAccount: "1310 Interco:2303851",
      offsetAccount: "1060 Bank",
      entries: [
        { counterpartyClientId: 2, amount: 1000 },
        { counterpartyClientId: 2, amount: 500 },
        { counterpartyClientId: 3, amount: 250 },
      ],
      nameOf,
    });
    expect(je.balanced).toBe(true);
    expect(je.totalDebit).toBe(je.totalCredit);
    expect(je.net).toBe(1750);
    // two interco DR lines (MI 1500, SH 250) + one contra CR line
    expect(je.lines.filter((l) => l.debit > 0)).toHaveLength(2);
    expect(je.lines.find((l) => l.account === "1060 Bank")?.credit).toBe(1750);
  });

  it("reverses direction when the payer owes the counterparty (negative net)", () => {
    const je = buildIntercoJe({
      intercoAccount: "1310 Interco", offsetAccount: "1060 Bank",
      entries: [{ counterpartyClientId: 2, amount: -800 }], nameOf,
    });
    expect(je.balanced).toBe(true);
    expect(je.lines.find((l) => l.account === "1310 Interco")?.credit).toBe(800);
    expect(je.lines.find((l) => l.account === "1060 Bank")?.debit).toBe(800);
  });

  it("drops counterparties that net to zero", () => {
    const je = buildIntercoJe({
      intercoAccount: "X", offsetAccount: "Y",
      entries: [{ counterpartyClientId: 2, amount: 300 }, { counterpartyClientId: 2, amount: -300 }], nameOf,
    });
    expect(je.lines).toHaveLength(0);
    expect(je.net).toBe(0);
  });

  it("uses placeholder labels when accounts are not yet selected (never invents)", () => {
    const je = buildIntercoJe({ entries: [{ counterpartyClientId: 2, amount: 100 }], nameOf });
    expect(je.lines[0].account).toContain("select from chart");
    expect(je.balanced).toBe(true);
  });
});
