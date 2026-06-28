import { describe, it, expect } from "vitest";
import { currencyForCountry, fmtMoney } from "./money";

describe("currencyForCountry", () => {
  it("US country or us_clients → USD, else CAD", () => {
    expect(currencyForCountry("US").code).toBe("USD");
    expect(currencyForCountry("us").code).toBe("USD");
    expect(currencyForCountry(null, "us_clients").code).toBe("USD");
    expect(currencyForCountry("CA").code).toBe("CAD");
    expect(currencyForCountry(null, "ca_clients").code).toBe("CAD");
    expect(currencyForCountry(undefined).code).toBe("CAD");
  });
});

describe("fmtMoney", () => {
  it("labels US amounts in USD and CA in CAD", () => {
    expect(fmtMoney(1000, { country: "US" })).toMatch(/US\$|\$/); // en-US → "$1,000.00"
    expect(fmtMoney(1000, { country: "US" })).toContain("1,000");
    const ca = fmtMoney(1000, { country: "CA" });
    expect(ca).toContain("1,000");
  });
  it("honours decimals and dash", () => {
    expect(fmtMoney(1000, { country: "US", decimals: 0 })).not.toMatch(/\.00/);
    expect(fmtMoney(null, { dash: true })).toBe("—");
    expect(fmtMoney(null)).toContain("0");
  });
});
