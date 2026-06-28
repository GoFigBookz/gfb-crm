import { describe, it, expect } from "vitest";
import { parseCryptoCsv } from "./crypto-parse-core";

describe("parseCryptoCsv — eats whatever report the client sends", () => {
  it("reads a standard exchange CSV with CAD value", () => {
    const csv = [
      "Date,Type,Asset,Amount,CAD Value,Fee",
      "2026-01-10,Buy,BTC,1,40000,20",
      "2026-03-10,Sell,BTC,1,70000,35",
    ].join("\n");
    const r = parseCryptoCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-01-10", asset: "BTC", direction: "acquire", qty: 1, cadValue: 40000, feeCad: 20 });
    expect(r.rows[1].direction).toBe("dispose");
  });

  it("flags mining/staking rewards as income acquisitions", () => {
    const csv = "date,activity,symbol,qty,value cad\n2026-02-01,Mining Reward,BTC,0.05,3000";
    const r = parseCryptoCsv(csv);
    expect(r.rows[0]).toMatchObject({ direction: "acquire", income: true, asset: "BTC", cadValue: 3000 });
  });

  it("handles different column names + synonyms (symbol/quantity/proceeds/side)", () => {
    const csv = "Timestamp;Side;Currency;Quantity;Proceeds;Commission\n2026/04/01;SOLD;ETH;10;40000;100";
    const r = parseCryptoCsv(csv);
    expect(r.columns.cadValue).toBe("proceeds");
    expect(r.rows[0]).toMatchObject({ asset: "ETH", direction: "dispose", qty: 10, cadValue: 40000, feeCad: 100 });
  });

  it("normalizes dates: day>12 forces dd/mm, otherwise mm/dd", () => {
    const csv = "Date,Type,Asset,Amount\n25/12/2026,Buy,BTC,1\n03/04/2026,Buy,ETH,2";
    const r = parseCryptoCsv(csv);
    expect(r.rows[0].date).toBe("2026-12-25"); // 25 must be the day → dd/mm
    expect(r.rows[1].date).toBe("2026-03-04"); // ambiguous → mm/dd (March 4)
  });

  it("leaves cadValue 0 when the report has no value column (priced later)", () => {
    const csv = "Date,Type,Asset,Amount\n2026-01-01,Buy,BTC,1";
    const r = parseCryptoCsv(csv);
    expect(r.rows[0].cadValue).toBe(0);
  });

  it("skips rows it can't classify, with a warning, instead of crashing", () => {
    const csv = "Date,Type,Asset,Amount\n2026-01-01,Buy,BTC,1\n2026-01-02,Rebalance?,BTC,1";
    const r = parseCryptoCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings.join(" ")).toMatch(/couldn't tell/i);
  });

  it("reads tab-separated reports too", () => {
    const csv = "Date\tType\tAsset\tAmount\tCAD\n2026-01-01\tBuy\tBTC\t1\t40000";
    const r = parseCryptoCsv(csv);
    expect(r.rows[0]).toMatchObject({ asset: "BTC", cadValue: 40000 });
  });
});
