/**
 * YEAR-END REVIEW + ACCOUNTANT PACKAGE — pure core.
 * =============================================================================
 * Purpose:  The bookkeeper's year-end close flow Markie asked for: Start review →
 *           work the checklist → Close → build the accountant Package (the bundle
 *           the external accountant needs to do the corporate return / financial
 *           statements). Built ONCE, client-agnostic; first test clients = Universal
 *           and Selective Painting.
 * Inputs:   the review's checklist items, the client's month-end recon rollup (which
 *           accounts are reconciled through year-end), and whatever reports we could
 *           pull (TB/GL/BS/P&L) — passed in by the router; this layer is PURE.
 * Outputs:  completion %, a close-readiness verdict, and a PACKAGE MANIFEST listing
 *           every expected deliverable with included / missing / manual status.
 * Principle: HONEST — never claim a deliverable is in the package when it isn't.
 *           Manual-now / auto-later: if QBO can't return a report, the manifest says
 *           "pull manually", it doesn't fake it. Read-only; nothing posts.
 * =============================================================================
 */

export type YearEndPhase = "reconcile" | "compliance" | "adjustments" | "review" | "package";
export type YearEndStatus = "in_progress" | "closed" | "packaged";

export interface YearEndItemDef {
  key: string;
  label: string;
  phase: YearEndPhase;
  /** Required to mark the year CLOSED (the core books-are-right gate). */
  requiredToClose?: boolean;
  /** Only relevant for some clients — shown but never blocks close. */
  optional?: boolean;
  help?: string;
}

/**
 * STANDARD year-end checklist — the firm's repeatable close. Grouped by phase so the
 * card reads top-to-bottom the way the work actually happens. `requiredToClose` marks
 * the non-negotiables (books reconciled + compliance filed) — the rest are good practice
 * but don't block the close gate.
 */
export const YEAR_END_CHECKLIST: YearEndItemDef[] = [
  // Reconcile — the books have to tie before anything else.
  { key: "recon_bank", label: "All bank accounts reconciled to year-end", phase: "reconcile", requiredToClose: true },
  { key: "recon_cc", label: "All credit cards reconciled to year-end", phase: "reconcile", requiredToClose: true },
  { key: "recon_loans", label: "Loans / lines of credit reconciled to statements", phase: "reconcile" },
  { key: "clear_undeposited", label: "Undeposited funds / clearing accounts cleared to zero", phase: "reconcile" },
  { key: "recon_processors", label: "Payment processors (Stripe/PayPal/Square) reconciled", phase: "reconcile", optional: true },

  // Compliance — filings for the year.
  { key: "hst_filed", label: "HST filed for every period in the fiscal year", phase: "compliance", requiredToClose: true },
  { key: "payroll_filed", label: "Payroll remitted + T4/T4A filed (if payroll)", phase: "compliance", optional: true },
  { key: "wsib", label: "WSIB reconciled + reported (if applicable)", phase: "compliance", optional: true },
  { key: "t5_dividends", label: "T5s issued for any dividends paid (if applicable)", phase: "compliance", optional: true },

  // Adjustments — the year-end journal work.
  { key: "depreciation", label: "Depreciation / amortization recorded", phase: "adjustments" },
  { key: "prepaids_accruals", label: "Prepaids & accruals adjusted", phase: "adjustments" },
  { key: "shareholder_loan", label: "Shareholder / owner loan reconciled & confirmed", phase: "adjustments" },
  { key: "inventory", label: "Inventory counted & adjusted (if applicable)", phase: "adjustments", optional: true },
  { key: "bad_debts", label: "Bad debts written off / reviewed", phase: "adjustments" },
  { key: "adjusting_jes", label: "Year-end adjusting journal entries posted", phase: "adjustments" },

  // Review — does it all make sense.
  { key: "ar_aging", label: "A/R aging reviewed (old receivables addressed)", phase: "review" },
  { key: "ap_aging", label: "A/P aging reviewed (old payables addressed)", phase: "review" },
  { key: "tb_reviewed", label: "Trial balance reviewed for reasonableness", phase: "review", requiredToClose: true },
  { key: "pl_reviewed", label: "P&L reviewed vs prior year", phase: "review" },

  // Package — assembling the accountant bundle.
  { key: "pkg_statements", label: "Year-end month statements gathered (all accounts)", phase: "package" },
  { key: "pkg_recon", label: "Reconciliation reports attached", phase: "package" },
  { key: "pkg_notes", label: "Working-paper notes written for the accountant", phase: "package" },
];

