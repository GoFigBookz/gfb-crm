/**
 * FIGGY JR — SCOPE-BASED QUOTE ENGINE (pure core)
 * =============================================================================
 * Builds a market-rate quote from what we ACTUALLY do for a client (scope), so
 * Markie can compare it against his flat fee and see if he's undercharging.
 * Pure + deterministic (no DB / no I/O) so it's unit-testable; the tRPC wrapper
 * (`quote-router.ts`) feeds it real client + onboarding data.
 *
 * RATE CARD — grounded in 2025/2026 Canadian bookkeeping market research
 * (figures in CAD). Sources surveyed:
 *   - Outsource Bookkeeping CA — "Bookkeeping Rates Canada 2026": flat $400–$700/mo
 *     typical, $30–$60/hr freelance; tiers ~$350 (≤50 txns) → ~$500 (unlimited
 *     small); GST/HST back-filing +$200–$500/period.
 *   - AIS Solutions / The AccTax Co / customcpa.ca: $300–$2,000/mo small biz,
 *     $2,000–$5,000/mo mid-sized w/ payroll + filings; $20–$150/hr.
 *   - Market package examples: Silver $795/mo (100 txns), Gold $1,295/mo (250 txns).
 *   - Cleanup/catch-up: $50–$125/hr bookkeeper; ~$500–$1,500 for a 12-mo sole-prop
 *     cleanup (i.e. ~$100/month-behind), +$200–$500 per back HST period.
 *   - Payroll adds 3–6 hrs/mo; priced per-employee on top of a base.
 * Numbers are deliberately MID-MARKET and easy to tune in one place.
 * =============================================================================
 */

export type BookkeepingFrequency = "monthly" | "quarterly" | "annual" | "none";
export type HstFilingPeriod = "monthly" | "quarterly" | "annual" | null;
export type PayrollRunFrequency = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "none";
export type PayrollRemitter = "regular" | "quarterly" | "accelerated";

export type QuoteScope = {
  avgMonthlyTransactions: number;
  bookkeepingFrequency: BookkeepingFrequency;
  bankAccountCount: number;
  creditCardCount: number;
  hasHST: boolean;
  hstPeriod: HstFilingPeriod;
  hasPayroll: boolean;
  employeeCount: number;
  payrollFrequency: PayrollRunFrequency;
  payrollRemitterFreq: PayrollRemitter;
  hasWSIB: boolean;
  hasEHT: boolean;
  paysDividends: boolean;   // → T5
  hasInvestments: boolean;  // → T5
  hasSubcontractors: boolean; // → T5018
  needsYearEnd: boolean;
  salesPlatformCount: number; // Stripe / Square / Jobber / TouchBistro etc.
  invoicingByUs: boolean;     // we run A/R
  billPayByUs: boolean;       // we run A/P
  hasJobCosting: boolean;
  monthsBehind: number;       // one-time catch-up driver
  // QuickBooks billed wholesale through us (pass-through on the quote)
  qboSoftwareTier?: "none" | "easystart" | "essentials" | "plus";
  qboSoftwareWholesale?: boolean;
  qboPayrollWholesale?: boolean;
};

export type LineItem = { label: string; amount: number; rationale: string };

export type PackageOption = { name: string; price: number };

export type QuoteResult = {
  tier: string;
  transactions: number;
  monthlyLineItems: LineItem[];
  recurringMonthly: number;       // rounded, the headline scope-based monthly price
  recurringRange: { low: number; high: number }; // ±15% band
  nearestPackage: PackageOption;  // closest clean marketable package to the calc
  oneTimeLineItems: LineItem[];
  oneTimeTotal: number;
};

export type QuoteComparison = {
  flatFee: number | null;
  recurringMonthly: number;
  deltaMonthly: number;           // recommended − flat (positive = undercharging)
  pctUnder: number;               // delta / recommended (0–1)
  verdict: "no_flat_fee" | "undercharging" | "aligned" | "above_market";
  message: string;
};

