/**
 * FIGGY JR — CRA-GRADE PAYROLL DEDUCTIONS (pure, testable)
 * =============================================================================
 * Real per-pay CPP / CPP2 / EI / federal + Ontario income tax using the CRA
 * T4127 "Payroll Deductions Formulas" exact-calculation method — the same math
 * the CRA Payroll Deductions Online Calculator (PDOC) uses. Replaces the old
 * flat-rate estimate (CPP 5.95% / EI 1.66% / tax 15% of gross).
 *
 * YTD-aware: pass the employee's prior-to-this-pay accumulated pensionable /
 * insurable earnings (the "carryforward") and CPP/EI/CPP2 max out correctly —
 * this is what Originality's revenue-share pay needs (lumpy, must respect the
 * annual maximums and the carryforward gross).
 *
 * Constants live in CRA_2026 below and are the ONE place to update each year
 * (and on a CRA mid-year revision). Sourced in
 * docs/FIGGY_JR_CRA_PAYROLL_CONSTANTS_2026.md.
 * =============================================================================
 */
import {
  type Bracket, bracketTax, federalBpa, ontarioHealthPremium, TAX_2026,
} from "./payroll-tax-core";

export type CraConstants = {
  year: number;
  verified: boolean;
  cpp: {
    ympe: number;            // 1st ceiling (max pensionable earnings)
    yampe: number;           // 2nd ceiling (CPP2 upper bound)
    exemption: number;       // annual basic exemption
    rate: number;            // employee base rate (e.g. 0.0595)
    rate2: number;           // CPP2 rate (e.g. 0.04)
    baseRateForCredit: number; // pre-enhancement base rate (0.0495) — the credit/deduction split
    maxBase: number;         // max annual base employee contribution
    maxCpp2: number;         // max annual CPP2 employee contribution
  };
  ei: {
    rate: number;            // employee premium rate
    mie: number;             // max annual insurable earnings
    maxPremium: number;      // max annual employee premium
    employerMult: number;    // employer multiplier (1.4)
  };
  fed: {
    brackets: Bracket[];
    lowestRate: number;
    cea: number;             // Canada Employment Amount (annual)
  };
  on: {
    brackets: Bracket[];
    lowestRate: number;
    bpa: number;
    surtax1: number;         // threshold for 20% surtax (on basic ON tax)
    surtax2: number;         // threshold for additional 36% surtax
  };
};

