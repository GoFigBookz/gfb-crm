import { describe, it, expect } from "vitest";
import { selectRelevant, formatLessonsBlock, type Lesson } from "./learning-core";

describe("selectRelevant", () => {
  const all: Lesson[] = [
    { scope: "fig", lesson: "Code Walker to Parts/Goods COGS", createdAt: 5 },
    { scope: "all", lesson: "Originality is the only share-bonus client", createdAt: 10 },
    { scope: "sage", lesson: "Clark CW uses non-standard tax codes", createdAt: 8 },
    { scope: "fig", lesson: "Sunbelt is equipment rental → equipment", createdAt: 3 },
  ];

  it("includes the agent's own scope + team-wide, most recent first", () => {
    const r = selectRelevant(all, "fig");
    expect(r.map((l) => l.lesson)).toEqual([
      "Originality is the only share-bonus client", // all, newest
      "Code Walker to Parts/Goods COGS",            // fig
      "Sunbelt is equipment rental → equipment",    // fig
    ]);
    // sage-only lesson excluded for fig
    expect(r.find((l) => l.lesson.includes("Clark CW"))).toBeUndefined();
  });

  it("caps to the limit", () => {
    expect(selectRelevant(all, "fig", 1)).toHaveLength(1);
  });
});

describe("formatLessonsBlock", () => {
  it("formats lessons with client tags, empty when none", () => {
    expect(formatLessonsBlock([])).toBe("");
    const b = formatLessonsBlock([{ scope: "all", lesson: "Do X", clientName: "Clark OS" }]);
    expect(b).toContain("REMEMBERED");
    expect(b).toContain("- Do X [Clark OS]");
  });
});
