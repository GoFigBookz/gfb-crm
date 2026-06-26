/**
 * INTER-COMPANY RECONCILIATION — pure core (Markie 2026-06-26).
 * =============================================================================
 * PURPOSE: Confirm the two reciprocal clearing accounts offset each other, i.e.
 * the intercompany balance is reconciled to zero. One side carries what the
 * counterparty owes (a receivable / debit), the other carries the mirror payable
 * (credit). When books are settled, the two balances are EQUAL IN MAGNITUDE and
 * OPPOSITE IN SIGN, so they sum to ~0.
 *
 * QBO sign caveat: Account.CurrentBalance signs vary by account type, so we report
 * BOTH the signed sum AND the magnitude difference, and call it reconciled if
 * EITHER is within the tolerance — then show the raw numbers so the human can see
 * exactly what's off. We never hide the variance.
 * INPUTS:  the two clearing-account balances (payer side, counterparty side).
 * OUTPUTS: { reconciled, sum, absDiff, variance, larger } — variance is the dollars
 *          to chase if not reconciled.
 * =============================================================================
 */
export type ReconCheck = {
  payerBalance: number;
  counterpartyBalance: number;
  sum: number;        // payer + counterparty (≈0 when opposite-signed and equal)
  absDiff: number;    // | |payer| − |counterparty| | (≈0 when same magnitude)
  variance: number;   // the smaller of the two distances from reconciled (what to chase)
  reconciled: boolean;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function checkClearingRecon(
  payerBalance: number,
  counterpartyBalance: number,
  toleranceDollars = 0.01,
): ReconCheck {
  const a = Number(payerBalance) || 0;
  const b = Number(counterpartyBalance) || 0;
  const sum = round2(a + b);
  const absDiff = round2(Math.abs(Math.abs(a) - Math.abs(b)));
  // Reconciled if the two are equal-and-opposite (sum≈0) OR equal-magnitude
  // (absDiff≈0) — either way the intercompany nets out. Variance = the residual.
  const variance = round2(Math.min(Math.abs(sum), absDiff));
  const reconciled = Math.abs(sum) <= toleranceDollars || absDiff <= toleranceDollars;
  return { payerBalance: round2(a), counterpartyBalance: round2(b), sum, absDiff, variance, reconciled };
}
