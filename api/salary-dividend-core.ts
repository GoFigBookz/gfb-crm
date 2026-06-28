/**
 * SALARY vs DIVIDEND — full-Canada owner-remuneration comparison.
 * =============================================================================
 * Compares taking $X of corporate profit as SALARY (deductible to the corp; taxed
 * to the owner as employment income + CPP/EI) vs as a DIVIDEND (corp pays tax
 * first, owner grosses up + claims the dividend tax credit).
 *
 * ACCURACY MODEL (engineering standard — no black boxes, no guessed rates):
 *  - Personal tax (both sides) reuses the codebase's ALREADY-VERIFIED 2026
 *    federal + provincial/territorial tax engines (payroll-tax-core +
 *    payroll-provincial-2026 + the province-aware computePaycheck for CPP/EI).
 *  - The only province-specific inputs THIS file adds are the 4 corporate /
 *    dividend-credit rates. They live in PROV_CORP_RATES with a per-jurisdiction
 *    `verified` flag, and the UI shows them as EDITABLE fields (Ontario verified;
 *    others pre-filled as estimates to confirm) — nothing uncertain is hidden.
 *
 * Inputs:  province, profit, dividend type (eligible=from general-rate income /
 *          non-eligible=from small-business income), and the 4 rates.
 * Outputs: salary net, dividend net, taxes, which wins + the spread.
 * Errors:  pure — clamps, never throws.
 * =============================================================================
 */
import { computePaycheck } from "./payroll-paycheck-core";
import { federalTax, ontarioTax } from "./payroll-tax-core";
import { provincialAnnualTax, QC_FEDERAL_ABATEMENT } from "./payroll-provincial-2026";

// Federal constants (stable, well-published).
export const FED = {
  corpSmallBiz: 0.09, corpGeneral: 0.15,
  grossUpEligible: 1.38, grossUpNonEligible: 1.15,
  dtcEligible: 0.150198, dtcNonEligible: 0.090301, // federal DTC, as a fraction of the grossed-up dividend
};

export interface ProvCorpRate {
  smallBizCorp: number;   // PROVINCIAL small-business corp rate (fraction)
  generalCorp: number;    // PROVINCIAL general corp rate (fraction)
  dtcEligible: number;    // PROVINCIAL dividend tax credit on eligible (fraction of grossed-up)
  dtcNonEligible: number; // PROVINCIAL dividend tax credit on non-eligible (fraction of grossed-up)
  verified: boolean;      // true = confirmed; false = estimate the user should confirm
}

/**
 * 2026 PROVINCIAL portions. Ontario is verified (matches the prior Ontario-only
 * calculator). The rest are STARTING ESTIMATES, flagged unverified — surfaced as
 * editable fields in the UI so Markie confirms/corrects against his rate sheet.
 */
export const PROV_CORP_RATES: Record<string, ProvCorpRate> = {
  ON: { smallBizCorp: 0.032, generalCorp: 0.115, dtcEligible: 0.10, dtcNonEligible: 0.029863, verified: true },
  BC: { smallBizCorp: 0.02, generalCorp: 0.12, dtcEligible: 0.12, dtcNonEligible: 0.0196, verified: false },
  AB: { smallBizCorp: 0.02, generalCorp: 0.08, dtcEligible: 0.0812, dtcNonEligible: 0.0218, verified: false },
  SK: { smallBizCorp: 0.01, generalCorp: 0.12, dtcEligible: 0.11, dtcNonEligible: 0.02105, verified: false },
  MB: { smallBizCorp: 0.00, generalCorp: 0.12, dtcEligible: 0.08, dtcNonEligible: 0.007835, verified: false },
  QC: { smallBizCorp: 0.032, generalCorp: 0.115, dtcEligible: 0.117, dtcNonEligible: 0.0342, verified: false },
  NB: { smallBizCorp: 0.025, generalCorp: 0.14, dtcEligible: 0.14, dtcNonEligible: 0.0275, verified: false },
  NS: { smallBizCorp: 0.025, generalCorp: 0.14, dtcEligible: 0.0885, dtcNonEligible: 0.0299, verified: false },
  PE: { smallBizCorp: 0.01, generalCorp: 0.16, dtcEligible: 0.105, dtcNonEligible: 0.013, verified: false },
  NL: { smallBizCorp: 0.025, generalCorp: 0.15, dtcEligible: 0.063, dtcNonEligible: 0.032, verified: false },
  YT: { smallBizCorp: 0.00, generalCorp: 0.12, dtcEligible: 0.1202, dtcNonEligible: 0.0067, verified: false },
  NT: { smallBizCorp: 0.02, generalCorp: 0.115, dtcEligible: 0.115, dtcNonEligible: 0.06, verified: false },
  NU: { smallBizCorp: 0.03, generalCorp: 0.12, dtcEligible: 0.0551, dtcNonEligible: 0.0261, verified: false },
};

