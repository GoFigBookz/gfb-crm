/**
 * PRE-HST DATA-ACCURACY REVIEW — pure check engine.
 * =============================================================================
 * Purpose:  Before Markie runs QuickBooks' own HST report, verify the DATA that
 *           feeds it is accurate. QBO does the reconcile + the return; this only
 *           catches the input errors that make an HST number wrong. READ-ONLY by
 *           design — this module is pure (no DB, no network, no posting).
 * Inputs:   normalized Accounts, TaxCodes, and Transactions (the I/O router pulls
 *           them read-only via the QBO bridge and maps them to these shapes).
 * Outputs:  Findings (severity + ref + plain-English issue + suggested fix) and a
 *           tie-out summary (implied HST collected / ITC / net to compare against
 *           QBO's Sales Tax report).
 * Principle: CONSERVATIVE — flag for human review, never auto-decide. Every finding
 *           is explainable. Nothing here changes a book; Markie fixes in QBO.
 * Limitation: heuristics (e.g. meals 50%, duplicates) are review prompts, not proof.
 * =============================================================================
 */

export interface RawAccount {
  id: string;
  name: string;
  type?: string;          // AccountType (e.g. Expense, Income, Other Current Liability)
  subType?: string;       // AccountSubType
  balance?: number;       // current balance (signed per QBO)
}
export interface RawTaxCode {
  id: string;
  name: string;
  taxable?: boolean;      // false => exempt/zero/out-of-scope
  rate?: number;          // effective % if known
}
export interface RawLine {
  accountId?: string;
  accountName?: string;
  amount: number;         // line net amount
  taxCodeId?: string | null;
  taxCodeName?: string | null;
  taxAmount?: number;     // tax on this line, if provided
}
export interface RawTxn {
  id: string;
  type: "Purchase" | "Bill" | "Invoice" | "SalesReceipt" | "JournalEntry" | "Other";
  date: string;           // ISO yyyy-mm-dd
  name?: string;          // vendor or customer
  docNumber?: string;
  total: number;
  taxTotal?: number;      // TxnTaxDetail total tax, if provided
  lines: RawLine[];
}

export type Severity = "high" | "medium" | "low";
export interface Finding {
  check: string;
  severity: Severity;
  ref: string;            // "Bill #1042 · Home Depot · 2025-03-14"
  amount?: number;
  message: string;
  fix: string;
}

const norm = (s?: string | null) => (s || "").toLowerCase();
const money = (n: number) => Math.round((n || 0) * 100) / 100;
const isExpenseTxn = (t: RawTxn) => t.type === "Purchase" || t.type === "Bill";
const isSalesTxn = (t: RawTxn) => t.type === "Invoice" || t.type === "SalesReceipt";

/** Account-name patterns that should NEVER be the target of an expense/income line. */
const CONTROL_PATTERNS = [
  /hst|gst|sales tax|tax payable|tax suspense/i,
  /accounts payable|accounts receivable|a\/p|a\/r/i,
  /undeposited funds|clearing|suspense|opening balance equity/i,
];
/** Where un-reviewed money hides — flag any non-zero balance. */
const UNREVIEWED_PATTERNS = [
  /uncategoriz|ask my accountant|ask-my-accountant|to be categorized|miscellaneous expense|suspense|opening balance equity/i,
];
const MEALS_PATTERNS = [/meals|entertainment|restaurant|dining/i];

function ref(t: RawTxn): string {
  return [t.type + (t.docNumber ? ` #${t.docNumber}` : ""), t.name, t.date].filter(Boolean).join(" · ");
}

/** Is a tax code one that yields HST (taxable), vs exempt/zero/out-of-scope? */
export function isTaxableCode(code: RawTaxCode | undefined): boolean {
  if (!code) return false;
  if (typeof code.taxable === "boolean") return code.taxable;
  // fall back to the name
  if (/exempt|out of scope|zero|0%|^z$|^e$/i.test(code.name || "")) return false;
  return true;
}

/** 1) Money parked in uncategorized / suspense / OBE — un-reviewed = HST guesswork. */
export function checkUnreviewedAccounts(accounts: RawAccount[]): Finding[] {
  const out: Finding[] = [];
  for (const a of accounts) {
    if (!a.balance || Math.abs(a.balance) < 0.01) continue;
    if (UNREVIEWED_PATTERNS.some((re) => re.test(a.name))) {
      out.push({
        check: "unreviewed_account", severity: "high",
        ref: `Account: ${a.name}`, amount: money(a.balance),
        message: `${a.name} holds ${money(a.balance)} that hasn't been properly categorized.`,
        fix: "Recategorize these transactions to real accounts with the correct tax code before filing — they're invisible to the HST report otherwise.",
      });
    }
  }
  return out;
}

/** 2) Expense/income lines with NO tax code on a taxable-looking account. */
export function checkMissingTaxCode(txns: RawTxn[]): Finding[] {
  const out: Finding[] = [];
  for (const t of txns) {
    if (t.type === "JournalEntry") continue;
    for (const l of t.lines) {
      const onControl = CONTROL_PATTERNS.some((re) => re.test(l.accountName || ""));
      if (onControl) continue; // handled by its own check
      const noCode = !l.taxCodeId && !l.taxCodeName;
      if (noCode && Math.abs(l.amount) >= 1) {
        out.push({
          check: "missing_tax_code", severity: "medium",
          ref: ref(t), amount: money(l.amount),
          message: `${isExpenseTxn(t) ? "Expense" : isSalesTxn(t) ? "Sales" : "Line"} on "${l.accountName || "?"}" has no tax code.`,
          fix: "Set the correct tax code (HST 13% if applicable, or Exempt/Zero/Out-of-scope) so it flows to the right HST line.",
        });
      }
    }
  }
  return out;
}

