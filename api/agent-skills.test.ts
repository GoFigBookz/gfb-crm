import { describe, it, expect } from "vitest";
import { skillFor } from "./agent-skills";
import { frontDeskSystem } from "./assistant-core";

describe("agent skill packs", () => {
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

  it("returns empty for agents without a pack yet", () => {
    expect(skillFor("liv")).toBe("");
  });

  it("frontDeskSystem injects the skill pack for that agent", () => {
    expect(frontDeskSystem("tess")).toContain("YOUR SKILL PACK");
    expect(frontDeskSystem("tess")).toContain("T2");
    // an agent without a pack doesn't get the skill section
    expect(frontDeskSystem("liv")).not.toContain("YOUR SKILL PACK");
  });
});
