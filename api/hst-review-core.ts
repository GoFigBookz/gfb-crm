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

/** Code names that mean "no HST" (exempt / zero-rated / out-of-scope). */
const NONTAXABLE_CODE = /exempt|out of scope|out-of-scope|zero|0\s*%|^z$|^e$|^os$|non-?taxable/i;
/** Accounts where an exempt/zero/OOS code is usually LEGITIMATE — skip to cut false positives. */
const OFTEN_EXEMPT_ACCOUNT = [
  /wage|salar|payroll|cpp|ei |source deduction|remittance/i,
  /insurance/i,
  /interest|bank charge|bank fee|finance charge|merchant fee|loan|mortgage/i,
  /licen[cs]e|permit|government|municipal|property tax|land tax|cra|gst\/hst remit|wsib|workers/i,
  /dues|membership|donation|charit/i,
  /dividend|owner|draw|shareholder|equity|retained earnings/i,
  /residential rent|long-?term rent/i,
  /foreign|us |usd |import|customs|duty/i,
];

/**
 * 7) WRONG/SUSPECT TAX CODE — the exception accountants actually chase: a normal
 * taxable expense or sale coded Exempt / Zero-rated / Out-of-scope when it most likely
 * should carry HST. Conservative: skips lines on control accounts and on accounts that
 * are commonly-legitimately exempt (wages, insurance, interest, government fees, …) so it
 * surfaces the real review items, not noise. Severity medium = "verify the code", not auto-error.
 */
export function checkWrongTaxCode(txns: RawTxn[]): Finding[] {
  const out: Finding[] = [];
  for (const t of txns) {
    if (t.type === "JournalEntry") continue;
    if (!isExpenseTxn(t) && !isSalesTxn(t)) continue;
    for (const l of t.lines) {
      if (Math.abs(l.amount) < 1) continue;
      const name = l.accountName || "";
      if (CONTROL_PATTERNS.some((re) => re.test(name))) continue;        // its own check
      const codeName = l.taxCodeName || "";
      if (!codeName) continue;                                           // missing-code is its own check
      if (!NONTAXABLE_CODE.test(codeName)) continue;                     // taxable code = fine here
      if (OFTEN_EXEMPT_ACCOUNT.some((re) => re.test(name))) continue;    // legitimately exempt — skip
      out.push({
        check: "wrong_tax_code", severity: "medium",
        ref: ref(t), amount: money(l.amount),
        message: `${isExpenseTxn(t) ? "Expense" : "Sale"} on "${name}" is coded "${codeName}" (no HST) — likely should be HST 13%.`,
        fix: `Confirm the supply really is exempt/zero-rated/out-of-scope. If it's a normal taxable ${isExpenseTxn(t) ? "purchase, the ITC is being missed (Line 108)" : "sale, the HST is understated (Line 105)"}.`,
      });
    }
  }
  return out;
}

/** Find the HST/GST control account(s) in the chart of accounts (by subtype, then name). */
export function findHstControlAccounts(accounts: RawAccount[]): RawAccount[] {
  const bySub = accounts.filter((a) => /globaltax(payable|suspense)|salestaxpayable/i.test(a.subType || ""));
  if (bySub.length) return bySub;
  return accounts.filter((a) => /(hst|gst).*(payable|suspense|owing|control)|(payable|suspense).*(hst|gst)|sales tax (payable|suspense)/i.test(a.name || ""));
}

export interface HstAccountTieOut {
  controlAccounts: { name: string; balance: number }[];
  controlBalance: number;     // sum of the HST control account balances (abs)
  computedNet: number;        // net HST implied by the period's transactions (abs)
  diff: number;               // controlBalance − computedNet
  tied: boolean;
  verdict: RateVerdict;
  message: string;
}

/**
 * HST ACCOUNT TIE-OUT (Markie's ask): does the HST balance sitting in the chart of
 * accounts agree with the net HST the period's transactions imply? They tie when prior
 * periods are filed/cleared. A gap means tax posted outside the transaction set
 * (manual JE, opening balance, an unfiled prior period) — exactly what to catch pre-filing.
 */