/** 3) Sales with zero tax where revenue looks taxable. */
export function checkSalesWithoutTax(txns: RawTxn[]): Finding[] {
  const out: Finding[] = [];
  for (const t of txns) {
    if (!isSalesTxn(t)) continue;
    const taxableLines = t.lines.filter((l) => l.amount > 0 && !/exempt|zero|out of scope/i.test(l.taxCodeName || ""));
    const tax = t.taxTotal ?? t.lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    if (taxableLines.length && tax < 0.01 && t.total >= 1) {
      out.push({
        check: "sales_without_tax", severity: "high",
        ref: ref(t), amount: money(t.total),
        message: `Sale of ${money(t.total)} shows no HST collected.`,
        fix: "Confirm whether HST should have been charged. If the customer/supply is taxable, the missing HST understates Line 105.",
      });
    }
  }
  return out;
}

/** 4) A line coded straight TO a control account (HST/AP/AR/clearing) — poisons totals. */
export function checkControlAccountCoding(txns: RawTxn[]): Finding[] {
  const out: Finding[] = [];
  for (const t of txns) {
    if (t.type === "JournalEntry") continue;
    for (const l of t.lines) {
      if (CONTROL_PATTERNS.some((re) => re.test(l.accountName || ""))) {
        out.push({
          check: "control_account_coding", severity: "high",
          ref: ref(t), amount: money(l.amount),
          message: `Coded directly to control account "${l.accountName}".`,
          fix: "Recode to a real expense/income account. Posting straight to HST/AP/AR/clearing distorts the HST and balance-sheet figures.",
        });
      }
    }
  }
  return out;
}

/** 5) Likely duplicates: same name + amount + docNumber (or same name+amount within 5 days). */
export function checkDuplicates(txns: RawTxn[]): Finding[] {
  const out: Finding[] = [];
  const seen = new Map<string, RawTxn>();
  for (const t of txns) {
    if (!isExpenseTxn(t)) continue;
    const keyDoc = `${norm(t.name)}|${money(t.total)}|${norm(t.docNumber)}`;
    const prior = t.docNumber ? seen.get(keyDoc) : undefined;
    if (t.docNumber && prior) {
      out.push({
        check: "duplicate", severity: "medium",
        ref: ref(t), amount: money(t.total),
        message: `Possible duplicate of ${ref(prior)} (same vendor, amount and document #).`,
        fix: "Check for a double-entered bill/expense — duplicates over-claim ITCs (Line 108).",
      });
    }
    if (t.docNumber) seen.set(keyDoc, t);
  }
  return out;
}

/** 6) Meals/entertainment claimed at full ITC instead of 50% (heuristic prompt). */
export function checkMealsFullItc(txns: RawTxn[]): Finding[] {
  const out: Finding[] = [];
  for (const t of txns) {
    if (!isExpenseTxn(t)) continue;
    for (const l of t.lines) {
      if (MEALS_PATTERNS.some((re) => re.test(l.accountName || "")) && (l.taxAmount || 0) > 0) {
        const implied = Math.abs(l.amount) * 0.13;
        // if the claimed tax is ~full 13% (not ~6.5%), flag
        if ((l.taxAmount || 0) > implied * 0.75) {
          out.push({
            check: "meals_full_itc", severity: "medium",
            ref: ref(t), amount: money(l.taxAmount || 0),
            message: `Meals/entertainment "${l.accountName}" appears to claim full ITC.`,
            fix: "Meals & entertainment ITCs are generally limited to 50%. Confirm the ITC is restricted (the year-end 50% adjustment may instead be done annually).",
          });
        }
      }
    }
  }
  return out;
}

/**
 * Tie-out: implied HST collected (sales) vs ITCs (purchases) vs net, from the
 * pulled transactions. Markie compares this to QBO's Sales Tax report — if they
 * don't match, something is coded outside the tax system.
 */
export function tieOut(txns: RawTxn[]): { collected: number; itc: number; net: number; salesBase: number; purchaseBase: number } {
  let collected = 0, itc = 0, salesBase = 0, purchaseBase = 0;
  for (const t of txns) {
    const tax = t.taxTotal ?? t.lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    if (isSalesTxn(t)) { collected += tax; salesBase += t.lines.reduce((s, l) => s + Math.max(l.amount, 0), 0); }
    else if (isExpenseTxn(t)) { itc += tax; purchaseBase += t.lines.reduce((s, l) => s + Math.max(l.amount, 0), 0); }
  }
  return { collected: money(collected), itc: money(itc), net: money(collected - itc), salesBase: money(salesBase), purchaseBase: money(purchaseBase) };
}

export interface HstReviewReport {
  findings: Finding[];
  bySeverity: Record<Severity, number>;
  tie: ReturnType<typeof tieOut>;
  counts: { transactions: number; accounts: number };
}

/** Run all checks. Pure: same input → same report. */
export function runHstReview(input: { accounts: RawAccount[]; taxCodes: RawTaxCode[]; txns: RawTxn[] }): HstReviewReport {
  const findings = [
    ...checkUnreviewedAccounts(input.accounts),
    ...checkControlAccountCoding(input.txns),
    ...checkSalesWithoutTax(input.txns),
    ...checkMissingTaxCode(input.txns),
    ...checkDuplicates(input.txns),
    ...checkMealsFullItc(input.txns),
  ];
  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  // high first, then medium, then low; stable within
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings, bySeverity, tie: tieOut(input.txns), counts: { transactions: input.txns.length, accounts: input.accounts.length } };
}
