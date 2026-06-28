/**
 * SURPLUS CASH CORE — pure math for the "what to do with idle cash" tool.
 * =============================================================================
 * NOT investment advice. The in-lane part Figgy CAN speak to is the TAX angle:
 * idle cash that earns investment income inside a corporation generates passive
 * income, and once a CCPC's passive (aggregate investment) income tops $50k/yr it
 * GRINDS the $500k small-business deduction — reduced $5 for every $1 of passive
 * income over $50k, eliminated entirely at $150k. This computes the projected
 * income and that grind so Markie can frame the conversation (then refer to a
 * licensed advisor for the actual investing decision).
 *
 * Inputs:  idle cash, an annual rate %, optional existing passive income.
 * Outputs: projected income + the SBD grind it would cause.
 * Errors:  pure — clamps negatives, never throws.
 * =============================================================================
 */
export function projectAnnualIncome(idleCash: number, annualRatePct: number): number {
  const v = (Math.max(0, idleCash) * Math.max(0, annualRatePct)) / 100;
  return Math.round(v * 100) / 100;
}

const SBD_FLOOR = 50000;     // passive income below this = no grind
const SBD_CEILING = 150000;  // passive income at/above this = SBD fully gone

/** Small-business-deduction grind from a CCPC's passive (aggregate investment) income. */
export function sbdGrind(passiveIncome: number): { reduction: number; eliminated: boolean; floor: number; ceiling: number } {
  const over = Math.max(0, passiveIncome - SBD_FLOOR);
  const reduction = Math.min(500000, over * 5); // $5 of limit lost per $1 over $50k
  return { reduction: Math.round(reduction), eliminated: passiveIncome >= SBD_CEILING, floor: SBD_FLOOR, ceiling: SBD_CEILING };
}

export interface SurplusCashResult {
  projectedIncome: number;
  totalPassive: number;
  grind: ReturnType<typeof sbdGrind>;
  crossesThreshold: boolean; // this cash pushes passive income over the $50k floor
}

export function analyzeSurplusCash(idleCash: number, annualRatePct: number, existingPassive = 0): SurplusCashResult {
  const projectedIncome = projectAnnualIncome(idleCash, annualRatePct);
  const totalPassive = Math.round((Math.max(0, existingPassive) + projectedIncome) * 100) / 100;
  return {
    projectedIncome,
    totalPassive,
    grind: sbdGrind(totalPassive),
    crossesThreshold: existingPassive < SBD_FLOOR && totalPassive >= SBD_FLOOR,
  };
}
