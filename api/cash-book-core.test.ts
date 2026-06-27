import { describe, it, expect } from "vitest";
import {
  buildRegister, closingBalance, summarize, categoryTotals, inRange,
  reconcile, validateEntry, signedAmount, type CashEntry,
} from "./cash-book-core";

const E = (d: string, dir: "in" | "out", amount: number, extra: Partial<CashEntry> = {}): CashEntry =>
  ({ entryDate: d, direction: dir, amount, ...extra });

describe("cash-book-core — signed + register", () => {
  it("signs deposits + and payments -", () => {
    expect(signedAmount({ direction: "in", amount: 100 })).toBe(100);
    expect(signedAmount({ direction: "out", amount: 100 })).toBe(-100);
    expect(signedAmount({ direction: "out", amount: -100 })).toBe(-100); // magnitude only
  });

  it("builds a running balance oldest→newest, stable on same day", () => {
    const rows = buildRegister(
      [E("2026-01-10", "out", 40), E("2026-01-05", "in", 100), E("2026-01-10", "in", 10)],
      50,
    );
    // sorted: Jan5 +100 → 150, Jan10 -40 → 110, Jan10 +10 → 120 (same-day order preserved)
    expect(rows.map((r) => r.balance)).toEqual([150, 110, 120]);
  });

  it("handles cents without float drift", () => {
    const rows = buildRegister([E("2026-01-01", "in", 0.1), E("2026-01-02", "in", 0.2)], 0);
    expect(rows[1].balance).toBe(0.3);
  });
});

describe("cash-book-core — summary", () => {
  const entries = [
    E("2026-01-01", "in", 1130, { hst: 130, category: "Sales / revenue" }),
    E("2026-01-15", "out", 226, { hst: 26, category: "Materials / supplies" }),
    E("2026-01-20", "out", 50, { category: "Bank charges" }),
  ];

  it("totals in/out/net/closing + HST split", () => {
    const s = summarize(entries, 200);
    expect(s.totalIn).toBe(1130);
    expect(s.totalOut).toBe(276);
    expect(s.net).toBe(854);
    expect(s.closingBalance).toBe(1054);
    expect(s.hstCollected).toBe(130);
    expect(s.hstPaid).toBe(26);
    expect(s.count).toBe(3);
  });

  it("closingBalance matches summary", () => {
    expect(closingBalance(entries, 200)).toBe(summarize(entries, 200).closingBalance);
  });
});

describe("cash-book-core — categories + range", () => {
  it("rolls up by direction+category, uncategorized not dropped", () => {
    const cats = categoryTotals([
      E("2026-01-01", "in", 100, { category: "Sales / revenue" }),
      E("2026-01-02", "in", 50, { category: "Sales / revenue" }),
      E("2026-01-03", "out", 30, { category: "Rent" }),
      E("2026-01-04", "out", 20, {}),
    ]);
    const sales = cats.find((c) => c.category === "Sales / revenue")!;
    expect(sales.total).toBe(150);
    expect(sales.count).toBe(2);
    expect(cats.some((c) => c.category === "(uncategorized)")).toBe(true);
  });

  it("inRange is inclusive of both ends (whole end day)", () => {
    const entries = [E("2026-01-01", "in", 1), E("2026-02-15", "in", 1), E("2026-03-31", "in", 1)];
    const q1 = inRange(entries, "2026-01-01", "2026-03-31");
    expect(q1.length).toBe(3);
    const feb = inRange(entries, "2026-02-01", "2026-02-28");
    expect(feb.length).toBe(1);
  });
});

describe("cash-book-core — reconcile", () => {
  const entries = [
    E("2026-01-01", "in", 1000, { cleared: true }),
    E("2026-01-05", "out", 300, { cleared: true }),
    E("2026-01-28", "out", 150, { cleared: false }), // cheque not yet cashed
  ];

  it("ties cleared book to the statement (uncleared in transit)", () => {
    const rec = reconcile(entries, 700, 0); // bank shows 700 (1000-300)
    expect(rec.bookBalance).toBe(550);
    expect(rec.clearedBalance).toBe(700);
    expect(rec.difference).toBe(0);
    expect(rec.reconciled).toBe(true);
    expect(rec.unclearedCount).toBe(1);
    expect(rec.unclearedTotal).toBe(-150);
  });

  it("flags an out-of-balance rec", () => {
    const rec = reconcile(entries, 690, 0);
    expect(rec.reconciled).toBe(false);
    expect(rec.difference).toBe(-10);
  });
});

describe("cash-book-core — validation", () => {
  it("accepts a good entry", () => {
    expect(validateEntry({ entryDate: "2026-01-01", direction: "in", amount: 100 })).toEqual([]);
  });
  it("rejects bad amount/direction/date and over-HST", () => {
    expect(validateEntry({ entryDate: "2026-01-01", direction: "in", amount: 0 }).some((p) => p.field === "amount")).toBe(true);
    expect(validateEntry({ entryDate: "bad", direction: "in", amount: 1 }).some((p) => p.field === "entryDate")).toBe(true);
    expect(validateEntry({ entryDate: "2026-01-01", direction: "sideways" as any, amount: 1 }).some((p) => p.field === "direction")).toBe(true);
    expect(validateEntry({ entryDate: "2026-01-01", direction: "out", amount: 100, hst: 200 }).some((p) => p.field === "hst")).toBe(true);
  });
});