export const PHASE_LABEL: Record<YearEndPhase, string> = {
  reconcile: "1 · Reconcile",
  compliance: "2 · Compliance filings",
  adjustments: "3 · Year-end adjustments",
  review: "4 · Review",
  package: "5 · Accountant package",
};

export interface YearEndItemState { key: string; done?: boolean; na?: boolean; note?: string | null }

/** Fiscal-year label, e.g. fye 2026-03-31 → "FY2026 (ended Mar 31, 2026)". */
export function fiscalYearLabel(fiscalYear: number, fiscalYearEnd?: string | null): string {
  if (!fiscalYearEnd) return `FY${fiscalYear}`;
  const d = new Date(fiscalYearEnd + "T00:00:00");
  if (isNaN(d.getTime())) return `FY${fiscalYear}`;
  const m = d.toLocaleString("en-CA", { month: "short", timeZone: "UTC" });
  return `FY${fiscalYear} (ended ${m} ${d.getUTCDate()}, ${d.getUTCFullYear()})`;
}

/**
 * Derive the fiscal-year-end ISO date for a given fiscal year from the client's
 * fiscal-year-end MONTH (1–12). Dec → that calendar year's Dec 31; otherwise the
 * last day of that month in the fiscal year. Defaults to Dec if month is missing.
 */
export function fiscalYearEndDate(fiscalYear: number, fiscalYearEndMonth?: number | null): string {
  const m = fiscalYearEndMonth && fiscalYearEndMonth >= 1 && fiscalYearEndMonth <= 12 ? fiscalYearEndMonth : 12;
  // last day of month m in fiscalYear: day 0 of month m+1
  const d = new Date(Date.UTC(fiscalYear, m, 0));
  return d.toISOString().slice(0, 10);
}

export interface YearEndSummary {
  total: number;
  done: number;
  na: number;
  applicable: number;        // total − na
  completionPercent: number; // done / applicable
  requiredTotal: number;
  requiredDone: number;
  canClose: boolean;         // all requiredToClose items done (or n/a)
  blockers: string[];        // labels of required items not yet done
}

/** Roll the checklist state into a completion % + a close-readiness gate. */
export function summarizeYearEnd(items: YearEndItemState[], defs: YearEndItemDef[] = YEAR_END_CHECKLIST): YearEndSummary {
  const stateByKey = new Map(items.map((i) => [i.key, i]));
  let done = 0, na = 0, requiredTotal = 0, requiredDone = 0;
  const blockers: string[] = [];
  for (const def of defs) {
    const st = stateByKey.get(def.key);
    if (st?.na) { na++; continue; }
    if (st?.done) done++;
    if (def.requiredToClose) {
      requiredTotal++;
      if (st?.done || st?.na) requiredDone++;
      else blockers.push(def.label);
    }
  }
  const total = defs.length;
  const applicable = total - na;
  return {
    total, done, na, applicable,
    completionPercent: applicable > 0 ? Math.round((done / applicable) * 100) : 0,
    requiredTotal, requiredDone,
    canClose: blockers.length === 0,
    blockers,
  };
}

export type ManifestStatus = "included" | "missing" | "manual" | "na";
export interface PackageItem {
  key: string;
  label: string;
  status: ManifestStatus;
  detail?: string;
}

export interface PackageInputs {
  /** Reports we managed to pull from QBO (true = have it, false = tried & failed, undefined = not connected). */
  reports?: {
    trialBalance?: boolean;
    generalLedger?: boolean;
    balanceSheet?: boolean;
    profitAndLoss?: boolean;
  };
  qboConnected?: boolean;
  /** Recon rollup from the month-end tracker for the year-end period. */
  recon?: { totalAccounts: number; reconciledThrough: number; behind: number } | null;
  /** Checklist state — drives the "statements gathered / notes written" lines. */
  items?: YearEndItemState[];
  accountant?: { name?: string | null; email?: string | null } | null;
  notes?: string | null;
}