/** The single tunable rate card (CAD). Tweak here; everything flows from it. */
export const RATE_CARD = {
  // Monthly base by transaction volume (includes recording, categorization,
  // reconciliation of ONE bank account, and a monthly close).
  // Core bookkeeping is priced PER TRANSACTION — $2.50/txn at low volume sliding
  // down to $1.50/txn at high volume. base = transactions × the band's rate.
  perTransactionRate: [
    { max: 50, rate: 1.75, label: "$1.75/txn" },
    { max: 100, rate: 1.60, label: "$1.60/txn" },
    { max: 200, rate: 1.50, label: "$1.50/txn" },
    { max: 400, rate: 1.40, label: "$1.40/txn" },
    { max: Infinity, rate: 1.25, label: "$1.25/txn" },
  ] as Array<{ max: number; rate: number; label: string }>,

  // How often we actually do the books changes the recurring labour.
  bookkeepingFrequencyMultiplier: { monthly: 1.0, quarterly: 0.7, annual: 0.45, none: 0.4 },

  additionalBankAccount: 20, // each bank account beyond the first
  creditCardAccount: 15,     // each credit card reconciled

  hstFiling: { monthly: 75, quarterly: 50, annual: 20 }, // per month, by filing cadence

  payroll: {
    base: 40,                // base if we run payroll at all
    perEmployee: 8,          // our SERVICE fee per employee / month
    runFrequencyMultiplier: { weekly: 1.5, biweekly: 1.2, semi_monthly: 1.2, monthly: 1.0, none: 1.0 },
    acceleratedRemitterPremium: 30, // accelerated = twice-monthly PD7A remittances
  },
  // QuickBooks pass-through (only added when billed wholesale THROUGH us).
  qbo: {
    software: { easystart: 24, essentials: 54, plus: 60 } as Record<string, number>,
    softwareLabel: { easystart: "EasyStart", essentials: "Essentials", plus: "Plus" } as Record<string, string>,
    payrollBase: 40, payrollPerEmployee: 7,
  },
  t4PerEmployeePerYear: 50,  // annual slips, amortized to monthly
  t5PerYear: 120,            // T5 prep (dividends / investment income), amortized
  t5018PerYear: 150,         // contractor slips, amortized

  salesPlatform: 45,         // per platform / month (pull report, break out HST, post sales receipt)
  invoicingAR: 75,           // we run client invoicing / A/R
  billPayAP: 75,             // we run bill payments / A/P
  jobCosting: 100,           // job/project costing overhead
  wsib: 15,                  // WSIB reconciliation + reporting
  eht: 10,                   // Ontario EHT reconciliation + filing
  yearEndPerYear: 900,       // year-end file prep + handoff to accountant (T2 is the accountant's), amortized

  // One-time
  catchUpPerMonthBehind: 100,
  onboardingSetup: 250,      // COA review, software + bank-feed setup, connections
} as const;

/** Clean, marketable monthly packages. The quote shows the precise calculated
 *  number AND the closest of these so Markie can pick a tidy price point. */
export const PACKAGES: PackageOption[] = [
  { name: "Lite", price: 300 },
  { name: "Starter", price: 500 },
  { name: "Standard", price: 750 },
  { name: "Growth", price: 1000 },
  { name: "Pro", price: 1500 },
  { name: "Premium", price: 2000 },
  { name: "Enterprise", price: 3000 },
];

/** The package whose price is closest to the calculated monthly figure. */
export function nearestPackage(monthly: number): PackageOption {
  return PACKAGES.reduce((best, p) =>
    Math.abs(p.price - monthly) < Math.abs(best.price - monthly) ? p : best, PACKAGES[0]);
}

function round5(n: number): number { return Math.round(n / 5) * 5; }

function transactionBase(txns: number): { base: number; rate: number; label: string } {
  const t = Math.max(0, Math.round(txns || 0));
  const band = RATE_CARD.perTransactionRate.find((b) => t <= b.max) ?? RATE_CARD.perTransactionRate[RATE_CARD.perTransactionRate.length - 1];
  return { base: round5(t * band.rate), rate: band.rate, label: `${t} txns × ${band.label}` };
}

