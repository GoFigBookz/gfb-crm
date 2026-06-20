/**
 * Tests for the month-end close status core (pure date/status math).
 */
import { describe, it, expect } from "vitest";
import { computeHstStatus, computeYearEndStatus, rollUpCloseStatus, isOperationalClient, isRelevantForPeriod } from "./month-end-core";

const D = (s: string) => new Date(s + "T00:00:00Z");

describe("computeHstStatus", () => {
  it("not registered -> not applicable, green", () => {
    const r = computeHstStatus({ hasHST: false, period: null, asOf: D("2026-06-19") });
    expect(r.applicable).toBe(false);
    expect(r.status).toBe("green");
  });

  it("registered but no period -> flagged, not applicable", () => {
    const r = computeHstStatus({ hasHST: true, period: null, asOf: D("2026-06-19") });
    expect(r.applicable).toBe(false);
    expect(r.reason).toMatch(/no filing period/i);
  });

  it("quarterly: in June 2026 the most recent ended quarter is Q1 2026, due Apr 30", () => {
    const r = computeHstStatus({ hasHST: true, period: "quarterly", asOf: D("2026-06-19") });
    expect(r.periodLabel).toBe("Q1 2026");
    expect(r.periodEnd).toBe("2026-03-31");
    expect(r.dueDate).toBe("2026-04-30");
    // due Apr 30, now Jun 19, unknown filed -> overdue
    expect(r.overdue).toBe(true);
    expect(r.status).toBe("red");
  });

  it("quarterly filed covers the period -> green", () => {
    const r = computeHstStatus({ hasHST: true, period: "quarterly", asOf: D("2026-06-19"), lastFiled: D("2026-04-15") });
    expect(r.filed).toBe(true);
    expect(r.status).toBe("green");
  });

  it("monthly: in June the most recent ended month is May 2026, due Jun 30", () => {
    const r = computeHstStatus({ hasHST: true, period: "monthly", asOf: D("2026-06-19") });
    expect(r.periodLabel).toBe("May 2026");
    expect(r.periodEnd).toBe("2026-05-31");
    expect(r.dueDate).toBe("2026-06-30");
    expect(r.daysToDue).toBe(11);
    expect(r.status).toBe("yellow"); // within 14 days
  });

  it("annual: due 3 months after fiscal year end", () => {
    const r = computeHstStatus({ hasHST: true, period: "annual", asOf: D("2026-06-19"), fiscalYearEndMonth: 12 });
    expect(r.periodLabel).toBe("FY 2025");
    expect(r.periodEnd).toBe("2025-12-31");
    expect(r.dueDate).toBe("2026-03-31");
  });

  it("a filed-but-stale date does NOT cover a newer period -> not green", () => {
    // lastFiled before the period end => filed=false
    const r = computeHstStatus({ hasHST: true, period: "quarterly", asOf: D("2026-06-19"), lastFiled: D("2026-01-31") });
    expect(r.filed).toBe(false);
  });
});

describe("computeYearEndStatus", () => {
  it("no year-end set -> not applicable", () => {
    const r = computeYearEndStatus({ yearEndMonth: null, asOf: D("2026-06-19") });
    expect(r.applicable).toBe(false);
  });

  it("Dec year-end, asOf mid-June -> last FYE 2025-12-31, ~170d, yellow", () => {
    const r = computeYearEndStatus({ yearEndMonth: "Dec", asOf: D("2026-06-19") });
    expect(r.lastFyeDate).toBe("2025-12-31");
    expect(r.status).toBe("yellow");
  });

  it("recent year-end (within 90d) -> green", () => {
    const r = computeYearEndStatus({ yearEndMonth: "Mar", asOf: D("2026-04-15") });
    expect(r.lastFyeDate).toBe("2026-03-31");
    expect(r.status).toBe("green");
  });

  it("very old year-end (>180d) -> red", () => {
    const r = computeYearEndStatus({ yearEndMonth: "Dec", asOf: D("2026-09-01") });
    expect(r.status).toBe("red");
  });
});