/**
 * Build the ACCOUNTANT PACKAGE MANIFEST: every deliverable the external accountant
 * expects, each marked included / missing / manual / n-a. This is the honest contents
 * list — "manual" means QBO can't hand it over via API so the bookkeeper logs in and
 * pulls it (statements, recon reports). Nothing here is faked.
 */
export function buildPackageManifest(inp: PackageInputs): { items: PackageItem[]; readyCount: number; total: number; ready: boolean } {
  const state = new Map((inp.items || []).map((i) => [i.key, i]));
  const r = inp.reports || {};
  const out: PackageItem[] = [];

  const reportItem = (key: string, label: string, have: boolean | undefined): PackageItem => {
    if (have === true) return { key, label, status: "included", detail: "Pulled from QuickBooks" };
    if (inp.qboConnected === false || have === undefined) return { key, label, status: "manual", detail: "Pull from QuickBooks Reports (no live API report)" };
    return { key, label, status: "manual", detail: "QuickBooks didn't return it — pull manually from Reports" };
  };

  out.push(reportItem("trial_balance", "Trial Balance (year-end)", r.trialBalance));
  out.push(reportItem("general_ledger", "General Ledger (full year)", r.generalLedger));
  out.push(reportItem("balance_sheet", "Balance Sheet (year-end)", r.balanceSheet));
  out.push(reportItem("profit_loss", "Profit & Loss (full year)", r.profitAndLoss));

  // Statements — never via the QBO API; always a manual/recon-tracker deliverable.
  const stmtDone = state.get("pkg_statements")?.done;
  if (inp.recon && inp.recon.totalAccounts > 0) {
    const allRec = inp.recon.behind === 0;
    out.push({
      key: "statements",
      label: "Year-end month statements (all accounts)",
      status: stmtDone ? "included" : allRec ? "manual" : "missing",
      detail: stmtDone
        ? "Marked gathered"
        : `${inp.recon.reconciledThrough}/${inp.recon.totalAccounts} accounts reconciled through year-end${inp.recon.behind ? ` — ${inp.recon.behind} behind` : ""}`,
    });
    out.push({
      key: "recon_reports",
      label: "Reconciliation reports",
      status: state.get("pkg_recon")?.done ? "included" : allRec ? "manual" : "missing",
      detail: allRec ? "All accounts reconciled — pull the recon reports" : "Some accounts not reconciled through year-end",
    });
  } else {
    out.push({ key: "statements", label: "Year-end month statements (all accounts)", status: stmtDone ? "included" : "manual", detail: stmtDone ? "Marked gathered" : "Set up the month-end recon accounts to track this" });
    out.push({ key: "recon_reports", label: "Reconciliation reports", status: state.get("pkg_recon")?.done ? "included" : "manual", detail: "Pull from QuickBooks once reconciled" });
  }

  // Working-paper notes.
  out.push({
    key: "notes",
    label: "Working-paper notes for the accountant",
    status: (inp.notes && inp.notes.trim()) || state.get("pkg_notes")?.done ? "included" : "missing",
    detail: inp.notes && inp.notes.trim() ? "Notes written" : "Add notes explaining anything unusual this year",
  });

  // Accountant recipient.
  out.push({
    key: "accountant",
    label: "Accountant recipient on file",
    status: inp.accountant && (inp.accountant.email || inp.accountant.name) ? "included" : "missing",
    detail: inp.accountant?.name || inp.accountant?.email || "Add the accountant as the package recipient",
  });

  const readyCount = out.filter((i) => i.status === "included").length;
  // "manual" deliverables are expected (statements/reports always are) — readiness =
  // nothing is hard-MISSING. Manual items are a to-do, not a blocker.
  const ready = out.every((i) => i.status !== "missing");
  return { items: out, readyCount, total: out.length, ready };
}