// 2026 constants — verified against multiple authoritative sources (CPP/CPP2/EI,
// federal & Ontario brackets/BPA fully confirmed; CEA, ON surtax, OHP cross-
// checked). See docs/FIGGY_JR_CRA_PAYROLL_CONSTANTS_2026.md. NOTE: tax is
// computed progressively (bracketTax) which equals the T4127 R×A−K form, so the
// per-bracket "K" constants aren't needed here. Update once per year (+ the CRA
// mid-year 123rd edition takes effect for pay dates on/after 2026-07-01).
export const CRA_2026: CraConstants = {
  year: 2026,
  verified: true,
  cpp: {
    ympe: 74600, yampe: 85000, exemption: 3500, rate: 0.0595, rate2: 0.04,
    baseRateForCredit: 0.0495, maxBase: 4230.45, maxCpp2: 416.00,
  },
  ei: { rate: 0.0163, mie: 68900, maxPremium: 1123.07, employerMult: 1.4 },
  fed: { brackets: TAX_2026.federalBrackets, lowestRate: TAX_2026.federalLowestRate, cea: 1501 },
  on: {
    brackets: TAX_2026.ontarioBrackets, lowestRate: TAX_2026.ontarioLowestRate,
    bpa: TAX_2026.ontarioBpa, surtax1: TAX_2026.ontarioSurtax1Threshold, surtax2: TAX_2026.ontarioSurtax2Threshold,
  },
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pos = (n: number) => Math.max(0, n);

// ---------------------------------------------------------------------------
// CPP / CPP2 — CRA per-pay method: each pay gets a prorated basic exemption
// (annual exemption ÷ pay periods), and contributions are capped cumulatively
// against the annual maximums using the YTD carryforward. Base CPP applies to
// pensionable earnings up to the YMPE; CPP2 applies between YMPE and YAMPE.
// ---------------------------------------------------------------------------
export function cppForPeriod(
  grossPeriod: number,
  ytdPensionableBefore: number,
  periodsPerYear = 12,
  periodsElapsedBefore = 0,
  c: CraConstants = CRA_2026,
) {
  const before = pos(ytdPensionableBefore);
  const after = before + pos(grossPeriod);
  const exemptionPeriod = c.cpp.exemption / periodsPerYear;

  // Base CPP — on this period's pensionable earnings up to the YMPE, less the
  // per-pay exemption; cumulatively capped at the annual base maximum.
  const baseEarnings = pos(Math.min(after, c.cpp.ympe) - Math.min(before, c.cpp.ympe));
  const ytdBase = c.cpp.rate * pos(Math.min(before, c.cpp.ympe) - exemptionPeriod * periodsElapsedBefore);
  const rawBase = c.cpp.rate * pos(baseEarnings - exemptionPeriod);
  const base = round2(Math.min(rawBase, pos(c.cpp.maxBase - ytdBase)));

  // CPP2 — on earnings between YMPE and YAMPE; cumulatively capped.
  const cpp2Earnings = pos(Math.min(after, c.cpp.yampe) - Math.max(before, c.cpp.ympe));
  const ytdCpp2 = c.cpp.rate2 * pos(Math.min(before, c.cpp.yampe) - c.cpp.ympe);
  const cpp2 = round2(Math.min(c.cpp.rate2 * cpp2Earnings, pos(c.cpp.maxCpp2 - ytdCpp2)));

  // Enhanced portion (deductible from income): the 1% base enhancement + all CPP2.
  const enhanced = round2(base * ((c.cpp.rate - c.cpp.baseRateForCredit) / c.cpp.rate) + cpp2);
  // Base portion that earns the non-refundable credit (the 4.95% slice).
  const forCredit = round2(base * (c.cpp.baseRateForCredit / c.cpp.rate));
  return { base, cpp2, total: round2(base + cpp2), enhanced, forCredit };
}

// ---------------------------------------------------------------------------
// EI — cumulative insurable earnings capped at the MIE.
// ---------------------------------------------------------------------------
function eiCum(cumInsurable: number, c: CraConstants): number {
  return Math.min(c.ei.maxPremium, c.ei.rate * Math.min(cumInsurable, c.ei.mie));
}
export function eiForPeriod(grossPeriod: number, ytdInsurableBefore: number, c: CraConstants = CRA_2026) {
  const before = pos(ytdInsurableBefore);
  const after = before + pos(grossPeriod);
  const employee = round2(eiCum(after, c) - eiCum(before, c));
  return { employee, employer: round2(employee * c.ei.employerMult) };
}

// ---------------------------------------------------------------------------
// Income tax — T4127 exact method. Annualize the period's taxable income,
// compute annual federal + Ontario tax net of credits (BPA, CPP/EI, CEA) and
// Ontario surtax + health premium, then divide back to the period.
// ---------------------------------------------------------------------------
export type TaxInputs = {
  grossPeriod: number;
  periodsPerYear: number;
  /** enhanced CPP for THIS period (deductible from income) */
  enhancedCppPeriod: number;
  /** base CPP (4.95% slice) for THIS period — earns the tax credit */
  cppForCreditPeriod: number;
  /** EI premium for THIS period — earns the tax credit */
  eiPeriod: number;
  c?: CraConstants;
};

export function incomeTaxForPeriod(i: TaxInputs) {
  const c = i.c ?? CRA_2026;
  const P = i.periodsPerYear;
  // Annual taxable income (T4127 "A"): gross less the enhanced-CPP deduction.
  const A = pos(P * (i.grossPeriod - i.enhancedCppPeriod));

  // Annual creditable CPP (base) and EI, each capped at the annual max.
  const annualCppCredit = Math.min(P * i.cppForCreditPeriod, c.cpp.maxBase * (c.cpp.baseRateForCredit / c.cpp.rate));
  const annualEiCredit = Math.min(P * i.eiPeriod, c.ei.maxPremium);

  // Federal
  const fedBase = bracketTax(A, c.fed.brackets);
  const k1f = c.fed.lowestRate * federalBpa(A);
  const k2f = c.fed.lowestRate * (annualCppCredit + annualEiCredit);
  const k4f = c.fed.lowestRate * Math.min(A, c.fed.cea);
  const fedAnnual = pos(fedBase - k1f - k2f - k4f);

  // Ontario
  const onBase = bracketTax(A, c.on.brackets);
  const k1o = c.on.lowestRate * c.on.bpa;
  const k2o = c.on.lowestRate * (annualCppCredit + annualEiCredit);
  const onAnnualBasic = pos(onBase - k1o - k2o);
  const surtax = 0.20 * pos(onAnnualBasic - c.on.surtax1) + 0.36 * pos(onAnnualBasic - c.on.surtax2);
  const ohp = ontarioHealthPremium(A);
  const onAnnual = onAnnualBasic + surtax + ohp;

  return {
    annualizedIncome: round2(A),
    federalTax: round2(fedAnnual / P),
    provincialTax: round2(onAnnual / P),
    totalTax: round2((fedAnnual + onAnnual) / P),
  };
}

// ---------------------------------------------------------------------------
// One-call line calculator: gross for the period (+ carryforward) → full line.
// ---------------------------------------------------------------------------
export type CraLineInput = {
  grossPeriod: number;
  periodsPerYear: number;
  ytdPensionableBefore?: number;  // carryforward gross for CPP
  ytdInsurableBefore?: number;    // carryforward gross for EI (defaults to pensionable)
  periodsElapsedBefore?: number;  // pay periods already paid this year (for the CPP exemption)
  c?: CraConstants;
};

export type CraLine = {
  grossPay: number;
  cppEmployee: number;
  cpp2Employee: number;
  eiEmployee: number;
  federalTax: number;
  provincialTax: number;
  cppEmployer: number;
  cpp2Employer: number;
  eiEmployer: number;
  netPay: number;
  craRemittance: number;
  annualizedIncome: number;
  verified: boolean;
};

export function computeCraLine(input: CraLineInput): CraLine {
  const c = input.c ?? CRA_2026;
  const gross = round2(input.grossPeriod);
  const cpp = cppForPeriod(gross, input.ytdPensionableBefore ?? 0, input.periodsPerYear, input.periodsElapsedBefore ?? 0, c);
  const ei = eiForPeriod(gross, input.ytdInsurableBefore ?? input.ytdPensionableBefore ?? 0, c);
  const tax = incomeTaxForPeriod({
    grossPeriod: gross, periodsPerYear: input.periodsPerYear,
    enhancedCppPeriod: cpp.enhanced, cppForCreditPeriod: cpp.forCredit, eiPeriod: ei.employee, c,
  });
  // Net from the rounded components so gross − cpp − ei − fed − prov = net exactly.
  const netPay = round2(gross - cpp.total - ei.employee - tax.federalTax - tax.provincialTax);
  const cppEmployer = cpp.base;       // employer matches base 1×
  const cpp2Employer = cpp.cpp2;      // employer matches CPP2 1×
  const eiEmployer = ei.employer;
  const craRemittance = round2(
    cpp.total + cppEmployer + cpp2Employer + ei.employee + eiEmployer + tax.totalTax,
  );
  return {
    grossPay: gross,
    cppEmployee: cpp.base, cpp2Employee: cpp.cpp2, eiEmployee: ei.employee,
    federalTax: tax.federalTax, provincialTax: tax.provincialTax,
    cppEmployer, cpp2Employer, eiEmployer,
    netPay, craRemittance, annualizedIncome: tax.annualizedIncome, verified: c.verified,
  };
}
