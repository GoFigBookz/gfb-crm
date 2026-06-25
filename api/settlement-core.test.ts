import { describe, it, expect } from "vitest";
import { suggestSettlements } from "./settlement-core";

describe("suggestSettlements", () => {
  it("clears a simple two-party balance with one transfer", () => {
    const r = suggestSettlements([
      { id: 1, name: "A", net: -100 }, // A owes 100
      { id: 2, name: "B", net: 100 },  // B is owed 100
    ]);
    expect(r.balanced).toBe(true);
    expect(r.transfers).toEqual([{ fromId: 1, from: "A", toId: 2, to: "B", amount: 100, capped: false }]);
    expect(r.residual).toHaveLength(0);
  });

  it("minimises transfers across many parties", () => {
    const r = suggestSettlements([
      { id: 1, name: "A", net: -500 },
      { id: 2, name: "B", net: -200 },
      { id: 3, name: "C", net: 300 },
      { id: 4, name: "D", net: 400 },
    ]);
    expect(r.balanced).toBe(true);
    const total = r.transfers.reduce((s, t) => s + t.amount, 0);
    expect(total).toBeCloseTo(700, 2);
    // biggest debtor A (500) pays biggest creditor D (400) then C (100)
    expect(r.transfers.length).toBeLessThanOrEqual(3);
    for (const t of r.transfers) expect(t.amount).toBeGreaterThan(0);
  });

  it("caps a debtor by available cash and reports the shortfall", () => {
    const r = suggestSettlements([
      { id: 1, name: "A", net: -100, cashAvailable: 60 },
      { id: 2, name: "B", net: 100 },
    ]);
    expect(r.transfers[0].amount).toBe(60);
    expect(r.transfers[0].capped).toBe(true);
    // B is still owed 40; A still owes 40 (cash-capped, deferred).
    expect(r.residual).toContainEqual({ id: 2, name: "B", net: 40 });
    expect(r.residual).toContainEqual({ id: 1, name: "A", net: -40 });
  });

  it("flags an unbalanced group (interco doesn't net to zero)", () => {
    const r = suggestSettlements([
      { id: 1, name: "A", net: -100 },
      { id: 2, name: "B", net: 50 },
    ]);
    expect(r.balanced).toBe(false);
  });

  it("returns nothing when everyone is square", () => {
    const r = suggestSettlements([
      { id: 1, name: "A", net: 0 },
      { id: 2, name: "B", net: 0 },
    ]);
    expect(r.transfers).toHaveLength(0);
    expect(r.balanced).toBe(true);
  });
});
