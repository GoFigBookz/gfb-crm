import { describe, it, expect } from "vitest";
import {
  sumLines,
  netTaxDrift,
  auditHstYear,
  auditYearEndPayable,
  round2,
  type FiledReturn,
  type BookPeriod,
} from "./hst-audit-core";

/** Build a quarter helper. */
function q(
  label: string,
  start: string,
  end: string,
  l101: number,
  l103: number,
  l106: number,
): FiledReturn & BookPeriod {
  return {
    periodLabel: label,
    startDate: start,
    endDate: end,
    line101: l101,
    line103: l103,
    line106: l106,
    line109: round2(l103 - l106),
  };
}

describe("sumLines", () => {
  it("sums line-by-line and rounds", () => {
    const total = sumLines([
      { line101: 100, line103: 13, line106: 5, line109: 8 },
      { line101: 200.005, line103: 26, line106: 6, line109: 20 },
    ]);
    expect(total.line101).toBe(300.01);
    expect(total.line109).toBe(28);
  });
  it("empty → zeros", () => {
    expect(sumLines([])).toEqual({ line101: 0, line103: 0, line106: 0, line109: 0 });
  });
});

describe("netTaxDrift", () => {
  it("0 when 109 = 103 − 106", () => {
    expect(netTaxDrift({ line101: 0, line103: 100, line106: 40, line109: 60 })).toBe(0);
  });
  it("flags a mismatch", () => {
    expect(netTaxDrift({ line101: 0, line103: 100, line106: 40, line109: 55 })).toBe(-5);
  });
});

describe("auditHstYear — the West York case (the bug this tool fixes)", () => {
  // West York files $0 in Q1 BY DESIGN and picks it up in Q2. The old recon
  // compared Q1-filed ($0) to Q1-books (had sales) and screamed "overstated".
  // The annual total is what must tie — and it does.
  const books: BookPeriod[] = [
    q("Q1 2025", "2025-01-01", "2025-03-31", 86000, 11180, 1200), // books show real Q1 sales
    q("Q2 2025", "2025-04-01", "2025-06-30", 300000, 39000, 4000),
    q("Q3 2025", "2025-07-01", "2025-09-30", 250000, 32500, 3500),
    q("Q4 2025", "2025-10-01", "2025-12-31", 200000, 26000, 3000),
  ];
  // Filed: Q1 = $0 (deferred), Q2 carries Q1+Q2.
  const filed: FiledReturn[] = [
    q("Q1 2025", "2025-01-01", "2025-03-31", 0, 0, 0),
    q("Q2 2025", "2025-04-01", "2025-06-30", 386000, 50180, 5200), // Q1+Q2 sales/tax/ITC
    q("Q3 2025", "2025-07-01", "2025-09-30", 250000, 32500, 3500),
    q("Q4 2025", "2025-10-01", "2025-12-31", 200000, 26000, 3000),
  ];

  it("verdict is REVIEW (annual ties) — NOT fail/overstated", () => {
    const r = auditHstYear({ clientLabel: "West York", fiscalYear: "2025", filed, books });
    expect(r.annual.tied).toBe(true);
    expect(r.verdict).toBe("review");
    // the headline note must say the annual ties, not "overstated"
    expect(r.notes.join(" ")).toMatch(/annual total ties/i);
    expect(r.notes.join(" ")).not.toMatch(/overstated/i);
  });

  it("annual totals match line-by-line", () => {
    const r = auditHstYear({ clientLabel: "West York", fiscalYear: "2025", filed, books });
    expect(r.annual.filed.line101).toBe(836000);
    expect(r.annual.book.line101).toBe(836000);
    for (const l of r.annual.lines) expect(l.withinTolerance).toBe(true);
  });

  it("identifies the shifted periods as informational", () => {
    const r = auditHstYear({ clientLabel: "West York", fiscalYear: "2025", filed, books });
    const swinging = r.periods.filter((p) => !p.tied).map((p) => p.periodLabel);
    expect(swinging).toContain("Q1 2025");
    expect(swinging).toContain("Q2 2025");
  });
});

describe("auditHstYear — a genuinely clean year", () => {
  const periods: (FiledReturn & BookPeriod)[] = [
    q("Q1", "2025-01-01", "2025-03-31", 100000, 13000, 1000),
    q("Q2", "2025-04-01", "2025-06-30", 120000, 15600, 1200),
  ];
  it("ties every period → clean", () => {
    const r = auditHstYear({ clientLabel: "Clean Co", fiscalYear: "2025", filed: periods, books: periods });
    expect(r.verdict).toBe("clean");
    expect(r.annual.tied).toBe(true);
  });
});

describe("auditHstYear — a real discrepancy", () => {
  const books: BookPeriod[] = [q("Q1", "2025-01-01", "2025-03-31", 100000, 13000, 1000)];
  // Filed understates sales by $20k and net tax by $2.6k — annual does NOT tie.
  const filed: FiledReturn[] = [q("Q1", "2025-01-01", "2025-03-31", 80000, 10400, 1000)];
  it("verdict is FAIL with a clear over/under note", () => {
    const r = auditHstYear({ clientLabel: "Off Co", fiscalYear: "2025", filed, books });
    expect(r.annual.tied).toBe(false);
    expect(r.verdict).toBe("fail");
    expect(r.notes.join(" ")).toMatch(/does not tie|HIGHER|LOWER/i);
  });
});

describe("auditHstYear — net tax internal inconsistency", () => {
  it("flags filed 109 ≠ 103 − 106", () => {
    const filed: FiledReturn[] = [
      { periodLabel: "Q1", startDate: "2025-01-01", endDate: "2025-03-31", line101: 100000, line103: 13000, line106: 1000, line109: 11000 }, // should be 12000
    ];
    const books: BookPeriod[] = [
      { periodLabel: "Q1", startDate: "2025-01-01", endDate: "2025-03-31", line101: 100000, line103: 13000, line106: 1000, line109: 11000 },
    ];
    const r = auditHstYear({ clientLabel: "Wonky", fiscalYear: "2025", filed, books });
    expect(r.netTaxConsistent).toBe(false);
    expect(r.notes.join(" ")).toMatch(/net tax.*doesn't equal|collected − ITCs/i);
  });
});

describe("auditHstYear — tolerance absorbs rounding noise", () => {
  it("a $1 swing still ties", () => {
    const books: BookPeriod[] = [q("Q1", "2025-01-01", "2025-03-31", 100000, 13000, 1000)];
    const filed: FiledReturn[] = [q("Q1", "2025-01-01", "2025-03-31", 100001, 13000.5, 1000)];
    const r = auditHstYear({ clientLabel: "Roundy", fiscalYear: "2025", filed, books });
    expect(r.annual.tied).toBe(true);
    expect(r.verdict).toBe("clean");
  });
});

describe("auditYearEndPayable", () => {
  it("ties when closing payable = net tax − remittances", () => {
    const r = auditYearEndPayable({ annualNetTax: 100000, paymentsRemitted: 75000, closingPayableBalance: 25000 });
    expect(r.tied).toBe(true);
    expect(r.expectedPayable).toBe(25000);
    expect(r.note).toMatch(/matches/i);
  });
  it("flags a mismatch with the math spelled out", () => {
    const r = auditYearEndPayable({ annualNetTax: 100000, paymentsRemitted: 75000, closingPayableBalance: 30000 });
    expect(r.tied).toBe(false);
    expect(r.variance).toBe(5000);
    expect(r.note).toMatch(/off by/i);
  });
});
