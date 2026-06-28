import { describe, it, expect } from "vitest";
import { buildClientAlerts } from "./client-alerts-core";

describe("client-alerts-core — the Needs Attention banner", () => {
  it("nothing wrong → no alerts", () => {
    expect(buildClientAlerts({ overdueTasks: 0, hst: { filed: true }, qboConnected: true })).toEqual([]);
  });

  it("payroll comes first (always priority) and is high when overdue", () => {
    const a = buildClientAlerts({ payroll: { overdue: true }, hst: { overdue: true, periodLabel: "Q2" }, overdueTasks: 6 });
    expect(a[0].key).toBe("payroll_overdue");
    expect(a[0].severity).toBe("high");
  });

  it("HST overdue + due wording", () => {
    expect(buildClientAlerts({ hst: { overdue: true, periodLabel: "Q1" } })[0].label).toMatch(/HST overdue \(Q1\)/);
    expect(buildClientAlerts({ hst: { due: true, periodLabel: "Q2" } })[0].label).toMatch(/HST due \(Q2\)/);
    expect(buildClientAlerts({ hst: { filed: true } })).toEqual([]); // filed → no flag
  });

  it("cash low with a transfer amount", () => {
    const a = buildClientAlerts({ cash: { needsTransfer: true, shortfall: 4000 } });
    expect(a[0].key).toBe("cash_low");
    expect(a[0].label).toMatch(/transfer \$4,000\.00 in/);
  });

  it("stale postings over the threshold", () => {
    expect(buildClientAlerts({ stalePostingsDays: 28 })[0].label).toMatch(/no posting in 28 days/);
    expect(buildClientAlerts({ stalePostingsDays: 3 })).toEqual([]); // under 5 → nothing
  });

  it("tasks: 5+ behind is high, fewer is medium", () => {
    expect(buildClientAlerts({ overdueTasks: 5 })[0].severity).toBe("high");
    expect(buildClientAlerts({ overdueTasks: 2 })[0].severity).toBe("medium");
    expect(buildClientAlerts({ overdueTasks: 1 })[0].label).toBe("1 task behind");
  });

  it("sorts high before medium", () => {
    const a = buildClientAlerts({ overdueTasks: 2 /*med*/, cash: { low: true } /*high*/ });
    expect(a[0].severity).toBe("high");
    expect(a[a.length - 1].severity).toBe("medium");
  });

  it("surfaces open team questions and accounts behind on reconciliation", () => {
    const a = buildClientAlerts({ openQuestions: 2, accountsBehind: 3 });
    expect(a.find((x) => x.key === "questions")!.label).toMatch(/2 open questions from the team/);
    expect(a.find((x) => x.key === "recon_behind")!.label).toMatch(/3 accounts behind/);
    expect(buildClientAlerts({ openQuestions: 0, accountsBehind: 0 })).toEqual([]);
    expect(buildClientAlerts({ openQuestions: 1 })[0].label).toBe("1 open question from the team");
  });
});