/** Build a full scope-based quote from a client's actual service scope. */
export function computeQuote(scope: QuoteScope): QuoteResult {
  const items: LineItem[] = [];
  const txns = Math.max(0, Math.round(scope.avgMonthlyTransactions || 0));

  // 1) Per-transaction core bookkeeping × bookkeeping-frequency labour multiplier.
  const { base, rate, label } = transactionBase(txns);
  const freqMult = RATE_CARD.bookkeepingFrequencyMultiplier[scope.bookkeepingFrequency] ?? 1.0;
  const baseAmount = base * freqMult;
  items.push({
    label: `Core bookkeeping — ${label}`,
    amount: baseAmount,
    rationale: freqMult === 1.0
      ? `${txns} txns/mo @ $${rate}/txn, recorded + reconciled + monthly close`
      : `${txns} txns/mo @ $${rate}/txn at ${scope.bookkeepingFrequency} cadence (×${freqMult} labour)`,
  });

  // 2) Extra accounts to reconcile.
  const extraBanks = Math.max(0, (scope.bankAccountCount || 0) - 1);
  if (extraBanks > 0) items.push({
    label: `Additional bank accounts (${extraBanks})`,
    amount: extraBanks * RATE_CARD.additionalBankAccount,
    rationale: `${extraBanks} bank acct(s) beyond the one included`,
  });
  if ((scope.creditCardCount || 0) > 0) items.push({
    label: `Credit card reconciliation (${scope.creditCardCount})`,
    amount: scope.creditCardCount * RATE_CARD.creditCardAccount,
    rationale: `${scope.creditCardCount} credit card acct(s) reconciled`,
  });

  // 3) HST/GST filing.
  if (scope.hasHST && scope.hstPeriod) {
    items.push({
      label: `HST/GST filing (${scope.hstPeriod})`,
      amount: RATE_CARD.hstFiling[scope.hstPeriod],
      rationale: `Prepare + file ${scope.hstPeriod} HST return`,
    });
  }

  // 4) Payroll — only charge when there's at least one employee. (No employees
  // = no payroll line, even if the hasPayroll flag is set.)
  if (scope.hasPayroll && (scope.employeeCount || 0) > 0) {
    const emp = Math.max(0, scope.employeeCount || 0);
    const runMult = RATE_CARD.payroll.runFrequencyMultiplier[scope.payrollFrequency] ?? 1.0;
    const payrollAmt = (RATE_CARD.payroll.base + emp * RATE_CARD.payroll.perEmployee) * runMult;
    items.push({
      label: `Payroll processing (${emp} employee${emp === 1 ? "" : "s"})`,
      amount: payrollAmt,
      rationale: `${scope.payrollFrequency} pay runs + PD7A remittance (×${runMult} cadence)`,
    });
    if (scope.payrollRemitterFreq === "accelerated") items.push({
      label: "Accelerated remitter premium",
      amount: RATE_CARD.payroll.acceleratedRemitterPremium,
      rationale: "Threshold-1: twice-monthly source-deduction remittances",
    });
    if (emp > 0) items.push({
      label: `T4 slips (${emp}/yr, amortized)`,
      amount: (emp * RATE_CARD.t4PerEmployeePerYear) / 12,
      rationale: `Annual T4s for ${emp} employee(s), spread monthly`,
    });
  }

  // 5) Slips driven by structure.
  if (scope.paysDividends || scope.hasInvestments) items.push({
    label: "T5 slips (amortized)",
    amount: RATE_CARD.t5PerYear / 12,
    rationale: "Dividend / investment-income T5 prep, spread monthly",
  });
  if (scope.hasSubcontractors) items.push({
    label: "T5018 contractor slips (amortized)",
    amount: RATE_CARD.t5018PerYear / 12,
    rationale: "Annual subcontractor reporting, spread monthly",
  });

  // 6) Sales platforms (each = monthly report → HST breakout → sales receipt).
  if ((scope.salesPlatformCount || 0) > 0) items.push({
    label: `Sales platform postings (${scope.salesPlatformCount})`,
    amount: scope.salesPlatformCount * RATE_CARD.salesPlatform,
    rationale: "Monthly sales report, HST breakout, post sales receipt per platform",
  });

  // 7) A/R, A/P, job costing.
  if (scope.invoicingByUs) items.push({
    label: "Client invoicing / A/R",
    amount: RATE_CARD.invoicingAR,
    rationale: "We raise and track customer invoices",
  });
  if (scope.billPayByUs) items.push({
    label: "Bill payments / A/P",
    amount: RATE_CARD.billPayAP,
    rationale: "We manage and pay vendor bills",
  });
  if (scope.hasJobCosting) items.push({
    label: "Job / project costing",
    amount: RATE_CARD.jobCosting,
    rationale: "Per-job cost tracking and allocation",
  });

  // 8) WSIB / EHT.
  if (scope.hasWSIB) items.push({
    label: "WSIB reporting",
    amount: RATE_CARD.wsib,
    rationale: "Premium reconciliation + remittance",
  });
  if (scope.hasEHT) items.push({
    label: "EHT (Ontario)",
    amount: RATE_CARD.eht,
    rationale: "Employer Health Tax reconciliation + filing",
  });

  // 9) Year-end file prep (bookkeeper handoff; the T2 itself is the accountant's).
  if (scope.needsYearEnd) items.push({
    label: "Year-end prep (amortized)",
    amount: RATE_CARD.yearEndPerYear / 12,
    rationale: "Adjusting entries + year-end file to accountant, spread monthly",
  });

  // 10) QuickBooks pass-through (only when billed wholesale through us).
  if (scope.qboSoftwareWholesale && scope.qboSoftwareTier && scope.qboSoftwareTier !== "none") {
    const price = RATE_CARD.qbo.software[scope.qboSoftwareTier] ?? 0;
    if (price) items.push({
      label: `QuickBooks Online ${RATE_CARD.qbo.softwareLabel[scope.qboSoftwareTier]} (wholesale)`,
      amount: price,
      rationale: "QBO subscription billed through us at wholesale",
    });
  }
  if (scope.qboPayrollWholesale && scope.hasPayroll && (scope.employeeCount || 0) > 0) {
    items.push({
      label: `QuickBooks Payroll (wholesale, ${scope.employeeCount} emp)`,
      amount: RATE_CARD.qbo.payrollBase + (scope.employeeCount || 0) * RATE_CARD.qbo.payrollPerEmployee,
      rationale: `QBO Payroll billed through us: $${RATE_CARD.qbo.payrollBase} + $${RATE_CARD.qbo.payrollPerEmployee}/employee`,
    });
  }

  const recurringRaw = items.reduce((s, i) => s + i.amount, 0);
  const recurringMonthly = round5(recurringRaw);

  // One-time charges.
  const oneTime: LineItem[] = [];
  oneTime.push({
    label: "Onboarding / setup",
    amount: RATE_CARD.onboardingSetup,
    rationale: "COA review, software + bank-feed setup, connections",
  });
  if ((scope.monthsBehind || 0) > 0) oneTime.push({
    label: `Catch-up / cleanup (${scope.monthsBehind} mo behind)`,
    amount: scope.monthsBehind * RATE_CARD.catchUpPerMonthBehind,
    rationale: `Bring ${scope.monthsBehind} month(s) of back books current`,
  });
  const oneTimeTotal = round5(oneTime.reduce((s, i) => s + i.amount, 0));

  return {
    tier: label,
    transactions: txns,
    monthlyLineItems: items.map((i) => ({ ...i, amount: Math.round(i.amount * 100) / 100 })),
    recurringMonthly,
    recurringRange: { low: round5(recurringMonthly * 0.85), high: round5(recurringMonthly * 1.15) },
    nearestPackage: nearestPackage(recurringMonthly),
    oneTimeLineItems: oneTime,
    oneTimeTotal,
  };
}

