import { describe, it, expect } from "vitest";
import {
  buildProjectSchedule,
  generateJeForPeriod,
  validateForPosting,
  rollupProject,
  buildRevenueCalendar,
  fiscalYearMonths,
  firstDayOfNextPeriod,
  lastDayOfPeriod,
  latestPeriod,
  tagJeWithJob,
  round2,
  clampPct,
} from "./revrec-core";

describe("revrec-core — POC math", () => {
  it("earned/revenue/asset/deferred for a simple underbilled period", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000 },
      [{ periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 20000 }],
    );
    const p = sched[0];
    expect(p.earnedToDate).toBe(25000); // 100000 * .25
    expect(p.revenueThisPeriod).toBe(25000); // priorPct 0
    expect(p.contractAsset).toBe(5000); // earned 25000 - invoiced 20000
    expect(p.deferredRevenue).toBe(0);
  });

  it("splits billings into holdback receivable + regular A/R (10% holdback)", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000, holdbackPct: 0.10 },
      [{ periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 20000 }],
    );
    const p = sched[0];
    expect(p.holdbackReceivable).toBe(2000);   // 20000 × 10%
    expect(p.arReceivable).toBe(18000);        // the rest is regular A/R
    expect(p.earnedToDate).toBe(25000);        // revenue unaffected by holdback
  });

  it("no holdback → holdbackReceivable 0, all of billings is A/R", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000 },
      [{ periodKey: "2026-01", pctComplete: 0.5, invoicedToDate: 60000 }],
    );
    expect(sched[0].holdbackReceivable).toBe(0);
    expect(sched[0].arReceivable).toBe(60000);
  });

  it("overbilled period → deferred revenue, no contract asset", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000 },
      [{ periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 40000 }],
    );
    const p = sched[0];
    expect(p.contractAsset).toBe(0);
    expect(p.deferredRevenue).toBe(15000); // invoiced 40000 - earned 25000
  });

  it("revenueThisPeriod is the cumulative delta across periods", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 200000 },
      [
        { periodKey: "2026-01", pctComplete: 0.1, invoicedToDate: 0 },
        { periodKey: "2026-02", pctComplete: 0.35, invoicedToDate: 50000 },
        { periodKey: "2026-03", pctComplete: 0.6, invoicedToDate: 130000 },
      ],
    );
    expect(sched[0].revenueThisPeriod).toBe(20000); // .10
    expect(sched[1].revenueThisPeriod).toBe(50000); // .25 delta
    expect(sched[2].revenueThisPeriod).toBe(50000); // .25 delta
    expect(sched[2].earnedToDate).toBe(120000); // .60 cumulative
  });

  it("carry-in: openingPct is the baseline for the first period's revenue", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000, openingPct: 0.4, openingInvoiced: 30000 },
      [{ periodKey: "2026-01", pctComplete: 0.5, invoicedToDate: 45000 }],
    );
    const p = sched[0];
    expect(p.priorPct).toBe(0.4);
    expect(p.revenueThisPeriod).toBe(10000); // only the .1 earned this period
    expect(p.earnedToDate).toBe(50000);
    expect(p.contractAsset).toBe(5000); // 50000 - 45000
  });

  it("invoicedToDate carries forward when a period omits it", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000 },
      [
        { periodKey: "2026-01", pctComplete: 0.2, invoicedToDate: 25000 },
        { periodKey: "2026-02", pctComplete: 0.5 }, // no new billing
      ],
    );
    expect(sched[1].invoicedToDate).toBe(25000);
    expect(sched[1].contractAsset).toBe(25000); // 50000 earned - 25000 invoiced
  });

  it("sorts out-of-order progress rows before computing", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000 },
      [
        { periodKey: "2026-02", pctComplete: 0.5, invoicedToDate: 40000 },
        { periodKey: "2026-01", pctComplete: 0.2, invoicedToDate: 10000 },
      ],
    );
    expect(sched[0].periodKey).toBe("2026-01");
    expect(sched[1].revenueThisPeriod).toBe(30000); // .5 - .2
  });

  it("clamps pct to [0,1] and rounds money to cents", () => {
    expect(clampPct(1.5)).toBe(1);
    expect(clampPct(-0.2)).toBe(0);
    expect(round2(33.333333)).toBe(33.33);
  });
});

