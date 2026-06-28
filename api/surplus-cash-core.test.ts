import { describe, it, expect } from "vitest";
import { projectAnnualIncome, sbdGrind, analyzeSurplusCash } from "./surplus-cash-core";

describe("surplus cash — projected income", () => {
  it("computes annual income from cash × rate", () => {
    expect(projectAnnualIncome(200000, 4)).toBe(8000);
    expect(projectAnnualIncome(0, 4)).toBe(0);
    expect(projectAnnualIncome(-100, 4)).toBe(0); // clamps negatives
  });
});

describe("SBD grind from passive income", () => {
  it("no grind under $50k passive", () => {
    expect(sbdGrind(40000).reduction).toBe(0);
    expect(sbdGrind(50000).reduction).toBe(0);
  });
  it("$5 of limit per $1 over $50k", () => {
    expect(sbdGrind(60000).reduction).toBe(50000);   // 10k over × 5
    expect(sbdGrind(100000).reduction).toBe(250000);  // 50k over × 5
  });
  it("fully eliminated at $150k passive", () => {
    const g = sbdGrind(150000);
    expect(g.reduction).toBe(500000);
    expect(g.eliminated).toBe(true);
  });
});

describe("analyzeSurplusCash", () => {
  it("flags when this cash pushes passive income over the $50k floor", () => {
    const r = analyzeSurplusCash(1500000, 4, 0); // 60k income alone
    expect(r.projectedIncome).toBe(60000);
    expect(r.crossesThreshold).toBe(true);
    expect(r.grind.reduction).toBe(50000);
  });
  it("stacks on existing passive income", () => {
    const r = analyzeSurplusCash(500000, 4, 40000); // 20k + 40k = 60k passive
    expect(r.totalPassive).toBe(60000);
    expect(r.grind.reduction).toBe(50000);
  });
  it("no grind for a small balance", () => {
    const r = analyzeSurplusCash(100000, 3); // 3k income
    expect(r.crossesThreshold).toBe(false);
    expect(r.grind.reduction).toBe(0);
  });
});
