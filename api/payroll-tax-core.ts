/**
 * FIGGY JR — INCOME-TAX WITHHOLDING RECONCILIATION (pure, testable)
 * =============================================================================
 * PURPOSE (Originality.AI revenue-share employees): compare the income tax
 * QuickBooks ACTUALLY deducted YTD against the CRA-EXPECTED tax on that
 * accumulated income, and flag under-withholding — QBO has under-withheld
 * revenue-share pay in past years; this catches it before year-end.
 *
 * METHOD: annualize the YTD income, compute annual federal + Ontario tax
 * (brackets − basic-personal-amount credit + Ontario surtax + Ontario health
 * premium), then expected-YTD tax = annual tax × (fraction of year elapsed).
 * This is an estimate/CHECK tool, not a CRA-grade T4127 engine or a substitute
 * for filing. Tables are isolated below so they swap to verified CRA numbers.
 *
 * ⚠ TAX TABLES BELOW ARE 2025 VALUES PENDING 2026 CRA VERIFICATION. The
 * reconciliation LOGIC is year-agnostic; only the constants need updating.
 * =============================================================================
 */

export type Bracket = { upTo: number; rate: number }; // upTo = upper bound of band (Infinity for top)

export type TaxTables = {
  year: number;
  verified: boolean;
  federalBrackets: Bracket[];
  federalBpa: number;          // basic personal amount (credit = lowest rate × BPA)
  federalLowestRate: number;
  ontarioBrackets: Bracket[];
  ontarioBpa: number;
  ontarioLowestRate: number;
  // Ontario surtax: additional % on ON tax (after credits) above each threshold.
  ontarioSurtax: { threshold: number; rate: number }[];
  // Ontario Health Premium: flat amount by annual taxable income band (approx).
  ontarioHealthPremium: { upTo: number; amount: number }[];
};

// 2025 figures (best-known; replace with verified 2026 when confirmed).
export const TAX_2025: TaxTables = {
  year: 2025,
  verified: false,
  federalBrackets: [
    { upTo: 57375, rate: 0.15 },
    { upTo: 114750, rate: 0.205 },
    { upTo: 177882, rate: 0.26 },
    { upTo: 253414, rate: 0.29 },
    { upTo: Infinity, rate: 0.33 },
  ],
  federalBpa: 16129,
  federalLowestRate: 0.15,
  ontarioBrackets: [
    { upTo: 52886, rate: 0.0505 },
    { upTo: 105775, rate: 0.0915 },
    { upTo: 150000, rate: 0.1116 },
    { upTo: 220000, rate: 0.1216 },
    { upTo: Infinity, rate: 0.1316 },
  ],
  ontarioBpa: 12747,
  ontarioLowestRate: 0.0505,
  ontarioSurtax: [
    { threshold: 5710, rate: 0.20 },
    { threshold: 7307, rate: 0.36 }, // additional 36% (so 56% combined above the 2nd threshold)
  ],
  ontarioHealthPremium: [
    { upTo: 20000, amount: 0 },
    { upTo: 36000, amount: 300 },
    { upTo: 48000, amount: 450 },
    { upTo: 72000, amount: 600 },
    { upTo: 200000, amount: 750 },
    { upTo: Infinity, amount: 900 },
  ],
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Progressive tax across bracket bands. */
export function bracketTax(income: number, brackets: Bracket[]): number {
  if (income <= 0) return 0;
  let tax = 0, lower = 0;
  for (const b of brackets) {
    if (income > b.upTo) { tax += (b.upTo - lower) * b.rate; lower = b.upTo; }
    else { tax += (income - lower) * b.rate; break; }
  }
  return tax;
}

/** Federal tax after the basic-personal-amount credit (no other credits in v1). */
export function federalTax(taxable: number, t: TaxTables = TAX_2025): number {
  const gross = bracketTax(taxable, t.federalBrackets);
  const credit = t.federalLowestRate * t.federalBpa;
  return Math.max(0, gross - credit);
}

/** Ontario tax = bracket tax − BPA credit, then + surtax + health premium. */
export function ontarioTax(taxable: number, t: TaxTables = TAX_2025): number {
  const base = Math.max(0, bracketTax(taxable, t.ontarioBrackets) - t.ontarioLowestRate * t.ontarioBpa);
  let surtax = 0;
  for (const s of t.ontarioSurtax) if (base > s.threshold) surtax += (base - s.threshold) * s.rate;
  let health = 0;
  for (const h of t.ontarioHealthPremium) { if (taxable <= h.upTo) { health = h.amount; break; } }
  return base + surtax + health;
}

/** Total annual income tax (federal + Ontario) on a taxable income. */
export function annualIncomeTax(taxable: number, t: TaxTables = TAX_2025): number {
  return round2(federalTax(taxable, t) + ontarioTax(taxable, t));
}

export type Reconciliation = {
  ytdGross: number;
  ytdTaxDeducted: number;
  fractionOfYear: number;     // 0..1 (e.g. pay periods elapsed / periods per year)
  annualizedIncome: number;   // ytdGross / fraction
  annualTaxExpected: number;  // CRA tax on the annualized income
  expectedYtdTax: number;     // annualTax × fraction = expected on accumulated income
  variance: number;           // actual − expected (negative = under-withheld)
  underWithheld: boolean;
  effectiveAnnualRate: number; // annualTax / annualizedIncome
};

/**
 * Reconcile actual vs expected withholding on accumulated income.
 * fractionOfYear: how much of the year the YTD figure covers (periods elapsed /
 * periods per year). If gross is already a full-year figure, pass 1.
 */
export function reconcileWithholding(
  ytdGross: number,
  ytdTaxDeducted: number,
  fractionOfYear: number,
  t: TaxTables = TAX_2025,
): Reconciliation {
  const frac = Math.min(1, Math.max(0.0001, fractionOfYear));
  const annualizedIncome = round2(ytdGross / frac);
  const annualTaxExpected = annualIncomeTax(annualizedIncome, t);
  const expectedYtdTax = round2(annualTaxExpected * frac);
  const variance = round2(ytdTaxDeducted - expectedYtdTax);
  return {
    ytdGross: round2(ytdGross),
    ytdTaxDeducted: round2(ytdTaxDeducted),
    fractionOfYear: frac,
    annualizedIncome,
    annualTaxExpected,
    expectedYtdTax,
    variance,
    underWithheld: variance < -0.5, // tolerate rounding; flag real shortfalls
    effectiveAnnualRate: annualizedIncome > 0 ? round2(annualTaxExpected / annualizedIncome * 100) / 100 : 0,
  };
}