describe("revrec-core — journal entries", () => {
  it("underbilling → Dr Contract Asset / Cr Revenue, balanced, dated period-end + reversal next period", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000 },
      [{ periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 20000 }],
    );
    const gen = generateJeForPeriod(sched[0], { depositsBookedToRevenue: false })!;
    expect(gen.accrual.date).toBe("2026-01-31");
    expect(gen.reversal.date).toBe("2026-02-01");
    expect(gen.accrual.balanced).toBe(true);
    const dr = gen.accrual.lines.find((l) => l.accountKey === "contract_asset")!;
    const cr = gen.accrual.lines.find((l) => l.accountKey === "revenue")!;
    expect(dr.debit).toBe(5000);
    expect(cr.credit).toBe(5000);
    // reversal flips
    expect(gen.reversal.lines.find((l) => l.accountKey === "contract_asset")!.credit).toBe(5000);
    expect(gen.reversal.lines.find((l) => l.accountKey === "revenue")!.debit).toBe(5000);
  });

  it("overbilling only books a deferral when deposits were booked to revenue", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", contractValue: 100000 },
      [{ periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 40000 }],
    );
    expect(generateJeForPeriod(sched[0], { depositsBookedToRevenue: false })).toBeNull();
    const gen = generateJeForPeriod(sched[0], { depositsBookedToRevenue: true })!;
    expect(gen.accrual.lines.find((l) => l.accountKey === "deferred_revenue")!.credit).toBe(15000);
    expect(gen.accrual.lines.find((l) => l.accountKey === "revenue")!.debit).toBe(15000);
    expect(gen.accrual.balanced).toBe(true);
  });

  it("tags every line with the Customer:Job", () => {
    const sched = buildProjectSchedule(
      { projectId: 1, name: "Job A", customerJob: "Clark:Pool 1", contractValue: 100000 },
      [{ periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 20000 }],
    );
    const gen = generateJeForPeriod(sched[0], { depositsBookedToRevenue: false })!;
    const tagged = tagJeWithJob(gen.accrual, "Clark:Pool 1");
    expect(tagged.lines.every((l) => l.customerJob === "Clark:Pool 1")).toBe(true);
  });

  it("month-end and next-period dates handle December rollover", () => {
    expect(lastDayOfPeriod("2026-12")).toBe("2026-12-31");
    expect(firstDayOfNextPeriod("2026-12")).toBe("2027-01-01");
    expect(lastDayOfPeriod("2026-02")).toBe("2026-02-28");
  });
});

describe("revrec-core — validation gate", () => {
  const sched = buildProjectSchedule(
    { projectId: 1, name: "Job A", contractValue: 100000 },
    [{ periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 20000 }],
  );
  const je = generateJeForPeriod(sched[0], { depositsBookedToRevenue: false })!.accrual;

  it("passes when balanced and all accounts mapped", () => {
    const r = validateForPosting(je, { contract_asset: "120", revenue: "44" });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("fails when an account is unmapped", () => {
    const r = validateForPosting(je, { contract_asset: "120" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("revenue"))).toBe(true);
  });

  it("fails on a null (nothing-to-post) je", () => {
    expect(validateForPosting(null, {}).ok).toBe(false);
  });
});

describe("revrec-core — rollups & calendar", () => {
  it("rolls a project up to its latest state", () => {
    const project = { projectId: 1, name: "Job A", contractValue: 100000 };
    const sched = buildProjectSchedule(project, [
      { periodKey: "2026-01", pctComplete: 0.2, invoicedToDate: 10000 },
      { periodKey: "2026-02", pctComplete: 0.6, invoicedToDate: 50000 },
    ]);
    const r = rollupProject(project, sched);
    expect(r.earnedToDate).toBe(60000);
    expect(r.contractAsset).toBe(10000);
    expect(r.remainingToEarn).toBe(40000);
  });

  it("fiscalYearMonths produces 12 ordered keys from a non-January start", () => {
    const m = fiscalYearMonths("2025-07");
    expect(m.length).toBe(12);
    expect(m[0]).toBe("2025-07");
    expect(m[5]).toBe("2025-12");
    expect(m[6]).toBe("2026-01");
    expect(m[11]).toBe("2026-06");
  });

  it("revenue calendar sums per month and overall", () => {
    const months = fiscalYearMonths("2026-01");
    const cal = buildRevenueCalendar(months, [
      { projectId: 1, name: "A", schedule: buildProjectSchedule({ projectId: 1, name: "A", contractValue: 100000 }, [{ periodKey: "2026-01", pctComplete: 0.5, invoicedToDate: 0 }]) },
      { projectId: 2, name: "B", schedule: buildProjectSchedule({ projectId: 2, name: "B", contractValue: 50000 }, [{ periodKey: "2026-02", pctComplete: 1, invoicedToDate: 0 }]) },
    ]);
    expect(cal.totalsByMonth[0]).toBe(50000); // Jan: A 50%
    expect(cal.totalsByMonth[1]).toBe(50000); // Feb: B 100%
    expect(cal.grandTotal).toBe(100000);
  });
});

describe("revrec-core — Clark Pools Owen Sound prototype tie-out", () => {
  // Markie's validated Excel: total contract ≈ $627,067; FY2026 recognised ≈ $609,067.
  // We model the portfolio as: most of the book recognised in FY2026 (≈97%), with
  // ~$18,000 of contract value carried as still-to-earn (627,067 - 609,067).
  const CONTRACT_TOTAL = 627067;
  const RECOGNIZED_FY2026 = 609067;

  it("a portfolio recognising 609,067 of 627,067 leaves 18,000 to earn", () => {
    const pct = RECOGNIZED_FY2026 / CONTRACT_TOTAL;
    const project = { projectId: 1, name: "Clark Pools OS — portfolio", contractValue: CONTRACT_TOTAL };
    const sched = buildProjectSchedule(project, [{ periodKey: "2026-12", pctComplete: pct, invoicedToDate: 0 }]);
    const r = rollupProject(project, sched);
    expect(r.earnedToDate).toBeCloseTo(RECOGNIZED_FY2026, 0);
    expect(r.remainingToEarn).toBeCloseTo(CONTRACT_TOTAL - RECOGNIZED_FY2026, 0);
    // fully unbilled → the whole earned amount is a contract asset
    expect(r.contractAsset).toBeCloseTo(RECOGNIZED_FY2026, 0);
  });
});
