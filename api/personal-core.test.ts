import { describe, it, expect } from "vitest";
import { normalizeCategory, selectPersonalFacts, buildPersonalContext, splitDump, PERSONAL_CATEGORIES } from "./personal-core";

describe("personal-core — categories", () => {
  it("keeps canonical categories", () => {
    for (const c of PERSONAL_CATEGORIES) expect(normalizeCategory(c)).toBe(c);
  });
  it("maps aliases to canonical buckets", () => {
    expect(normalizeCategory("Family")).toBe("people");
    expect(normalizeCategory("birthday")).toBe("important_dates");
    expect(normalizeCategory("my car")).toBe("vehicles");
    expect(normalizeCategory("netflix login")).toBe("accounts");
    expect(normalizeCategory("")).toBe("misc");
    expect(normalizeCategory("something weird")).toBe("misc");
  });
});

describe("personal-core — fact selection", () => {
  it("pinned first, then most recent, capped", () => {
    const facts = [
      { category: "misc", fact: "old", createdAt: 1 },
      { category: "misc", fact: "new", createdAt: 100 },
      { category: "misc", fact: "pinned-old", pinned: true, createdAt: 2 },
    ];
    const picked = selectPersonalFacts(facts, 2);
    expect(picked[0].fact).toBe("pinned-old");
    expect(picked[1].fact).toBe("new");
    expect(picked.length).toBe(2);
  });
});

describe("personal-core — context block (Liv only)", () => {
  it("empty when nothing", () => {
    expect(buildPersonalContext([], [])).toBe("");
  });
  it("groups facts by category and lists open items, with the privacy header", () => {
    const block = buildPersonalContext(
      [
        { category: "people", fact: "Wife: Sarah" },
        { category: "vehicles", fact: "F-150, plate ABCD" },
        { category: "people", fact: "★pinnedkid", pinned: true },
      ],
      [
        { kind: "task", title: "Renew passport", dueDate: new Date("2026-08-01") },
        { kind: "note", title: "ignore me (note)" },
        { kind: "task", title: "done one", done: true },
      ],
    );
    expect(block).toContain("PRIVATE");
    expect(block).toContain("People:");
    expect(block).toContain("Wife: Sarah");
    expect(block).toContain("Vehicles:");
    expect(block).toContain("Open personal items:");
    expect(block).toContain("Renew passport");
    expect(block).not.toContain("ignore me");   // notes excluded from open items
    expect(block).not.toContain("done one");     // done excluded
  });
});

describe("personal-core — dump splitter", () => {
  it("splits lines, strips bullets, drops blanks", () => {
    expect(splitDump("- Wife: Sarah\n* Dog: Rex\n\n  • Car: F-150\nx")).toEqual([
      "Wife: Sarah", "Dog: Rex", "Car: F-150",
    ]);
  });
});
