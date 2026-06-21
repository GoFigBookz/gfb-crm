import { describe, it, expect } from "vitest";
import { splitClientName, domainFromWebsite, logoFromWebsite } from "../src/lib/clientName";

describe("domainFromWebsite / logoFromWebsite", () => {
  it("normalizes assorted website inputs to a bare domain", () => {
    expect(domainFromWebsite("https://www.clarkpools.ca")).toBe("clarkpools.ca");
    expect(domainFromWebsite("clarkpools.ca/about")).toBe("clarkpools.ca");
    expect(domainFromWebsite("HTTP://Foo.COM")).toBe("foo.com");
  });
  it("rejects non-domains (no logo to derive)", () => {
    expect(domainFromWebsite("")).toBeNull();
    expect(domainFromWebsite("not a url")).toBeNull();
    expect(domainFromWebsite("localhost")).toBeNull();
    expect(logoFromWebsite("")).toBeNull();
  });
  it("builds a favicon URL from a valid website", () => {
    expect(logoFromWebsite("clarkpools.ca")).toContain("domain=clarkpools.ca");
  });
});

describe("splitClientName (UI two-line client name)", () => {
  it("puts the trade name on top and the numbered entity underneath (stored 'Trade (Numbered)')", () => {
    expect(splitClientName("Sher-E-Punjab (1001196626 Ontario Ltd.)", "1001196626 Ontario Ltd."))
      .toEqual({ primary: "Sher-E-Punjab", secondary: "1001196626 Ontario Ltd." });
  });

  it("is order-agnostic ('Numbered (Trade)' still promotes the trade name)", () => {
    expect(splitClientName("1001196626 Ontario Ltd. (Sher-E-Punjab)"))
      .toEqual({ primary: "Sher-E-Punjab", secondary: "1001196626 Ontario Ltd." });
  });

  it("promotes the trade name from the company field when name is the bare number", () => {
    expect(splitClientName("2303851 Ontario Inc.", "Motion Invest"))
      .toEqual({ primary: "Motion Invest", secondary: "2303851 Ontario Inc." });
  });

  it("leaves a numbered company with no trade name as a single line", () => {
    expect(splitClientName("2303851 Ontario Inc.", "2303851 Ontario Inc."))
      .toEqual({ primary: "2303851 Ontario Inc.", secondary: null });
  });

  it("leaves a plain trade name untouched", () => {
    expect(splitClientName("Clark Pools Owen Sound", "Clark Pools Owen Sound"))
      .toEqual({ primary: "Clark Pools Owen Sound", secondary: null });
    expect(splitClientName("Originality.AI Inc.", ""))
      .toEqual({ primary: "Originality.AI Inc.", secondary: null });
  });

  it("handles empty/missing input", () => {
    expect(splitClientName("", "")).toEqual({ primary: "", secondary: null });
    expect(splitClientName(null, null)).toEqual({ primary: "", secondary: null });
  });
});
