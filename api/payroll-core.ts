/**
 * FIGGY JR — PAYROLL CALC CORE (pure, testable)
 * =============================================================================
 * v1 deduction estimator. This is NOT a CRA-grade T4127 engine — it's the simple
 * flat-rate roll-up the practice already uses on the Selective Painting sheet
 * (verified live: Gross = Net / 0.7739, CPP 5.95%, EI 1.66%, Tax 15% of gross,
 * Employer CPP = 1×, Employer EI = 1.4×, CRA remittance = sum of all five).
 * Rates are parameterized so they can be bumped to official 2026 numbers later.
 * Every figure stays editable in the UI — this only pre-fills an estimate.
 * =============================================================================
 */
export type DeductionRates = {
  cpp: number;       // employee CPP rate (Selective sheet: 0.0595)
  ei: number;        // employee EI rate (Selective sheet: 0.0166)
  tax: number;       // flat income-tax estimate on gross (Selective sheet: 0.15)
  eiEmployerMult: number; // employer EI multiplier (CRA: 1.4)
};

// Defaults mirror the live Selective Painting sheet exactly.
export const SELECTIVE_RATES: DeductionRates = { cpp: 0.0595, ei: 0.0166, tax: 0.15, eiEmployerMult: 1.4 };

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type EstimatedLine = {
  grossPay: number;
  cppEmployee: number;
  eiEmployee: number;
  federalTax: number;   // we store the flat tax estimate here (provincial left 0 in v1)
  cppEmployer: number;
  eiEmployer: number;
  netPay: number;
  craRemittance: number;
};

/** Estimate every deduction from a GROSS figure using flat rates. */
export function estimateFromGross(gross: number, rates: DeductionRates = SELECTIVE_RATES): EstimatedLine {
  const grossPay = round2(gross);
  const cppEmployee = round2(grossPay * rates.cpp);
  const eiEmployee = round2(grossPay * rates.ei);
  const federalTax = round2(grossPay * rates.tax);
  const cppEmployer = cppEmployee;                       // employer matches 1×
  const eiEmployer = round2(eiEmployee * rates.eiEmployerMult);
  const netPay = round2(grossPay - cppEmployee - eiEmployee - federalTax);
  const craRemittance = round2(cppEmployee + eiEmployee + federalTax + cppEmployer + eiEmployer);
  return { grossPay, cppEmployee, eiEmployee, federalTax, cppEmployer, eiEmployer, netPay, craRemittance };
}

/** Back into gross from a desired NET (the Selective sheet's primary input). */
export function estimateFromNet(net: number, rates: DeductionRates = SELECTIVE_RATES): EstimatedLine {
  const factor = 1 - rates.cpp - rates.ei - rates.tax; // 0.7739 with Selective rates
  const gross = factor > 0 ? net / factor : net;
  return estimateFromGross(gross, rates);
}

/** Periods per year for a pay frequency (drives salary-per-period seeding). */
export function periodsPerYear(freq: string | null | undefined): number {
  switch (freq) {
    case "weekly": return 52;
    case "biweekly": return 26;
    case "semi_monthly": return 24;
    case "monthly": return 12;
    default: return 12;
  }
}

/** Gross for a salaried employee for one period of the given frequency. */
export function salaryPerPeriod(annualSalary: number | null | undefined, freq: string | null | undefined): number {
  if (!annualSalary) return 0;
  return round2(annualSalary / periodsPerYear(freq));
}

export type PayFreq = "weekly" | "biweekly" | "semi_monthly" | "monthly";

/** Normalize the loose client.payrollFrequency values to our enum. */
export function normalizeFrequency(f: string | null | undefined): PayFreq {
  const s = (f || "").toLowerCase().replace(/[\s-]/g, "_");
  if (s.startsWith("week")) return "weekly";
  if (s.startsWith("bi")) return "biweekly";
  if (s.startsWith("semi")) return "semi_monthly";
  return "monthly";
}

const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

/**
 * The NEXT pay period for a frequency, following the previous run's period (so
 * "New pay run" auto-advances). If no previous run, returns the current period.
 */
export function nextPayPeriod(
  frequency: string | null | undefined,
  lastStart?: Date | null,
  lastEnd?: Date | null,
): { start: Date; end: Date; payDate: Date } {
  const f = normalizeFrequency(frequency);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  if (f === "weekly" || f === "biweekly") {
    const span = f === "weekly" ? 7 : 14;
    const start = lastEnd ? addDays(new Date(lastEnd), 1) : today;
    const end = addDays(start, span - 1);
    return { start, end, payDate: end };
  }

  if (f === "semi_monthly") {
    let start: Date, end: Date;
    if (lastStart) {
      const y = lastStart.getFullYear(), m = lastStart.getMonth();
      if (lastStart.getDate() <= 15) { start = new Date(y, m, 16); end = new Date(y, m + 1, 0); }
      else { start = new Date(y, m + 1, 1); end = new Date(y, m + 1, 15); }
    } else {
      const y = today.getFullYear(), m = today.getMonth();
      if (today.getDate() <= 15) { start = new Date(y, m, 1); end = new Date(y, m, 15); }
      else { start = new Date(y, m, 16); end = new Date(y, m + 1, 0); }
    }
    return { start, end, payDate: end };
  }

  // monthly
  const base = lastEnd ? new Date(lastEnd.getFullYear(), lastEnd.getMonth() + 1, 1)
                       : new Date(today.getFullYear(), today.getMonth(), 1);
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { start, end, payDate: end };
}
