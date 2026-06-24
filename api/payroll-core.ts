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
// All pay-period math is UTC date-only — dates are stored at UTC midnight, so using
// UTC getters/Date.UTC everywhere keeps the calendar day from drifting a day in
// negative-offset timezones (e.g. Ontario), which was making June 10 show as June 9.
const utcAddDays = (d: Date, n: number) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function nextPayPeriod(
  frequency: string | null | undefined,
  lastStart?: Date | null,
  lastEnd?: Date | null,
  opts?: { anchorStart?: Date | null; payOffset?: number },
): { start: Date; end: Date; payDate: Date } {
  const f = normalizeFrequency(frequency);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const payOffset = opts?.payOffset ?? 0;
  const withPay = (start: Date, end: Date) => ({ start, end, payDate: utcAddDays(end, payOffset) });

  if (f === "weekly" || f === "biweekly") {
    const span = f === "weekly" ? 7 : 14;
    let start: Date;
    if (lastEnd) {
      start = utcAddDays(utcDay(lastEnd), 1);               // advance: day AFTER the last period end
    } else if (opts?.anchorStart) {
      // Align to the client's real cycle: the period (anchor + k·span) containing today.
      const a = utcDay(opts.anchorStart);
      const k = Math.floor((today.getTime() - a.getTime()) / (span * 86400000));
      start = utcAddDays(a, k * span);
    } else {
      start = today;
    }
    return withPay(start, utcAddDays(start, span - 1));
  }

  if (f === "semi_monthly") {
    let start: Date, end: Date;
    if (lastStart) {
      const y = lastStart.getUTCFullYear(), m = lastStart.getUTCMonth();
      if (lastStart.getUTCDate() <= 15) { start = new Date(Date.UTC(y, m, 16)); end = new Date(Date.UTC(y, m + 1, 0)); }
      else { start = new Date(Date.UTC(y, m + 1, 1)); end = new Date(Date.UTC(y, m + 1, 15)); }
    } else {
      const y = today.getUTCFullYear(), m = today.getUTCMonth();
      if (today.getUTCDate() <= 15) { start = new Date(Date.UTC(y, m, 1)); end = new Date(Date.UTC(y, m, 15)); }
      else { start = new Date(Date.UTC(y, m, 16)); end = new Date(Date.UTC(y, m + 1, 0)); }
    }
    return withPay(start, end);
  }

  // monthly
  const baseY = lastEnd ? lastEnd.getUTCFullYear() : today.getUTCFullYear();
  const baseM = (lastEnd ? lastEnd.getUTCMonth() + 1 : today.getUTCMonth());
  const start = new Date(Date.UTC(baseY, baseM, 1));
  const end = new Date(Date.UTC(baseY, baseM + 1, 0));
  return withPay(start, end);
}

/** PD7A (CRA payroll) remittance due date for a given pay date.
 *  - Regular remitter: the 15th of the month AFTER the pay date.
 *  - Accelerated threshold-1: the 25th of the SAME month for pay dates on/before
 *    the 15th, otherwise the 10th of the next month.
 *  Local-noon to avoid timezone day-drift. */
export function remittanceDueDate(payDate: Date, accelerated = false): Date {
  const y = payDate.getFullYear(), m = payDate.getMonth(), d = payDate.getDate();
  if (accelerated) {
    return d <= 15 ? new Date(y, m, 25, 12, 0, 0) : new Date(y, m + 1, 10, 12, 0, 0);
  }
  return new Date(y, m + 1, 15, 12, 0, 0);
}
