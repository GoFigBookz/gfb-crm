import { describe, it, expect } from "vitest";
import { decideAutonomy, DEFAULT_POLICY, type AutonomyPolicy } from "./governance-core";

describe("decideAutonomy", () => {
  it("escalates everything when autonomy is off (the safe default)", () => {
    expect(decideAutonomy({ amount: 5, confidence: 99 }).decision).toBe("escalate");
    expect(DEFAULT_POLICY.enabled).toBe(false);
  });

  const on: AutonomyPolicy = { enabled: true, autoApproveUnder: 100, greenConfidenceMin: 85 };

  it("auto-approves a small, high-confidence item within policy", () => {
    const r = decideAutonomy({ amount: 40, confidence: 95 }, on);
    expect(r.decision).toBe("auto");
  });

  it("escalates when over the dollar limit", () => {
    expect(decideAutonomy({ amount: 500, confidence: 99 }, on).decision).toBe("escalate");
  });

  it("escalates when confidence is below the bar", () => {
    expect(decideAutonomy({ amount: 10, confidence: 60 }, on).decision).toBe("escalate");
  });

  it("escalates when amount or confidence is unknown", () => {
    expect(decideAutonomy({ amount: null, confidence: 99 }, on).decision).toBe("escalate");
    expect(decideAutonomy({ amount: 10, confidence: null }, on).decision).toBe("escalate");
  });
});