export type DividendType = "eligible" | "noneligible";

export interface SalaryDividendInput {
  province: string;
  profit: number;                 // corporate pre-tax profit available to extract
  dividendType: DividendType;
  rates?: Partial<ProvCorpRate>;  // override the table (the editable UI fields)
}

export interface SalaryDividendResult {
  salaryNet: number; salaryTotalTax: number; salaryPersonalTax: number; salaryCppEi: number;
  corpTax: number; dividend: number; dividendNet: number; dividendPersonalTax: number; dividendTotalTax: number;
  better: "salary" | "dividend"; delta: number;
  ratesUsed: ProvCorpRate; verified: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Personal income tax (federal + provincial) on a standalone amount, province-aware. */
export function personalTaxOn(amount: number, province: string): number {
  if (amount <= 0) return 0;
  let fed = federalTax(amount);
  if (province === "QC") fed = fed * (1 - QC_FEDERAL_ABATEMENT); // Quebec abatement reduces federal tax
  const prov = province === "ON" ? ontarioTax(amount) : (provincialAnnualTax(amount, 0, province)?.tax ?? 0);
  return round2(fed + prov);
}

export function compareSalaryVsDividend(input: SalaryDividendInput): SalaryDividendResult {
  const P = Math.max(0, input.profit);
  const base = PROV_CORP_RATES[input.province] || PROV_CORP_RATES.ON;
  const r: ProvCorpRate = { ...base, ...(input.rates || {}) };
  const elig = input.dividendType === "eligible";

  // SALARY: corp deducts it (corp tax $0); owner pays employment tax + CPP/EI.
  const pc = computePaycheck(P, "annual", undefined, undefined, input.province);
  const salaryPersonalTax = round2(pc.federalTax + pc.provincialTax);
  const salaryCppEi = round2(pc.cpp + pc.cpp2 + pc.ei);
  const salaryNet = round2(pc.netPay);
  const salaryTotalTax = round2(salaryPersonalTax + salaryCppEi);

  // DIVIDEND: corp pays tax, balance paid out + grossed up, dividend tax credit applied.
  const corpRate = (elig ? FED.corpGeneral : FED.corpSmallBiz) + (elig ? r.generalCorp : r.smallBizCorp);
  const corpTax = round2(P * corpRate);
  const dividend = round2(P - corpTax);
  const grossUp = elig ? FED.grossUpEligible : FED.grossUpNonEligible;
  const grossed = dividend * grossUp;
  const taxOnGrossed = personalTaxOn(grossed, input.province);
  const dtcFrac = (elig ? FED.dtcEligible : FED.dtcNonEligible) + (elig ? r.dtcEligible : r.dtcNonEligible);
  const dtc = grossed * dtcFrac;
  const dividendPersonalTax = round2(Math.max(0, taxOnGrossed - dtc));
  const dividendNet = round2(dividend - dividendPersonalTax);
  const dividendTotalTax = round2(corpTax + dividendPersonalTax);

  return {
    salaryNet, salaryTotalTax, salaryPersonalTax, salaryCppEi,
    corpTax, dividend, dividendNet, dividendPersonalTax, dividendTotalTax,
    better: salaryNet >= dividendNet ? "salary" : "dividend",
    delta: round2(Math.abs(salaryNet - dividendNet)),
    ratesUsed: r, verified: r.verified,
  };
}
