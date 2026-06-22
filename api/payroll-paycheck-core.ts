/**
 * FIGGY JR — PAYCHECK CALCULATOR (pure, testable) — PDOC-style.
 * =============================================================================
 * Given a gross pay + pay frequency (Ontario), compute per-period CPP, CPP2, EI,
 * income tax (federal + Ontario), net pay, and the employer's cost — the way
 * CRA's Payroll Deductions Online Calculator does (annual method ÷ periods).
 *
 * This is an ESTIMATE/check, not a filing. Income tax reuses payroll-tax-core
 * (2026 brackets/BPA/surtax/health premium). CPP/EI constants below are 2026
 * figures pending final CRA confirmation — isolated so they're easy to update.
 * Assumes basic TD1, all earnings pensionable & insurable, no YTD caps reached.
 * =============================================================================
 */
import { TaxTables, TAX_2026 } from "./payroll-tax-core";
import { periodsPerYear } from "./payroll-core";
import { computeCraLine } from "./payroll-cra-core";

export type CppEiConstants = {
  year: number;
  cppRate: number; cppExemption: number; ympe: number; cppMaxAnnual: number;
  cpp2Rate: number; yampe: number; cpp2MaxAnnual: number;
  eiRate: number; mie: number; eiMaxAnnual: number; eiEmployerMult: number;
};

// 2026 — cross-checked (canada.ca via TaxTips/canajunfinances); confirm on the
// official CRA CPP & EI rate pages before relying on it for remittance.
export const CPP_EI_2026: CppEiConstants = {
  year: 2026,
  cppRate: 0.0595, cppExemption: 3500, ympe: 74600, cppMaxAnnual: 4230.45,
  cpp2Rate: 0.04, yampe: 85000, cpp2MaxAnnual: 416.0,
  eiRate: 0.0163, mie: 68900, eiMaxAnnual: 1123.07, eiEmployerMult: 1.4,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type Paycheck = {
  gross: number;
  frequency: string;
  periodsPerYear: number;
  annualizedGross: number;
  cpp: number;
  cpp2: number;
  ei: number;
  incomeTax: number;       // federal + Ontario combined, this period
  federalTax: number;
  provincialTax: number;
  totalDeductions: number;
  netPay: number;
  // employer side (this period)
  employerCpp: number;
  employerCpp2: number;
  employerEi: number;
  employerCost: number;    // gross + employer CPP/CPP2/EI
};

/**
 * Compute one paycheck. `pensionableInsurable` defaults to gross (the usual
 * case); pass a different value if some earnings aren't pensionable/insurable.
 */
export function computePaycheck(
  gross: number,
  frequency: string,
  _tax: TaxTables = TAX_2026,
  _cpe: CppEiConstants = CPP_EI_2026,
  province: string = "ON",
): Paycheck {
  const p = periodsPerYear(frequency);
  const g = Math.max(0, gross);
  // Amortized per-cheque for someone earning `g` every period all year, via the
  // single verified CRA engine. Simulating the whole year captures CPP2 and the
  // EI/CPP max-out (averaged), so the "typical cheque" is representative.
  let cum = 0, cpp = 0, cpp2 = 0, ei = 0, fed = 0, prov = 0, eCpp = 0, eCpp2 = 0, eEi = 0;
  for (let i = 0; i < p; i++) {
    const l = computeCraLine({ grossPeriod: g, periodsPerYear: p, ytdPensionableBefore: cum, periodsElapsedBefore: i, province });
    cpp += l.cppEmployee; cpp2 += l.cpp2Employee; ei += l.eiEmployee;
    fed += l.federalTax; prov += l.provincialTax;
    eCpp += l.cppEmployer; eCpp2 += l.cpp2Employer; eEi += l.eiEmployer;
    cum += g;
  }
  const perCpp = round2(cpp / p), perCpp2 = round2(cpp2 / p), perEi = round2(ei / p);
  const perFed = round2(fed / p), perProv = round2(prov / p);
  const incomeTax = round2(perFed + perProv);
  const totalDeductions = round2(perCpp + perCpp2 + perEi + incomeTax);
  const employerCpp = round2(eCpp / p), employerCpp2 = round2(eCpp2 / p), employerEi = round2(eEi / p);
  return {
    gross: round2(g), frequency, periodsPerYear: p, annualizedGross: round2(g * p),
    cpp: perCpp, cpp2: perCpp2, ei: perEi, incomeTax,
    federalTax: perFed, provincialTax: perProv,
    totalDeductions, netPay: round2(g - totalDeductions),
    employerCpp, employerCpp2, employerEi,
    employerCost: round2(g + employerCpp + employerCpp2 + employerEi),
  };
}

/** Gross from a target NET (binary search — handy for "pay them $X take-home"). */
export function grossFromNet(net: number, frequency: string, tax: TaxTables = TAX_2026, cpe: CppEiConstants = CPP_EI_2026): number {
  let lo = net, hi = net * 2 + 1000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const pc = computePaycheck(mid, frequency, tax, cpe);
    if (pc.netPay > net) hi = mid; else lo = mid;
  }
  return round2((lo + hi) / 2);
}
