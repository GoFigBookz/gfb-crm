/**
 * FIGGY JR — INCOME-TAX WITHHOLDING RECONCILIATION (pure, testable)
 * =============================================================================
 * PURPOSE (Originality.AI revenue-share employees): compare the income tax
 * QuickBooks ACTUALLY deducted YTD against the CRA-EXPECTED tax on that
 * accumulated income, and flag under-withholding — QBO has under-withheld
 * revenue-share pay in past years; this catches it before year-end.
 *
 * METHOD (matches the existing Originality sheet + CRA T4127 Option 1):
 *   annual_income     = ytd_gross / fraction_of_year
 *   annual_tax        = federal + Ontario (brackets − BPA credit + ON surtax + OHP)
 *   expected_ytd_tax  = annual_tax × fraction_of_year
 *   variance          = ytd_tax_actual − expected_ytd_tax   (negative = under-withheld)
 *
 * This is a year-to-date CHECK, not a per-cheque engine or a filing. 2026 tables
 * below are cross-checked (canada.ca-cited via TaxTips/Richter/Wealthsimple and
 * match Originality's own sheet) but the canada.ca PDFs 403'd the researcher —
 * confirm surtax thresholds + CPP/EI on the live T4127/T4032ON before remitting.
 * Income tax ONLY (CPP/EI excluded — separate maximums). Assumes basic TD1.
 * Source: docs/FIGGY_JR_ORIGINALITY_TAX_RECON.md
 * =============================================================================
 */

export type Bracket = { upTo: number; rate: number }; // upTo = upper bound (Infinity for top)

export type TaxTables = {
  year: number;
  verified: boolean;
  federalBrackets: Bracket[];
  federalLowestRate: number;
  federalBpaMax: number;       // BPA at low income
  federalBpaMin: number;       // BPA floor at high income
  federalBpaPhaseStart: number;
  federalBpaPhaseEnd: number;
  ontarioBrackets: Bracket[];
  ontarioLowestRate: number;
  ontarioBpa: number;
  ontarioSurtax1Threshold: number;  // 20% over this
  ontarioSurtax2Threshold: number;  // additional 36% over this
};

// 2026 figures (see docs/FIGGY_JR_ORIGINALITY_TAX_RECON.md §2).
export const TAX_2026: TaxTables = {
  year: 2026,
  verified: true, // 2026 brackets/BPA/surtax/OHP verified against multiple authoritative sources (see docs/FIGGY_JR_CRA_PAYROLL_CONSTANTS_2026.md)
  federalBrackets: [
    { upTo: 58523, rate: 0.14 },
    { upTo: 117045, rate: 0.205 },
    { upTo: 181440, rate: 0.26 },
    { upTo: 258482, rate: 0.29 },
    { upTo: Infinity, rate: 0.33 },
  ],
  federalLowestRate: 0.14,
  federalBpaMax: 16452,
  federalBpaMin: 14829,
  federalBpaPhaseStart: 181440,
  federalBpaPhaseEnd: 258482,
  ontarioBrackets: [
    { upTo: 53891, rate: 0.0505 },
    { upTo: 107785, rate: 0.0915 },
    { upTo: 150000, rate: 0.1116 },
    { upTo: 220000, rate: 0.1216 },
    { upTo: Infinity, rate: 0.1316 },
  ],
  ontarioLowestRate: 0.0505,
  ontarioBpa: 12989,
  ontarioSurtax1Threshold: 5818,
  ontarioSurtax2Threshold: 7307,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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

/** Federal BPA, straight-line phased down for high incomes. */
export function federalBpa(income: number, t: TaxTables = TAX_2026): number {
  const frac = clamp((income - t.federalBpaPhaseStart) / (t.federalBpaPhaseEnd - t.federalBpaPhaseStart), 0, 1);
  return t.federalBpaMax - (t.federalBpaMax - t.federalBpaMin) * frac;
}

/** Federal tax after the basic-personal-amount credit (basic TD1 only). */
export function federalTax(taxable: number, t: TaxTables = TAX_2026): number {
  const gross = bracketTax(taxable, t.federalBrackets);
  const credit = t.federalLowestRate * federalBpa(taxable, t);
  return Math.max(0, gross - credit);
}

/**
 * Ontario Health Premium (T4032ON V2) — lesser-of schedule by taxable income.
 * §2.4 of the research doc.
 */
export function ontarioHealthPremium(taxable: number): number {
  if (taxable <= 20000) return 0;
  if (taxable <= 36000) return Math.min(300, 0.06 * (taxable - 20000));
  if (taxable <= 48000) return Math.min(450, 300 + 0.06 * (taxable - 36000));
  if (taxable <= 72000) return Math.min(600, 450 + 0.25 * (taxable - 48000));
  if (taxable <= 200000) return Math.min(750, 600 + 0.25 * (taxable - 72000));
  return Math.min(900, 750 + 0.25 * (taxable - 200000));
}

/** Ontario tax = bracket tax − BPA credit, + surtax + health premium. */
export function ontarioTax(taxable: number, t: TaxTables = TAX_2026): number {
  const base = Math.max(0, bracketTax(taxable, t.ontarioBrackets) - t.ontarioLowestRate * t.ontarioBpa);
  const surtax = 0.20 * Math.max(0, base - t.ontarioSurtax1Threshold) + 0.36 * Math.max(0, base - t.ontarioSurtax2Threshold);
  const health = ontarioHealthPremium(taxable);
  return base + surtax + health;
}

/** Total annual income tax (federal + Ontario) on a taxable income. */
export function annualIncomeTax(taxable: number, t: TaxTables = TAX_2026): number {
  return round2(federalTax(taxable, t) + ontarioTax(taxable, t));
}

export type Reconciliation = {
  ytdGross: number;
  ytdTaxDeducted: number;
  fractionOfYear: number;
  annualizedIncome: number;
  annualTaxExpected: number;
  expectedYtdTax: number;
  variance: number;            // actual − expected (negative = under-withheld)
  underWithheld: boolean;
  effectiveAnnualRate: number;
};

/**
 * Reconcile actual vs expected withholding on accumulated income.
 * fractionOfYear: portion of the year the YTD figure covers (periods elapsed /
 * periods per year). If the gross is already a full-year figure, pass 1.
 */
export function reconcileWithholding(
  ytdGross: number,
  ytdTaxDeducted: number,
  fractionOfYear: number,
  t: TaxTables = TAX_2026,
): Reconciliation {
  const frac = clamp(fractionOfYear, 0.0001, 1);
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
    underWithheld: variance < -0.5,
    effectiveAnnualRate: annualizedIncome > 0 ? Math.round(annualTaxExpected / annualizedIncome * 1000) / 1000 : 0,
  };
}
