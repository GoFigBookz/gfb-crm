/**
 * Tests for the CRA-grade payroll deductions engine (T4127, 2026 ON).
 */
import { describe, it, expect } from "vitest";
import { cppForPeriod, eiForPeriod, computeCraLine, CRA_2026 } from "./payroll-cra-core";
import { provincialAnnualTax, PROVINCIAL_2026 } from "./payroll-provincial-2026";
import { bracketTax } from "./payroll-tax-core";

const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;

describe("CPP / CPP2", () => {
  it("base CPP for a monthly period uses the prorated exemption", () => {
    // 5.95% × (6000 − 3500/12)
    const r = cppForPeriod(6000, 0, 12, 0, CRA_2026);
    expect(near(r.base, 0.0595 * (6000 - 3500 / 12))).toBe(true);
    expect(r.cpp2).toBe(0);
  });

  it("a full year at YMPE hits the exact annual base maximum, no CPP2", () => {
    const monthly = CRA_2026.cpp.ympe / 12; // 74600/12
    let cum = 0, base = 0, cpp2 = 0;
    for (let i = 0; i < 12; i++) {
      const r = cppForPeriod(monthly, cum, 12, i, CRA_2026);
      base += r.base; cpp2 += r.cpp2; cum += monthly;
    }
    expect(near(base, CRA_2026.cpp.maxBase, 0.05)).toBe(true); // 4230.45
    expect(cpp2).toBe(0);
  });

  it("earnings above YMPE trigger CPP2 at 4%, capped at the annual max", () => {
    // One big period that takes cumulative pensionable from 0 to well past YAMPE.
    const r = cppForPeriod(120000, 0, 12, 0, CRA_2026);
    expect(near(r.base, CRA_2026.cpp.maxBase, 0.05)).toBe(true);
    expect(near(r.cpp2, CRA_2026.cpp.maxCpp2, 0.05)).toBe(true); // 416.00
  });

  it("CPP stops once the YTD carryforward has already maxed it", () => {
    const r = cppForPeriod(6000, 90000, 12, 11, CRA_2026); // already past YAMPE
    expect(r.base).toBe(0);
    expect(r.cpp2).toBe(0);
  });
});

describe("EI", () => {
  it("EI is the rate on gross until the MIE is reached", () => {
    const r = eiForPeriod(6000, 0, CRA_2026);
    expect(near(r.employee, 6000 * CRA_2026.ei.rate)).toBe(true);
    expect(near(r.employer, r.employee * 1.4)).toBe(true);
  });

  it("a full year above the MIE hits the exact annual EI maximum", () => {
    const monthly = 7000; // 84k > MIE
    let cum = 0, ei = 0;
    for (let i = 0; i < 12; i++) { ei += eiForPeriod(monthly, cum, CRA_2026).employee; cum += monthly; }
    expect(near(ei, CRA_2026.ei.maxPremium, 0.05)).toBe(true); // 1123.07
  });
});

describe("full line — $74,600 salary, monthly", () => {
  const monthly = 74600 / 12;
  it("a mid-year period produces a balanced, plausible line", () => {
    const l = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, ytdPensionableBefore: 0 });
    // net = gross − cpp − cpp2 − ei − fed − prov
    const recomputed = l.grossPay - l.cppEmployee - l.cpp2Employee - l.eiEmployee - l.federalTax - l.provincialTax;
    expect(near(recomputed, l.netPay, 0.02)).toBe(true);
    expect(l.federalTax).toBeGreaterThan(0);
    expect(l.provincialTax).toBeGreaterThan(0);
    expect(l.netPay).toBeLessThan(l.grossPay);
  });

  it("a no-carryforward period matches the hand-computed T4127 amounts", () => {
    // Hand calc for A=$73,889.04: federal $681.66/mo, Ontario $367.58/mo.
    const l = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, ytdPensionableBefore: 0, periodsElapsedBefore: 0 });
    expect(near(l.federalTax, 681.66, 0.1)).toBe(true);
    expect(near(l.provincialTax, 367.58, 0.1)).toBe(true);
  });

  it("12 periods sum near the annual income tax (EI max-out lifts it slightly)", () => {
    let cum = 0, tax = 0;
    for (let i = 0; i < 12; i++) {
      const l = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, ytdPensionableBefore: cum, periodsElapsedBefore: i });
      tax += l.federalTax + l.provincialTax; cum += monthly;
    }
    // ~$12,591 base; the last periods lose the EI credit once EI maxes → ~$12,607.
    expect(tax).toBeGreaterThan(12585);
    expect(tax).toBeLessThan(12650);
  });
});

describe("nationwide provincial tax", () => {
  it("Ontario is unchanged when selected explicitly (default == 'ON')", () => {
    const monthly = 74600 / 12;
    const def = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12 });
    const on = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, province: "ON" });
    expect(on.provincialTax).toBe(def.provincialTax);
    expect(on.federalTax).toBe(def.federalTax);
  });

  it("each province table is well-formed (ascending bands, Infinity top, sane rates)", () => {
    for (const t of Object.values(PROVINCIAL_2026)) {
      expect(t.brackets.length).toBeGreaterThan(0);
      expect(t.brackets[t.brackets.length - 1].upTo).toBe(Infinity);
      let prev = 0;
      for (const b of t.brackets) {
        expect(b.upTo).toBeGreaterThan(prev); prev = b.upTo;
        expect(b.rate).toBeGreaterThan(0); expect(b.rate).toBeLessThan(0.4);
      }
      expect(t.bpa).toBeGreaterThan(8000); expect(t.bpa).toBeLessThan(25000);
    }
  });

  it("Alberta uses its own bracket — 8% on income above BPA, BPA-credited", () => {
    // $80k taxable, no CPP/EI credits: AB basic = bracketTax(80k) − 8%×BPA.
    const r = provincialAnnualTax(80000, 0, "AB")!;
    const expected = bracketTax(80000, PROVINCIAL_2026.AB.brackets) - 0.08 * 22769;
    expect(Math.abs(r.tax - expected)).toBeLessThan(0.01);
    expect(r.tax).toBeGreaterThan(0);
  });

  it("Alberta annual tax differs from Ontario for the same income (proves it's not ON-fallback)", () => {
    const monthly = 90000 / 12;
    const on = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, province: "ON" });
    const ab = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, province: "AB" });
    expect(ab.provincialTax).not.toBe(on.provincialTax);
  });

  it("Quebec applies the 16.5% federal abatement (lower federal than ON)", () => {
    const monthly = 90000 / 12;
    const on = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, province: "ON" });
    const qc = computeCraLine({ grossPeriod: monthly, periodsPerYear: 12, province: "QC" });
    expect(qc.federalTax).toBeLessThan(on.federalTax);
    expect(Math.abs(qc.federalTax - on.federalTax * (1 - 0.165))).toBeLessThan(0.5);
  });
});