/** Compare the scope-based quote to the flat fee → undercharging verdict. */
export function compareToFlatFee(recurringMonthly: number, flatFee: number | null | undefined): QuoteComparison {
  const flat = flatFee != null && flatFee > 0 ? flatFee : null;
  const delta = recurringMonthly - (flat ?? 0);
  const pctUnder = recurringMonthly > 0 ? delta / recurringMonthly : 0;

  if (flat == null) {
    return {
      flatFee: null, recurringMonthly, deltaMonthly: 0, pctUnder: 0,
      verdict: "no_flat_fee",
      message: `No flat fee set. Scope-based quote is $${recurringMonthly}/mo.`,
    };
  }
  if (pctUnder > 0.10) {
    return {
      flatFee: flat, recurringMonthly, deltaMonthly: Math.round(delta), pctUnder,
      verdict: "undercharging",
      message: `Undercharging by ~$${Math.round(delta)}/mo (${Math.round(pctUnder * 100)}%). Flat $${flat} vs scope $${recurringMonthly}.`,
    };
  }
  if (pctUnder < -0.10) {
    return {
      flatFee: flat, recurringMonthly, deltaMonthly: Math.round(delta), pctUnder,
      verdict: "above_market",
      message: `Flat fee $${flat} is ~$${Math.round(-delta)}/mo above the scope-based $${recurringMonthly} — premium / headroom.`,
    };
  }
  return {
    flatFee: flat, recurringMonthly, deltaMonthly: Math.round(delta), pctUnder,
    verdict: "aligned",
    message: `Flat fee $${flat} is in line with the scope-based $${recurringMonthly} (within 10%).`,
  };
}
