import { describe, it, expect } from "vitest";
import { skillFor } from "./agent-skills";
import { frontDeskSystem } from "./assistant-core";

describe("agent skill packs", () => {
  it("every agent carries the research/double-check discipline", () => {
    for (const a of ["fig", "sage", "wren", "liv", "jinx", "tess", "jade", "skye"]) {
      const s = skillFor(a);
      expect(s).toMatch(/RESEARCH/);
      expect(s).toMatch(/DOUBLE-CHECK/);
    }
  });

  it("Tess carries real T2 expertise + intake questions", () => {
    const s = skillFor("tess");
    expect(s).toContain("T2");
    expect(s).toMatch(/SBD|small business/i);
    expect(s).toMatch(/INTAKE QUESTIONS/i);
    expect(s).toMatch(/capital dividend account/i);
  });

  it("Skye carries platform + content + intake guidance", () => {
    const s = skillFor("skye");
    expect(s).toMatch(/LinkedIn/);
    expect(s).toMatch(/INTAKE QUESTIONS/i);
    expect(s).toMatch(/CONTENT PILLARS/i);
    expect(s).toMatch(/call-to-action|CTA/i);
  });

  it("book-touching agents get the full QBO playbook (US + Canada)", () => {
    for (const a of ["fig", "sage", "wren", "tess", "jade"]) {
      const s = skillFor(a);
      expect(s).toMatch(/QUICKBOOKS ONLINE/i);
      expect(s).toMatch(/Canada/);
      expect(s).toMatch(/USA|United States|US specifics/);
      expect(s).toMatch(/sales tax|HST|GST/i);
    }
  });

  it("non-book agents get the short QBO pointer, not the full manual", () => {
    for (const a of ["liv", "jinx", "skye"]) {
      const s = skillFor(a);
      expect(s).not.toMatch(/QUICKBOOKS ONLINE — FULL PLAYBOOK/);
      expect(s).toMatch(/QUICKBOOKS:/); // the pointer line
    }
  });

  it("returns empty for an unknown agent", () => {
    expect(skillFor("nobody")).toBe("");
  });

  it("frontDeskSystem injects the active agent's pack", () => {
    expect(frontDeskSystem("tess")).toContain("YOUR SKILL PACK");
    expect(frontDeskSystem("tess")).toContain("T2");
  });
});
