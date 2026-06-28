import { describe, it, expect } from "vitest";
import { computeAcb, valueHoldings, unvaluedRows, type CryptoTxn } from "./crypto-core";

describe("crypto ACB + capital gains (CRA moving-average method)", () => {
  it("averages cost across multiple buys, then a partial sell uses the average ACB", () => {
    const txns: CryptoTxn[] = [
      { date: "2026-01-10", asset: "BTC", direction: "acquire", qty: 1, cadValue: 40000 },
      { date: "2026-02-10", asset: "BTC", direction: "acquire", qty: 1, cadValue: 60000 }, // avg ACB now 50,000/coin
      { date: "2026-03-10", asset: "BTC", direction: "dispose", qty: 1, cadValue: 70000 },
    ];
    const r = computeAcb(txns);
    expect(r.disposals).toHaveLength(1);
    expect(r.disposals[0].costBasis).toBe(50000);   // average of 40k + 60k
    expect(r.disposals[0].gainLoss).toBe(20000);     // 70k − 50k
    // one coin left at 50k ACB
    expect(r.holdings).toEqual([{ asset: "BTC", qty: 1, acb: 50000, avgCost: 50000 }]);
    expect(r.totals.gainLoss).toBe(20000);
  });

  it("adds buy fees to cost base and nets sell fees off proceeds", () => {
    const r = computeAcb([
      { date: "2026-01-01", asset: "ETH", direction: "acquire", qty: 10, cadValue: 30000, feeCad: 100 }, // ACB 30,100
      { date: "2026-02-01", asset: "ETH", direction: "dispose", qty: 10, cadValue: 40000, feeCad: 200 }, // proceeds 39,800
    ]);
    expect(r.disposals[0].costBasis).toBe(30100);
    expect(r.disposals[0].proceeds).toBe(39800);
    expect(r.disposals[0].gainLoss).toBe(9700);
    expect(r.holdings).toHaveLength(0); // fully sold
  });

  it("handles a capital loss", () => {
    const r = computeAcb([
      { date: "2026-01-01", asset: "SOL", direction: "acquire", qty: 100, cadValue: 20000 },
      { date: "2026-02-01", asset: "SOL", direction: "dispose", qty: 100, cadValue: 12000 },
    ]);
    expect(r.totals.gainLoss).toBe(-8000);
  });

  it("treats spending/receiving crypto as dispose/acquire at FMV", () => {
    const r = computeAcb([
      { date: "2026-01-01", asset: "BTC", direction: "acquire", qty: 2, cadValue: 80000 }, // 40k/coin
      { date: "2026-03-01", asset: "BTC", direction: "dispose", qty: 0.5, cadValue: 30000 }, // spent 0.5 BTC worth 30k
    ]);
    expect(r.disposals[0].costBasis).toBe(20000); // 0.5 of 80k pool
    expect(r.disposals[0].gainLoss).toBe(10000);
    expect(r.holdings[0].qty).toBe(1.5);
    expect(r.holdings[0].acb).toBe(60000);
  });

  it("flags an oversold disposal instead of crashing", () => {
    const r = computeAcb([
      { date: "2026-01-01", asset: "DOGE", direction: "acquire", qty: 100, cadValue: 50 },
      { date: "2026-02-01", asset: "DOGE", direction: "dispose", qty: 500, cadValue: 400 },
    ]);
    expect(r.disposals[0].oversold).toBe(true);
    expect(r.disposals[0].costBasis).toBe(50); // only the 100 held had basis
    expect(r.holdings).toHaveLength(0);
  });

  it("sorts by date even if rows arrive out of order", () => {
    const r = computeAcb([
      { date: "2026-03-10", asset: "BTC", direction: "dispose", qty: 1, cadValue: 70000 },
      { date: "2026-01-10", asset: "BTC", direction: "acquire", qty: 1, cadValue: 40000 },
      { date: "2026-02-10", asset: "BTC", direction: "acquire", qty: 1, cadValue: 60000 },
    ]);
    expect(r.disposals[0].costBasis).toBe(50000);
  });
});

describe("period-end valuation + data-gap surfacing", () => {
  it("marks holdings to market and computes unrealized", () => {
    const r = computeAcb([{ date: "2026-01-01", asset: "BTC", direction: "acquire", qty: 2, cadValue: 80000 }]);
    const valued = valueHoldings(r.holdings, { BTC: 55000 });
    expect(valued[0].marketValue).toBe(110000);   // 2 × 55k
    expect(valued[0].unrealized).toBe(30000);      // 110k − 80k ACB
  });

  it("counts rows missing a CAD value", () => {
    expect(unvaluedRows([
      { date: "2026-01-01", asset: "BTC", direction: "acquire", qty: 1, cadValue: 0 },
      { date: "2026-01-02", asset: "BTC", direction: "acquire", qty: 1, cadValue: 40000 },
    ])).toBe(1);
  });
});
