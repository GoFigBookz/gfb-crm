import { describe, it, expect } from "vitest";
import { findCrossAccountDuplicates, type Payment } from "./payment-source-core";

describe("findCrossAccountDuplicates", () => {
  it("flags an expense that hits the bank AND a credit card (same company)", () => {
    const pays: Payment[] = [
      { vendor: "Hydro One", amount: 240.5, date: "2026-03-10", account: "Chequing 8976", entity: "Ovita Construction" },
      { vendor: "Hydro One", amount: 240.5, date: "2026-03-11", account: "Visa 1234", entity: "Ovita Construction" },
      { vendor: "Staples", amount: 60, date: "2026-03-12", account: "Chequing 8976", entity: "Ovita Construction" },
    ];
    const r = findCrossAccountDuplicates(pays);
    expect(r.summary.flaggedGroups).toBe(1);
    expect(r.duplicates[0].vendor).toBe("Hydro One");
    expect(r.duplicates[0].accounts.sort()).toEqual(["Chequing 8976", "Visa 1234"]);
  });

  it("flags an expense paid by a DIFFERENT Rocco entity (who paid it)", () => {
    const pays: Payment[] = [
      { vendor: "Enbridge", amount: 512.33, date: "2026-03-05", account: "Chequing 8976", entity: "Ovita Construction" },
      { vendor: "Enbridge", amount: 512.33, date: "2026-03-05", account: "Visa", entity: "Alderson" },
    ];
    const r = findCrossAccountDuplicates(pays);
    expect(r.duplicates[0].entities.sort()).toEqual(["Alderson", "Ovita Construction"]);
  });

  it("does not flag a single clean payment", () => {
    const r = findCrossAccountDuplicates([{ vendor: "Bell", amount: 100, date: "2026-03-01", account: "Chequing", entity: "X" }]);
    expect(r.summary.flaggedGroups).toBe(0);
  });

  it("normalizes vendor name + amount sign when matching", () => {
    const r = findCrossAccountDuplicates([
      { vendor: "HYDRO ONE.", amount: 240.5, date: "2026-03-10", account: "Bank", entity: "A" },
      { vendor: "Hydro One", amount: -240.5, date: "2026-03-11", account: "Card", entity: "A" },
    ]);
    expect(r.summary.flaggedGroups).toBe(1);
  });

  it("rolls up totals by account", () => {
    const r = findCrossAccountDuplicates([
      { vendor: "A", amount: 100, date: "d", account: "Bank", entity: "X" },
      { vendor: "B", amount: 50, date: "d", account: "Bank", entity: "X" },
    ]);
    expect(r.byAccount.find((a) => a.account === "Bank")!.total).toBe(150);
  });
});
