import { describe, it, expect } from "vitest";
import {
  YEAR_END_CHECKLIST, summarizeYearEnd, buildPackageManifest,
  fiscalYearLabel, fiscalYearEndDate,
} from "./year-end-core";

describe("fiscal-year helpers", () => {
  it("derives the year-end date from the fiscal-year-end month", () => {
    expect(fiscalYearEndDate(2026, 12)).toBe("2026-12-31");
    expect(fiscalYearEndDate(2026, 3)).toBe("2026-03-31");
    expect(fiscalYearEndDate(2026, 6)).toBe("2026-06-30");
    expect(fiscalYearEndDate(2024, 2)).toBe("2024-02-29"); // leap year
    expect(fiscalYearEndDate(2026, null)).toBe("2026-12-31"); // default Dec
  });

  it("labels the fiscal year readably", () => {
    expect(fiscalYearLabel(2026, "2026-03-31")).toMatch(/FY2026 \(ended Mar 31, 2026\)/);
    expect(fiscalYearLabel(2026, null)).toBe("FY2026");
  });
});

describe("summarizeYearEnd — completion % + close gate", () => {
  it("empty state → 0% and cannot close (required items outstanding)", () => {
    const s = summarizeYearEnd([]);
    expect(s.completionPercent).toBe(0);
    expect(s.canClose).toBe(false);
    expect(s.blockers.length).toBeGreaterThan(0);
    expect(s.requiredTotal).toBeGreaterThan(0);
  });

  it("can close once every required item is done or n/a", () => {
    const required = YEAR_END_CHECKLIST.filter((d) => d.requiredToClose);
    const items = required.map((d) => ({ key: d.key, done: true }));
    const s = summarizeYearEnd(items);
    expect(s.canClose).toBe(true);
    expect(s.blockers).toEqual([]);
    expect(s.requiredDone).toBe(s.requiredTotal);
  });

  it("n/a items drop out of the applicable denominator", () => {
    const s = summarizeYearEnd([
      { key: "recon_bank", done: true },
      { key: "recon_cc", na: true },
    ]);
    expect(s.na).toBe(1);
    expect(s.applicable).toBe(YEAR_END_CHECKLIST.length - 1);
  });

  it("a required item marked n/a still satisfies the close gate", () => {
    const required = YEAR_END_CHECKLIST.filter((d) => d.requiredToClose);
    const items = required.map((d, i) => ({ key: d.key, done: i !== 0, na: i === 0 }));
    expect(summarizeYearEnd(items).canClose).toBe(true);
  });
});

describe("buildPackageManifest — the honest contents list", () => {
  it("marks pulled reports included, un-pullable ones manual (never faked)", () => {
    const m = buildPackageManifest({
      qboConnected: true,
      reports: { trialBalance: true, generalLedger: false, balanceSheet: true, profitAndLoss: undefined },
    });
    const byKey = Object.fromEntries(m.items.map((i) => [i.key, i.status]));
    expect(byKey.trial_balance).toBe("included");
    expect(byKey.balance_sheet).toBe("included");
    expect(byKey.general_ledger).toBe("manual"); // tried & failed → manual, not faked
    expect(byKey.profit_loss).toBe("manual");
  });

  it("statements track the recon rollup; behind accounts → missing", () => {
    const behind = buildPackageManifest({ recon: { totalAccounts: 5, reconciledThrough: 3, behind: 2 } });
    expect(behind.items.find((i) => i.key === "statements")!.status).toBe("missing");
    const caught = buildPackageManifest({ recon: { totalAccounts: 5, reconciledThrough: 5, behind: 0 } });
    expect(caught.items.find((i) => i.key === "statements")!.status).toBe("manual");
  });

  it("notes + accountant flip to included when provided", () => {
    const m = buildPackageManifest({ notes: "Recorded CCA, wrote off Smith A/R.", accountant: { name: "Jane CPA", email: "jane@cpa.ca" } });
    expect(m.items.find((i) => i.key === "notes")!.status).toBe("included");
    expect(m.items.find((i) => i.key === "accountant")!.status).toBe("included");
  });

  it("ready = nothing hard-missing (manual items are a to-do, not a blocker)", () => {
    const notReady = buildPackageManifest({ recon: { totalAccounts: 2, reconciledThrough: 0, behind: 2 } });
    expect(notReady.ready).toBe(false); // statements missing
    const ready = buildPackageManifest({
      qboConnected: true,
      reports: { trialBalance: true, generalLedger: true, balanceSheet: true, profitAndLoss: true },
      recon: { totalAccounts: 2, reconciledThrough: 2, behind: 0 },
      notes: "All good.",
      accountant: { email: "jane@cpa.ca" },
      items: [{ key: "pkg_statements", done: true }, { key: "pkg_recon", done: true }],
    });
    expect(ready.ready).toBe(true);
  });
});
