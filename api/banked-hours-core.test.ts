import { describe, it, expect } from "vitest";
import { buildLedger, summarize, redeemHours, accrueHours, validateMovement, parseOpeningBalances } from "./banked-hours-core";

describe("banked-hours-core — balance & ledger", () => {
  const entries = [
    { entryDate: "2026-01-15", hours: 10, kind: "opening" as const },
    { entryDate: "2026-02-01", hours: 5, kind: "accrue" as const },
    { entryDate: "2026-02-20", hours: -8, kind: "redeem" as const },
  ];

  it("running balance accumulates oldest→newest", () => {
    const led = buildLedger(entries);
    expect(led.map((r) => r.runningBalance)).toEqual([10, 15, 7]);
  });

  it("sorts out-of-order entries before running balance", () => {
    const led = buildLedger([entries[2], entries[0], entries[1]]);
    expect(led.map((r) => r.runningBalance)).toEqual([10, 15, 7]);
  });

  it("summary splits banked vs taken", () => {
    const s = summarize(entries);
    expect(s.balance).toBe(7);
    expect(s.totalBanked).toBe(15);
    expect(s.totalTaken).toBe(8);
    expect(s.entryCount).toBe(3);
    expect(s.lastActivity).toContain("2026-02-20");
  });

  it("empty ledger = zero balance", () => {
    expect(summarize([]).balance).toBe(0);
  });
});

describe("banked-hours-core — movement normalization", () => {
  it("redeemHours is always negative; accrueHours always positive", () => {
    expect(redeemHours(8)).toBe(-8);
    expect(redeemHours(-8)).toBe(-8);
    expect(accrueHours(-5)).toBe(5);
    expect(accrueHours(5)).toBe(5);
  });
});

describe("banked-hours-core — validation", () => {
  it("rejects zero / non-numeric", () => {
    expect(validateMovement(10, 0, "accrue").ok).toBe(false);
  });
  it("warns when a redemption drives the balance negative", () => {
    const v = validateMovement(5, 8, "redeem");
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("negative"))).toBe(true);
  });
  it("clean accrual has no warnings", () => {
    const v = validateMovement(5, 4, "accrue");
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });
});

describe("banked-hours-core — old-sheet import parser", () => {
  it("parses 'Last, First<tab>hours' and 'First Last  hours'", () => {
    const rows = parseOpeningBalances(`Haight, Chris\t12.5\nCorey Hawton   8\nVenditti, Lisa, 3.25\n\ngarbage line`);
    expect(rows).toEqual([
      { name: "Haight Chris", hours: 12.5 },
      { name: "Corey Hawton", hours: 8 },
      { name: "Venditti Lisa", hours: 3.25 },
    ]);
  });
  it("handles negative balances", () => {
    expect(parseOpeningBalances("Dave Lally -2")).toEqual([{ name: "Dave Lally", hours: -2 }]);
  });
});
