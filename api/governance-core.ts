/**
 * GOVERNED AUTONOMY — the policy engine (pure, unit-tested).
 * =============================================================================
 * Best practice (2026): instead of a human inside every transaction, you set
 * policy ABOVE the system — dollar thresholds + confidence bars — and agents act
 * within it, with every step audited. This decides, for a proposed action,
 * whether an agent may do it autonomously or must escalate to Markie.
 *
 * DEFAULT is OFF (everything escalates) — matching today's golden rule "nothing
 * posts without Markie." Raising the threshold is a deliberate, per-firm choice
 * Markie makes once he trusts an agent's scorecard.
 * =============================================================================
 */
export interface AutonomyPolicy {
  enabled: boolean;            // master switch — off = escalate everything
  autoApproveUnder: number;    // $ amount an agent may act on alone
  greenConfidenceMin: number;  // minimum confidence (0-100) to act alone
}

export const DEFAULT_POLICY: AutonomyPolicy = {
  enabled: false,
  autoApproveUnder: 0,
  greenConfidenceMin: 85,
};

export type Decision = "auto" | "escalate";

export function decideAutonomy(
  input: { amount?: number | null; confidence?: number | null },
  policy: AutonomyPolicy = DEFAULT_POLICY,
): { decision: Decision; reason: string } {
  if (!policy.enabled) {
    return { decision: "escalate", reason: "Governed autonomy is off — every item goes to Markie for review." };
  }
  const amt = input.amount ?? Infinity;          // unknown amount → treat as large
  const conf = input.confidence ?? 0;            // unknown confidence → treat as low
  if (amt > policy.autoApproveUnder) {
    return { decision: "escalate", reason: `$${amt} is over the $${policy.autoApproveUnder} auto-approve limit — escalating.` };
  }
  if (conf < policy.greenConfidenceMin) {
    return { decision: "escalate", reason: `Confidence ${conf}% is below the ${policy.greenConfidenceMin}% bar — escalating.` };
  }
  return { decision: "auto", reason: `Within policy ($${amt} ≤ $${policy.autoApproveUnder}, ${conf}% ≥ ${policy.greenConfidenceMin}%).` };
}