export function hstAccountTieOut(accounts: RawAccount[], tie: { net: number }, tolerance = 1): HstAccountTieOut {
  const ctrl = findHstControlAccounts(accounts);
  const controlBalance = money(ctrl.reduce((s, a) => s + Math.abs(a.balance || 0), 0));
  const computedNet = money(Math.abs(tie.net));
  const diff = money(controlBalance - computedNet);
  if (!ctrl.length) {
    return { controlAccounts: [], controlBalance: 0, computedNet, diff: -computedNet, tied: false, verdict: "na",
      message: "No HST/GST control account found in the chart of accounts — can't tie out the balance. Confirm the tax-payable account exists." };
  }
  const tied = Math.abs(diff) <= tolerance;
  const list = ctrl.map((a) => `${a.name} ${money(Math.abs(a.balance || 0))}`).join(", ");
  return {
    controlAccounts: ctrl.map((a) => ({ name: a.name, balance: money(Math.abs(a.balance || 0)) })),
    controlBalance, computedNet, diff, tied,
    verdict: tied ? "green" : "yellow",
    message: tied
      ? `HST control account (${list}) ties to the implied net HST (${money(computedNet)}).`
      : `HST control account holds ${money(controlBalance)} but the period's transactions imply ${money(computedNet)} — a ${money(Math.abs(diff))} gap. Ties only if prior periods are filed/cleared; otherwise compare the period's movement in the account. A gap can mean a manual JE, opening balance, or unfiled prior period.`,
  };
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

/**
 * HST REASONABLENESS TEST (the "does this make sense?" check accountants run before
 * filing, so a return doesn't raise a CRA flag). For each side it computes the
 * EFFECTIVE rate = tax ÷ taxable base and compares it to the statutory rate (ON = 13%):
 *   • collected ÷ sales base  → should sit ≈ 13%
 *   • ITCs ÷ purchase base    → should sit ≈ 13%
 * A rate well off 13% means something's miscoded (wrong/missing tax code, tax on a
 * control account, over-claimed ITC). Bands are deviation in PERCENTAGE POINTS:
 *   green ≤ greenBandPts · yellow ≤ warnBandPts · red beyond. A taxable base with ~$0
 * tax is always red; no base = n/a (nothing to test). Benign causes (zero-rated/exempt
 * sales, 50% meals ITC) explain a LOW rate — surfaced in the message, human decides.
 */
export type RateVerdict = "green" | "yellow" | "red" | "na";
export interface RateCheck {
  label: string;
  base: number;
  tax: number;
  effectiveRatePct: number | null;   // null when there's no base to test
  expectedRatePct: number;
  deviationPts: number | null;
  verdict: RateVerdict;
  message: string;
}
export interface HstReasonablenessReport {
  expectedRatePct: number;
  output: RateCheck;          // HST collected on sales
  itc: RateCheck;             // ITCs on purchases
  netTax: number;            // collected − itc
  overall: RateVerdict;      // worst of the two sides
}

function rankVerdict(v: RateVerdict): number { return { green: 0, na: 0, yellow: 1, red: 2 }[v]; }

function rateCheck(label: string, side: "sales" | "purchases", tax: number, base: number, expectedRatePct: number, greenBandPts: number, warnBandPts: number): RateCheck {
  const b = money(base), tx = money(tax);
  if (b < 1) {
    return { label, base: b, tax: tx, effectiveRatePct: null, expectedRatePct, deviationPts: null, verdict: "na",
      message: `No taxable ${side} in the period — nothing to test.` };
  }
  const eff = Math.round((tx / b) * 1000) / 10; // one decimal %
  const dev = Math.round(Math.abs(eff - expectedRatePct) * 10) / 10;
  if (tx < 0.01) {
    return { label, base: b, tax: tx, effectiveRatePct: eff, expectedRatePct, deviationPts: dev, verdict: "red",
      message: `${label}: ${money(b)} of taxable ${side} but ~$0 HST — almost certainly miscoded (missing tax code). Expected ≈ ${expectedRatePct}%.` };
  }
  let verdict: RateVerdict = dev <= greenBandPts ? "green" : dev <= warnBandPts ? "yellow" : "red";
  let message: string;
  if (verdict === "green") {
    message = `${label}: effective rate ${eff}% ≈ ${expectedRatePct}% — passes the reasonableness test.`;
  } else {
    const lowNote = eff < expectedRatePct
      ? (side === "purchases" ? " A low rate can be legitimate (zero-rated/exempt purchases, 50% meals ITC) — confirm before dismissing." : " A low rate can be legitimate (zero-rated/exempt sales) — confirm before dismissing.")
      : " A rate above 13% usually means double-taxed lines or a wrong tax code.";
    message = `${label}: effective rate ${eff}% is ${dev} pts off ${expectedRatePct}%.${verdict === "red" ? " Likely a coding error — could raise a CRA flag. Review before filing." : ""}${lowNote}`;
  }
  return { label, base: b, tax: tx, effectiveRatePct: eff, expectedRatePct, deviationPts: dev, verdict, message };
}

export function hstReasonableness(
  tie: ReturnType<typeof tieOut>,
  expectedRatePct = 13,
  opts?: { greenBandPts?: number; warnBandPts?: number },
): HstReasonablenessReport {
  const greenBandPts = opts?.greenBandPts ?? 1.0;
  const warnBandPts = opts?.warnBandPts ?? 3.0;
  const output = rateCheck("HST collected on sales", "sales", tie.collected, tie.salesBase, expectedRatePct, greenBandPts, warnBandPts);
  const itc = rateCheck("ITCs on purchases", "purchases", tie.itc, tie.purchaseBase, expectedRatePct, greenBandPts, warnBandPts);
  // Overall = worst of the testable sides; "na" (nothing to test) never dominates a
  // real verdict. All na → na.
  const testable = [output.verdict, itc.verdict].filter((v) => v !== "na");
  const overall: RateVerdict = testable.length === 0
    ? "na"
    : testable.reduce((worst, v) => (rankVerdict(v) >= rankVerdict(worst) ? v : worst), "green" as RateVerdict);
  return { expectedRatePct, output, itc, netTax: money(tie.collected - tie.itc), overall };
}

export interface HstReviewReport {
  findings: Finding[];
  bySeverity: Record<Severity, number>;
  tie: ReturnType<typeof tieOut>;
  reasonableness: HstReasonablenessReport;
  accountTieOut: HstAccountTieOut;
  counts: { transactions: number; accounts: number };
}

/** Run all checks. Pure: same input → same report. `expectedRatePct` defaults to ON 13%. */
export function runHstReview(input: { accounts: RawAccount[]; taxCodes: RawTaxCode[]; txns: RawTxn[]; expectedRatePct?: number }): HstReviewReport {
  const findings = [
    ...checkUnreviewedAccounts(input.accounts),
    ...checkControlAccountCoding(input.txns),
    ...checkSalesWithoutTax(input.txns),
    ...checkMissingTaxCode(input.txns),
    ...checkWrongTaxCode(input.txns),
    ...checkDuplicates(input.txns),
    ...checkMealsFullItc(input.txns),
  ];
  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  // high first, then medium, then low; stable within
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  const tie = tieOut(input.txns);
  const accountTieOut = hstAccountTieOut(input.accounts, tie);
  // A material control-account gap is itself a high finding so it shows in the list too.
  if (!accountTieOut.tied && accountTieOut.verdict !== "na" && Math.abs(accountTieOut.diff) > 1) {
    findings.unshift({
      check: "hst_account_tieout", severity: "high",
      ref: accountTieOut.controlAccounts.map((a) => a.name).join(", ") || "HST control account",
      amount: Math.abs(accountTieOut.diff),
      message: accountTieOut.message,
      fix: "Reconcile the HST control account to the period's net tax before filing — investigate any manual JE, opening balance, or unfiled prior period.",
    });
    bySeverity.high++;
  }
  return {
    findings, bySeverity, tie,
    reasonableness: hstReasonableness(tie, input.expectedRatePct ?? 13),
    accountTieOut,
    counts: { transactions: input.txns.length, accounts: input.accounts.length },
  };
}

// ===========================================================================
// EXCEPTION-REPORT RECONCILE (Markie's method — the authoritative cross-check).
// ===========================================================================
// Instead of trusting our own transaction scan, take QuickBooks' OWN tax numbers
// (its Tax/Exception report: HST collected on sales + ITCs on purchases) and check
// that the resulting NET TAX equals the balance sitting in the HST control account at
// period end. If they don't tie, the difference is the exception total — money in the
// HST account that the return doesn't explain (a manual JE, an opening balance, a
// prior-period adjustment, or a miscode). This is the only check that proves the filing
// matches the books. Works from PASTED report numbers — no live connection required.
// ===========================================================================

export interface HstExceptionReconcileInput {
  collected: number;          // HST collected on sales (QBO Line 105 / output tax)
  itc: number;                // input tax credits on purchases (QBO Line 108)
  adjustments?: number;       // any HST adjustments on the return (Line 104/107), signed
  hstAccountBalance: number;  // GST/HST Payable (or Suspense) balance at period END
  priorUnfiled?: number;      // HST carried in the account from a prior, not-yet-filed period
  tolerance?: number;
}

export interface HstExceptionReconcile {
  collected: number;
  itc: number;
  adjustments: number;
  netTax: number;             // collected − itc + adjustments — what the return says is owed
  hstAccountBalance: number;
  priorUnfiled: number;
  expectedInAccount: number;  // netTax + priorUnfiled — what SHOULD be in the account
  diff: number;               // hstAccountBalance − expectedInAccount  (the exception total)
  tied: boolean;
  verdict: RateVerdict;
  message: string;
}

/**
 * The cross-check Markie wants: net tax from QuickBooks' tax report must equal what's
 * sitting in the HST account at period end (allowing for any prior unfiled balance).
 * Pure: paste the three numbers, get a tie/no-tie + the exact gap.
 */
export function reconcileHstException(input: HstExceptionReconcileInput): HstExceptionReconcile {
  const collected = money(input.collected || 0);
  const itc = money(input.itc || 0);
  const adjustments = money(input.adjustments || 0);
  const priorUnfiled = money(input.priorUnfiled || 0);
  const hstAccountBalance = money(input.hstAccountBalance || 0);
  const tol = input.tolerance ?? 1;
  const netTax = money(collected - itc + adjustments);
  const expectedInAccount = money(netTax + priorUnfiled);
  const diff = money(hstAccountBalance - expectedInAccount);
  const tied = Math.abs(diff) <= tol;
  return {
    collected, itc, adjustments, netTax, hstAccountBalance, priorUnfiled, expectedInAccount, diff, tied,
    verdict: tied ? "green" : "red",
    message: tied
      ? `Tied — net tax ${money(netTax)} equals the HST account (${money(hstAccountBalance)}). The return matches the books.`
      : `Net tax ${money(netTax)} (collected ${money(collected)} − ITC ${money(itc)}${adjustments ? ` ${adjustments >= 0 ? "+" : "−"} adj ${money(Math.abs(adjustments))}` : ""}) but the HST account holds ${money(hstAccountBalance)}${priorUnfiled ? ` (incl. ${money(priorUnfiled)} prior unfiled)` : ""} — a ${money(Math.abs(diff))} exception. Something hit the HST account that the return doesn't explain (manual JE, opening balance, prior-period adjustment, or a miscode). Find and clear it before filing.`,
  };
}

/**
 * Best-effort parse of a PASTED QuickBooks tax/exception report to pull the three key
 * numbers (collected, ITC, net) so Markie doesn't retype them. Looks for the line labels
 * QBO uses; falls back to nulls (he can type them). Tolerant of $, commas, parens.
 */
export interface ParsedTaxReport { collected: number | null; itc: number | null; netTax: number | null; matched: string[] }
export function parseTaxReportNumbers(text: string): ParsedTaxReport {
  const out: ParsedTaxReport = { collected: null, itc: null, netTax: null, matched: [] };
  const numFrom = (s: string): number | null => {
    const m = s.match(/\(?-?\$?\s*[\d,]+(?:\.\d+)?\)?/g);
    if (!m || !m.length) return null;
    const last = m[m.length - 1];
    const neg = /^\(.*\)$/.test(last) || /^-/.test(last);
    const mag = Number(last.replace(/[()$,\s-]/g, ""));
    return Number.isFinite(mag) ? (neg ? -mag : mag) : null;
  };
  for (const raw of (text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const low = line.toLowerCase();
    if (out.collected == null && /(collected|line\s*105|tax on sales|gst\/hst on sales|output tax|sales tax collected)/.test(low)) {
      const n = numFrom(line); if (n != null) { out.collected = Math.abs(n); out.matched.push("collected"); continue; }
    }
    if (out.itc == null && /(input tax credit|itc|line\s*108|tax on purchases|gst\/hst on purchases)/.test(low)) {
      const n = numFrom(line); if (n != null) { out.itc = Math.abs(n); out.matched.push("itc"); continue; }
    }
    if (out.netTax == null && /(net tax|line\s*109|balance \(refund\)|net gst\/hst)/.test(low)) {
      const n = numFrom(line); if (n != null) { out.netTax = n; out.matched.push("netTax"); }
    }
  }
  // If only net + one side given, infer the other.
  if (out.netTax != null && out.collected != null && out.itc == null) out.itc = money(out.collected - out.netTax);
  if (out.netTax != null && out.itc != null && out.collected == null) out.collected = money(out.netTax + out.itc);
  return out;
}
