/**
 * HST / GST AUDIT — pure reconciliation core (client-agnostic, fully tested).
 * =============================================================================
 * WHY THIS EXISTS (Markie, 2026-06-25): a one-off "West York" reconciliation
 * compared a single Q1 filing ($0 by design — picked up in Q2) against Q1 books
 * (which had sales) and screamed "$86K overstated revenue / $7K overstated net
 * tax." That made Markie look wrong in front of his accountant. He was right and
 * the recon was wrong.
 *
 * THE FIX (the principle this whole tool is built on):
 *   Reconcile on the ANNUAL TOTAL, not period-by-period.
 *   A client can legitimately shift revenue between filing periods (file $0 in
 *   Q1, double up in Q2). Period variances are EXPECTED and informational; the
 *   thing that must tie out is the FULL-YEAR total: the sum of what was filed to
 *   CRA must equal what the books say for the year. If the annual ties, the year
 *   is clean even when individual quarters swing wildly.
 *
 * GST/HST return lines (CRA):
 *   101 = Sales & other revenue (line 101)
 *   103 = GST/HST collected / collectible
 *   106 = Input tax credits (ITCs)
 *   109 = Net tax  (= 103 − 106)
 *
 * This module has NO I/O. It takes filed returns + book figures (the caller pulls
 * those from QBO) and produces a verdict. That keeps the judgment logic unit-
 * testable and impossible to get wrong against a live API quirk.
 * =============================================================================
 */

/** The four reconciled lines of a GST/HST return. All in dollars. */
export type ReturnLines = {
  line101: number; // sales & other revenue
  line103: number; // GST/HST collected
  line106: number; // input tax credits (ITCs)
  line109: number; // net tax (103 − 106)
};

/** One filed GST/HST return (what was actually submitted to CRA). */
export type FiledReturn = ReturnLines & {
  periodLabel: string;   // "Q1 2025", "2025 Annual", etc.
  startDate: string;     // ISO yyyy-mm-dd
  endDate: string;       // ISO yyyy-mm-dd
  filedDate?: string;    // ISO, optional
  paymentAmount?: number; // what was remitted to / refunded by CRA for this period
};

/** Book figures for the SAME period, pulled live from QBO. */
export type BookPeriod = ReturnLines & {
  periodLabel: string;
  startDate: string;
  endDate: string;
};

export type LineKey = keyof ReturnLines;
export const LINE_KEYS: LineKey[] = ["line101", "line103", "line106", "line109"];

export const LINE_LABELS: Record<LineKey, string> = {
  line101: "Line 101 — Sales & revenue",
  line103: "Line 103 — HST collected",
  line106: "Line 106 — Input tax credits",
  line109: "Line 109 — Net tax",
};

/** Round to cents to keep float noise out of comparisons. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum a set of returns line-by-line. Empty → all zeros. */
export function sumLines(rows: ReturnLines[]): ReturnLines {
  return rows.reduce<ReturnLines>(
    (acc, r) => ({
      line101: round2(acc.line101 + (r.line101 || 0)),
      line103: round2(acc.line103 + (r.line103 || 0)),
      line106: round2(acc.line106 + (r.line106 || 0)),
      line109: round2(acc.line109 + (r.line109 || 0)),
    }),
    { line101: 0, line103: 0, line106: 0, line109: 0 },
  );
}

/** Net tax SHOULD equal collected − ITCs. Returns the discrepancy (0 = consistent). */
export function netTaxDrift(lines: ReturnLines): number {
  return round2(lines.line109 - (lines.line103 - lines.line106));
}

export type LineVariance = {
  line: LineKey;
  label: string;
  filed: number;
  book: number;
  variance: number;       // book − filed
  variancePct: number;    // |variance| / max(|filed|,|book|,1) * 100
  withinTolerance: boolean;
};

export type AuditConfig = {
  /** Absolute $ tolerance per line for rounding/timing noise. Default $2. */
  dollarTolerance?: number;
  /** Percent tolerance per line (whichever is larger wins). Default 0.5%. */
  pctTolerance?: number;
  /**
   * Periods can legitimately shift revenue between filings (e.g. West York files
   * $0 in Q1 and picks it up in Q2). When true (default), the verdict is driven
   * by the ANNUAL total and per-period swings are reported as informational, not
   * failures. Set false only for a client who must tie every single period.
   */
  reconcileAnnualOnly?: boolean;
};

const DEFAULTS: Required<AuditConfig> = {
  dollarTolerance: 2,
  pctTolerance: 0.5,
  reconcileAnnualOnly: true,
};

function compareLines(filed: ReturnLines, book: ReturnLines, cfg: Required<AuditConfig>): LineVariance[] {
  return LINE_KEYS.map((line) => {
    const f = round2(filed[line] || 0);
    const b = round2(book[line] || 0);
    const variance = round2(b - f);
    const denom = Math.max(Math.abs(f), Math.abs(b), 1);
    const variancePct = round2((Math.abs(variance) / denom) * 100);
    const withinTolerance =
      Math.abs(variance) <= cfg.dollarTolerance || variancePct <= cfg.pctTolerance;
    return { line, label: LINE_LABELS[line], filed: f, book: b, variance, variancePct, withinTolerance };
  });
}

export type PeriodReconciliation = {
  periodLabel: string;
  startDate: string;
  endDate: string;
  lines: LineVariance[];
  tied: boolean; // every line within tolerance
};

