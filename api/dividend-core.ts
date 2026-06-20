/**
 * FIGGY JR — DIVIDEND / T5 CORE (pure, testable)
 * =============================================================================
 * Computes the T5 slip boxes from an actual dividend amount: the gross-up
 * (taxable amount) and the federal dividend tax credit (DTC), for eligible vs
 * non-eligible dividends. 2024+ federal rates (apply for 2026).
 *
 *  Eligible      (box 24/25/26): gross-up 38%, DTC = 6/11 of the gross-up
 *                                (= 15.0198% of the taxable amount).
 *  Non-eligible  (box 10/11/12): gross-up 15%, DTC = 9/13 of the gross-up
 *                                (= 9.0301% of the taxable amount).
 * =============================================================================
 */
export type DividendType = "eligible" | "non_eligible";

export const DIVIDEND_RATES = {
  eligible: { grossUp: 0.38, dtcOfGrossUp: 6 / 11 },
  non_eligible: { grossUp: 0.15, dtcOfGrossUp: 9 / 13 },
} as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type T5Boxes = {
  type: DividendType;
  actual: number;        // actual dividend paid
  taxable: number;       // grossed-up taxable amount
  dtc: number;           // federal dividend tax credit
  // CRA box numbers for clarity on the slip
  actualBox: string;
  taxableBox: string;
  dtcBox: string;
};

/** T5 boxes for a single dividend amount of the given type. */
export function computeT5Boxes(actual: number, type: DividendType): T5Boxes {
  const r = DIVIDEND_RATES[type];
  const a = round2(Math.max(0, actual));
  const taxable = round2(a * (1 + r.grossUp));
  const dtc = round2((taxable - a) * r.dtcOfGrossUp);
  return type === "eligible"
    ? { type, actual: a, taxable, dtc, actualBox: "24", taxableBox: "25", dtcBox: "26" }
    : { type, actual: a, taxable, dtc, actualBox: "10", taxableBox: "11", dtcBox: "12" };
}

export type T5Slip = {
  eligible: T5Boxes;
  nonEligible: T5Boxes;
  totalActual: number;
  totalTaxable: number;
  totalDtc: number;
};

/** Aggregate a recipient's eligible + non-eligible dividends into one T5 slip. */
export function buildT5Slip(eligibleActual: number, nonEligibleActual: number): T5Slip {
  const eligible = computeT5Boxes(eligibleActual, "eligible");
  const nonEligible = computeT5Boxes(nonEligibleActual, "non_eligible");
  return {
    eligible,
    nonEligible,
    totalActual: round2(eligible.actual + nonEligible.actual),
    totalTaxable: round2(eligible.taxable + nonEligible.taxable),
    totalDtc: round2(eligible.dtc + nonEligible.dtc),
  };
}
