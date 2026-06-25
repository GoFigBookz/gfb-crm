/**
 * LOAN TRACKER — PURE CORE
 * =============================================================================
 * A per-client ledger for shareholder / inter-company / third-party loans
 * (Markie's Task-Summary trackers: "Conor Loan Tracker", "Adbank Clark Loan",
 * numbered-co shareholder loans, etc.). ONE shared ledger replacing a manual
 * Google sheet: the client/bookkeeper records advances and repayments and the
 * running balance owed is always correct.
 *
 * SIGN CONVENTION: the running balance is the amount OWED on the loan.
 *   + increases what's owed:  opening (if a balance is carried in), advance/draw,
 *                             interest accrued.
 *   − decreases what's owed:  repayment.
 *   adjust can be either sign (corrections).
 * A POSITIVE balance = the borrower owes the lender; NEGATIVE = overpaid / the
 * direction has flipped (e.g. a shareholder loan that swung to "due to shareholder").
 *
 * No I/O — pure math, unit-testable.
 * =============================================================================
 */

export type LoanEntryKind = "opening" | "advance" | "repayment" | "interest" | "adjust";

export interface LoanEntry {
  id?: number;
  entryDate: string | Date;
  amount: number;        // signed per the convention above
  kind: LoanEntryKind;
  note?: string | null;
  source?: string | null; // manual | client | import | qbo
}

export interface LoanLedgerRow extends LoanEntry {
  runningBalance: number; // amount owed after this entry
}

export interface LoanSummary {
  balance: number;        // current amount owed (can be negative if flipped)
  totalAdvanced: number;  // sum of advances + opening debit + interest (what grew the loan)
  totalRepaid: number;    // sum of repayments, as a positive number
  totalInterest: number;  // interest accrued
  entryCount: number;
  lastActivity: string | null; // ISO of the most recent entry
  direction: "owed_to_lender" | "owed_to_borrower" | "settled";
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toTime(d: string | Date): number {
  const t = new Date(d as any).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Sort entries oldest→newest (stable by id), attach a running balance to each. */
export function buildLoanLedger(entries: LoanEntry[]): LoanLedgerRow[] {
  const sorted = [...entries].sort((a, b) => {
    const t = toTime(a.entryDate) - toTime(b.entryDate);
    return t !== 0 ? t : (a.id ?? 0) - (b.id ?? 0);
  });
  let bal = 0;
  return sorted.map((e) => {
    bal = round2(bal + (e.amount || 0));
    return { ...e, runningBalance: bal };
  });
}

/** Roll a loan's entries up to a balance + totals. */
export function summarizeLoan(entries: LoanEntry[]): LoanSummary {
  let totalAdvanced = 0, totalRepaid = 0, totalInterest = 0, balance = 0;
  let last = 0;
  for (const e of entries) {
    const amt = e.amount || 0;
    balance += amt;
    if (e.kind === "interest") totalInterest += amt;
    if (amt > 0) totalAdvanced += amt;
    else if (amt < 0) totalRepaid += -amt;
    const t = toTime(e.entryDate);
    if (t > last) last = t;
  }
  balance = round2(balance);
  const direction = balance > 0 ? "owed_to_lender" : balance < 0 ? "owed_to_borrower" : "settled";
  return {
    balance,
    totalAdvanced: round2(totalAdvanced),
    totalRepaid: round2(totalRepaid),
    totalInterest: round2(totalInterest),
    entryCount: entries.length,
    lastActivity: last ? new Date(last).toISOString() : null,
    direction,
  };
}

/**
 * Simple interest accrual for a period: principal × annualRate × (days/365).
 * Returns a positive interest amount (rounded) to add as an "interest" entry.
 * Pure helper — the caller decides when to accrue and supplies the principal.
 */
export function accrueSimpleInterest(principal: number, annualRatePct: number, days: number): number {
  if (!(principal > 0) || !(annualRatePct > 0) || !(days > 0)) return 0;
  return round2(principal * (annualRatePct / 100) * (days / 365));
}

/** Validate an entry before saving — returns a warning string, or null if fine. */
export function validateLoanEntry(e: Pick<LoanEntry, "amount" | "kind">): string | null {
  if (!Number.isFinite(e.amount)) return "Amount must be a number.";
  if (e.amount === 0 && e.kind !== "adjust") return "Amount can't be zero.";
  if (e.kind === "repayment" && e.amount > 0) return "A repayment should be negative (it reduces the balance owed).";
  if (e.kind === "advance" && e.amount < 0) return "An advance should be positive (it increases the balance owed).";
  if (e.kind === "interest" && e.amount < 0) return "Interest should be positive.";
  return null;
}