export type HstAuditResult = {
  clientLabel: string;
  fiscalYear: string;
  verdict: "clean" | "review" | "fail";
  /** The headline: does the full-year filed total tie to the full-year books? */
  annual: {
    filed: ReturnLines;
    book: ReturnLines;
    lines: LineVariance[];
    tied: boolean;
  };
  /** Per-period detail (informational when reconcileAnnualOnly). */
  periods: PeriodReconciliation[];
  /** Internal consistency: filed net tax = collected − ITCs, per the annual total. */
  netTaxConsistent: boolean;
  /** Plain-English findings Markie can hand to an accountant. */
  notes: string[];
};

/**
 * Reconcile a full fiscal year of GST/HST: filed returns vs the books.
 *
 * The verdict:
 *   - "clean"  → annual total ties on every line (within tolerance).
 *   - "review" → annual ties but a period swings (expected for deferred filers),
 *                or a soft inconsistency worth a human glance.
 *   - "fail"   → the annual total does NOT tie — real over/under-statement.
 */
export function auditHstYear(args: {
  clientLabel: string;
  fiscalYear: string;
  filed: FiledReturn[];
  books: BookPeriod[];
  config?: AuditConfig;
}): HstAuditResult {
  const cfg = { ...DEFAULTS, ...(args.config || {}) };
  const notes: string[] = [];

  const filedAnnual = sumLines(args.filed);
  const bookAnnual = sumLines(args.books);
  const annualLines = compareLines(filedAnnual, bookAnnual, cfg);
  const annualTied = annualLines.every((l) => l.withinTolerance);

  // Per-period: match a filed return to its book period by periodLabel, falling
  // back to exact date-range match. Unmatched periods are surfaced as notes.
  const periods: PeriodReconciliation[] = args.filed.map((fr) => {
    const book =
      args.books.find((b) => b.periodLabel === fr.periodLabel) ||
      args.books.find((b) => b.startDate === fr.startDate && b.endDate === fr.endDate);
    const bookLines: ReturnLines = book || { line101: 0, line103: 0, line106: 0, line109: 0 };
    const lines = compareLines(fr, bookLines, cfg);
    return {
      periodLabel: fr.periodLabel,
      startDate: fr.startDate,
      endDate: fr.endDate,
      lines,
      tied: lines.every((l) => l.withinTolerance),
    };
  });

  // Net-tax internal consistency on the annual total (109 = 103 − 106).
  const filedDrift = netTaxDrift(filedAnnual);
  const netTaxConsistent = Math.abs(filedDrift) <= cfg.dollarTolerance;
  if (!netTaxConsistent) {
    notes.push(
      `Filed net tax (line 109 = $${filedAnnual.line109.toLocaleString()}) doesn't equal collected − ITCs ($${round2(filedAnnual.line103 - filedAnnual.line106).toLocaleString()}). Off by $${filedDrift.toLocaleString()}.`,
    );
  }

  let verdict: HstAuditResult["verdict"];
  if (!annualTied) {
    verdict = "fail";
    for (const l of annualLines) {
      if (!l.withinTolerance) {
        const dir = l.variance > 0 ? "books HIGHER than filed" : "books LOWER than filed";
        notes.push(
          `${l.label}: filed $${l.filed.toLocaleString()} vs books $${l.book.toLocaleString()} — ${dir} by $${Math.abs(l.variance).toLocaleString()} (${l.variancePct}%). Annual total does not tie.`,
        );
      }
    }
  } else {
    // Annual ties. Decide clean vs review based on period swings / soft issues.
    const swingingPeriods = periods.filter((p) => !p.tied);
    if (cfg.reconcileAnnualOnly && swingingPeriods.length > 0) {
      verdict = "review";
      notes.push(
        `Annual total ties to the books ✓. ${swingingPeriods.length} period(s) shift revenue between filings (e.g. a $0 quarter picked up later) — expected for this client; not an error. Periods: ${swingingPeriods.map((p) => p.periodLabel).join(", ")}.`,
      );
    } else if (!netTaxConsistent) {
      verdict = "review";
    } else {
      verdict = "clean";
      notes.push("Annual GST/HST ties to the books on all four lines (101/103/106/109). ✓");
    }
  }

  return {
    clientLabel: args.clientLabel,
    fiscalYear: args.fiscalYear,
    verdict,
    annual: { filed: filedAnnual, book: bookAnnual, lines: annualLines, tied: annualTied },
    periods,
    netTaxConsistent,
    notes,
  };
}

/**
 * Year-end HST payable check (Markie: "does Dec year-end HST balance match what
 * was paid CRA?"). The closing GST/HST payable balance on the books should equal
 * net tax owing that hasn't been remitted yet:
 *   expected payable = annual net tax (line 109) − payments remitted to CRA.
 * A clean books = closing payable matches that to the penny.
 */
export function auditYearEndPayable(args: {
  annualNetTax: number;        // sum of line 109 across the year
  paymentsRemitted: number;    // total remitted to CRA during/after the year
  closingPayableBalance: number; // GST/HST payable account balance at year-end (per QBO)
  dollarTolerance?: number;
}): { expectedPayable: number; variance: number; tied: boolean; note: string } {
  const tol = args.dollarTolerance ?? 2;
  const expectedPayable = round2(args.annualNetTax - args.paymentsRemitted);
  const variance = round2(args.closingPayableBalance - expectedPayable);
  const tied = Math.abs(variance) <= tol;
  const note = tied
    ? `Year-end HST payable ($${args.closingPayableBalance.toLocaleString()}) matches net tax owing less remittances ($${expectedPayable.toLocaleString()}). ✓`
    : `Year-end HST payable ($${args.closingPayableBalance.toLocaleString()}) is off by $${variance.toLocaleString()} from expected ($${expectedPayable.toLocaleString()} = net tax $${args.annualNetTax.toLocaleString()} − remitted $${args.paymentsRemitted.toLocaleString()}). Investigate before signing year-end.`;
  return { expectedPayable, variance, tied, note };
}
