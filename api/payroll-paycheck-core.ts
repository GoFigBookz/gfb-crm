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
import { annualIncomeTax, federalTax, ontarioTax, TaxTables, TAX_2026 } from "./payroll-tax-core";
import { periodsPerYear } from "./payroll-core";

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
  cpp2Rate: 0.04, yampe: 85700, cpp2MaxAnnual: 444.0,
  eiRate: 0.0163, mie: 68900, eiMaxAnnual: 1123.07, eiEmployerMult: 1.4,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
  tax: TaxTables = TAX_2026,
  cpe: CppEiConstants = CPP_EI_2026,
): Paycheck {
  const p = periodsPerYear(frequency);
  const annual = round2(Math.max(0, gross) * p);

  // CPP (annual method ÷ periods), capped at the annual maximums.
  const cppBaseAnnual = clamp(Math.max(0, Math.min(annual, cpe.ympe) - cpe.cppExemption) * cpe.cppRate, 0, cpe.cppMaxAnnual);
  const cpp2Annual = clamp(Math.max(0, Math.min(annual, cpe.yampe) - cpe.ympe) * cpe.cpp2Rate, 0, cpe.cpp2MaxAnnual);
  const eiAnnual = clamp(Math.min(annual, cpe.mie) * cpe.eiRate, 0, cpe.eiMaxAnnual);

  const cpp = round2(cppBaseAnnual / p);
  const cpp2 = round2(cpp2Annual / p);
  const ei = round2(eiAnnual / p);

  // Income tax: annual fed + ON on the annualized gross, less the CPP/EI tax
  // credit (at the lowest federal rate), ÷ periods. Mirrors PDOC's K2 credit.
  const fedAnnual = federalTax(annual, tax);
  const onAnnual = ontarioTax(annual, tax);
  const cppEiCredit = (cppBaseAnnual + eiAnnual) * tax.federalLowestRate;
  const fedAnnualNet = Math.max(0, fedAnnual - cppEiCredit);
  const federalTaxPeriod = round2(fedAnnualNet / p);
  const provincialTaxPeriod = round2(onAnnual / p);
  const incomeTax = round2(federalTaxPeriod + provincialTaxPeriod);

  const totalDeductions = round2(cpp + cpp2 + ei + incomeTax);
  const netPay = round2(gross - totalDeductions);

  const employerCpp = cpp;
  const employerCpp2 = cpp2;
  const employerEi = round2(ei * cpe.eiEmployerMult);
  const employerCost = round2(gross + employerCpp + employerCpp2 + employerEi);

  return {
    gross: round2(gross), frequency, periodsPerYear: p, annualizedGross: annual,
    cpp, cpp2, ei, incomeTax, federalTax: federalTaxPeriod, provincialTax: provincialTaxPeriod,
    totalDeductions, netPay,
    employerCpp, employerCpp2, employerEi, employerCost,
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