describe("rollUpCloseStatus", () => {
  const okHst = computeHstStatus({ hasHST: false, period: null, asOf: D("2026-06-19") });
  const okYe = computeYearEndStatus({ yearEndMonth: null, asOf: D("2026-06-19") });

  it("all clean -> green, 'Up to date'", () => {
    const r = rollUpCloseStatus({ toReview: 0, checklistPercent: 100, hst: okHst, yearEnd: okYe });
    expect(r.status).toBe("green");
    expect(r.reasons).toContain("Up to date");
  });

  it("a few to review -> yellow", () => {
    const r = rollUpCloseStatus({ toReview: 5, hst: okHst, yearEnd: okYe });
    expect(r.status).toBe("yellow");
    expect(r.reasons.some((x) => /awaiting review/.test(x))).toBe(true);
  });

  it("a big backlog -> red", () => {
    const r = rollUpCloseStatus({ toReview: 47, hst: okHst, yearEnd: okYe });
    expect(r.status).toBe("red");
  });

  it("overdue HST drives the whole client red", () => {
    const overdueHst = computeHstStatus({ hasHST: true, period: "quarterly", asOf: D("2026-06-19") });
    const r = rollUpCloseStatus({ toReview: 0, checklistPercent: 100, hst: overdueHst, yearEnd: okYe });
    expect(r.status).toBe("red");
  });

  it("incomplete checklist nudges to yellow", () => {
    const r = rollUpCloseStatus({ toReview: 0, checklistPercent: 40, hst: okHst, yearEnd: okYe });
    expect(r.status).toBe("yellow");
    expect(r.reasons.some((x) => /checklist 40%/.test(x))).toBe(true);
  });
});

describe("client type — operational + close-board relevance", () => {
  it("wholesale is not operational; everything else is", () => {
    expect(isOperationalClient("wholesale")).toBe(false);
    expect(isOperationalClient("monthly")).toBe(true);
    expect(isOperationalClient(null)).toBe(true); // default monthly
  });

  it("wholesale is never relevant to the close board", () => {
    expect(isRelevantForPeriod({ clientType: "wholesale" }, D("2026-01-15"))).toBe(false);
  });

  it("monthly and payroll are always relevant", () => {
    expect(isRelevantForPeriod({ clientType: "monthly" }, D("2026-05-15"))).toBe(true);
    expect(isRelevantForPeriod({ clientType: "payroll" }, D("2026-05-15"))).toBe(true);
  });

  it("any payroll client stays relevant regardless of type", () => {
    expect(isRelevantForPeriod({ clientType: "annual", hasPayroll: true }, D("2026-05-15"))).toBe(true);
  });

  it("quarterly is relevant only in post-quarter months (Jan/Apr/Jul/Oct)", () => {
    expect(isRelevantForPeriod({ clientType: "quarterly" }, D("2026-04-10"))).toBe(true);
    expect(isRelevantForPeriod({ clientType: "quarterly" }, D("2026-07-10"))).toBe(true);
    expect(isRelevantForPeriod({ clientType: "quarterly" }, D("2026-05-10"))).toBe(false);
  });

  it("annual is relevant within 3 months after fiscal year-end", () => {
    // Dec year-end → relevant Dec–Mar.
    expect(isRelevantForPeriod({ clientType: "annual", yearEndMonth: "Dec" }, D("2026-02-10"))).toBe(true);
    expect(isRelevantForPeriod({ clientType: "annual", yearEndMonth: "Dec" }, D("2026-07-10"))).toBe(false);
    // Jun year-end → relevant Jun–Sep.
    expect(isRelevantForPeriod({ clientType: "annual", yearEndMonth: "Jun" }, D("2026-08-10"))).toBe(true);
    expect(isRelevantForPeriod({ clientType: "annual", yearEndMonth: "Jun" }, D("2026-02-10"))).toBe(false);
  });
});
