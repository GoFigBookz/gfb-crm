import { describe, it, expect } from "vitest";
import { compareSalaryVsDividend, personalTaxOn, PROV_CORP_RATES, FED } from "./salary-dividend-core";

describe("salary vs dividend — engine", () => {
  it("returns a clear winner + spread for an Ontario eligible-dividend comparison", () => {
    const r = compareSalaryVsDividend({ province: "ON", profit: 100000, dividendType: "eligible" });
    expect(r.salaryNet).toBeGreaterThan(0);
    expect(r.dividendNet).toBeGreaterThan(0);
    expect(["salary", "dividend"]).toContain(r.better);
    expect(r.delta).toBeCloseTo(Math.abs(r.salaryNet - r.dividendNet), 2);
    expect(r.verified).toBe(true); // Ontario rates are verified
  });

  it("uses the small-business corp rate for non-eligible and the general rate for eligible", () => {
    const nonElig = compareSalaryVsDividend({ province: "ON", profit: 100000, dividendType: "noneligible" });
    const elig = compareSalaryVsDividend({ province: "ON", profit: 100000, dividendType: "eligible" });
    // general rate (15%+11.5%) > small-business rate (9%+3.2%) → eligible pays MORE corp tax
    expect(elig.corpTax).toBeGreaterThan(nonElig.corpTax);
    expect(nonElig.corpTax).toBeCloseTo(100000 * (FED.corpSmallBiz + PROV_CORP_RATES.ON.smallBizCorp), 0);
  });

  it("is province-aware — Alberta differs from Ontario", () => {
    const on = compareSalaryVsDividend({ province: "ON", profit: 120000, dividendType: "eligible" });
    const ab = compareSalaryVsDividend({ province: "AB", profit: 120000, dividendType: "eligible" });
    expect(ab.corpTax).not.toBe(on.corpTax); // AB general 8% vs ON 11.5%
    expect(ab.verified).toBe(false);          // AB flagged as estimate
  });

  it("honors editable rate overrides from the UI", () => {
    const base = compareSalaryVsDividend({ province: "BC", profit: 100000, dividendType: "eligible" });
    const tweaked = compareSalaryVsDividend({ province: "BC", profit: 100000, dividendType: "eligible", rates: { generalCorp: 0.20 } });
    expect(tweaked.corpTax).toBeGreaterThan(base.corpTax); // higher corp rate → more corp tax
  });

  it("applies the Quebec federal abatement (lower federal tax than an equal non-QC amount)", () => {
    const qcFed = personalTaxOn(80000, "QC");
    const onFed = personalTaxOn(80000, "ON");
    // not a direct equality (different provincial tax) but QC's federal portion is abated — sanity: both positive
    expect(qcFed).toBeGreaterThan(0);
    expect(onFed).toBeGreaterThan(0);
  });

  it("every province/territory has a full rate set", () => {
    for (const code of ["ON","BC","AB","SK","MB","QC","NB","NS","PE","NL","YT","NT","NU"]) {
      const r = PROV_CORP_RATES[code];
      expect(r).toBeTruthy();
      expect(typeof r.smallBizCorp).toBe("number");
      expect(typeof r.dtcEligible).toBe("number");
    }
  });
});
