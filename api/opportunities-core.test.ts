import { describe, it, expect } from "vitest";
import {
  buildSearchPrompt, parseOpportunities, extractJsonArray, dedupeAgainst,
  normalizeProvince, OPP_CATEGORIES,
} from "./opportunities-core";

describe("opportunities-core", () => {
  it("normalizes province names + codes", () => {
    expect(normalizeProvince("Ontario")).toBe("ON");
    expect(normalizeProvince("on")).toBe("ON");
    expect(normalizeProvince(null)).toBeNull();
  });

  it("builds a profile-tailored grants prompt", () => {
    const { system, user } = buildSearchPrompt({ name: "Acme Co", province: "Ontario", industry: "construction", employees: 12, hasWSIB: true }, "grants");
    expect(system).toContain("construction");
    expect(system).toContain("ON, Canada");
    expect(system).toContain("12 employee");
    expect(system).toContain("WSIB-registered");
    expect(system).toContain("JSON array");
    expect(user).toContain("Acme Co");
  });

  it("folds the card preference into the credit-card prompt", () => {
    const { system } = buildSearchPrompt({ name: "Acme", cardPreference: "travel" }, "credit_card");
    expect(system.toLowerCase()).toContain("travel");
    expect(system).toContain("annual fee");
  });

  it("treats the firm specially", () => {
    const { system, user } = buildSearchPrompt({ name: "x", isFirm: true }, "wsib");
    expect(system).toContain("accounting/bookkeeping firm");
    expect(user).toContain("Go Fig Bookz");
  });

  it("extracts a JSON array even with code fences / prose", () => {
    expect(extractJsonArray("Here you go:\n```json\n[{\"a\":1}]\n```")).toEqual([{ a: 1 }]);
    expect(extractJsonArray("no json here")).toEqual([]);
  });

  it("parses + filters opportunities (needs title + http url)", () => {
    const text = JSON.stringify([
      { title: "Canada Digital Adoption", summary: "Grant for tech", estValue: "up to $15,000", eligibility: "SMBs", url: "https://ised.canada.ca/x", source: "ISED" },
      { title: "No link program", summary: "x", url: "" },           // dropped (no url)
      { summary: "no title", url: "https://x.com" },                  // dropped (no title)
    ]);
    const got = parseOpportunities(text, "grants");
    expect(got.length).toBe(1);
    expect(got[0].title).toBe("Canada Digital Adoption");
    expect(got[0].category).toBe("grants");
  });

  it("dedupes new finds against saved ones", () => {
    const found = [
      { title: "A", url: "https://a.com" },
      { title: "B", url: "https://b.com" },
    ];
    const fresh = dedupeAgainst(found, [{ title: "A", url: "https://a.com" }]);
    expect(fresh.map((f) => f.title)).toEqual(["B"]);
  });

  it("has the five categories", () => {
    expect(OPP_CATEGORIES.map((c) => c.key)).toContain("wsib");
    expect(OPP_CATEGORIES.length).toBe(5);
  });
});
