import { describe, it, expect } from "vitest";
import { parseSessionPackage } from "./session-import-core";

const PKG = `SESSION CLOSE PACKAGE

Session ID: SES-2026-06-26-001
Status: CLOSED
Prepared By: Finn

Executive Summary

Today's session shifted GoFIG toward an advisory practice. Innovation Finance will be incubated inside Launchpad.

Major Decisions

Business Structure

- Continue operating under the existing numbered Canadian corporation.
- No additional corporation, trade name, or bank account at this stage.
- Phoenix Rising remains exclusively Markie's personal ecosystem.

Strategic Breakthroughs

1. Innovation Finance

New strategic service line developed within Launchpad.

Potential services include:

- Grant readiness
- SR&ED readiness

2. Business Philosophy

The business is designed around Markie's desired lifestyle. Every opportunity must pass the Markie Filter.

New Standards

- Sessions are not final until Markie explicitly closes them.

Future Research Projects

- Canadian grants database
- SR&ED knowledge system
- Pricing optimization for GoFIG

Open Questions

- Final public brand name for Innovation Finance.
- Long-term branding strategy.

Changelog

- Renamed Claude to Cody.
`;

describe("parseSessionPackage", () => {
  const p = parseSessionPackage(PKG);

  it("pulls the session id", () => {
    expect(p.sessionId).toBe("SES-2026-06-26-001");
  });
  it("captures an executive summary", () => {
    expect(p.summary).toMatch(/advisory practice/i);
  });
  it("maps business-structure bullets to decisions", () => {
    const decisions = p.items.filter((i) => i.kind === "decision").map((i) => i.title);
    expect(decisions.some((t) => /numbered Canadian corporation/i.test(t))).toBe(true);
    expect(decisions.some((t) => /Phoenix Rising remains/i.test(t))).toBe(true);
  });
  it("maps numbered strategic breakthroughs to ideas with bodies", () => {
    const ideas = p.items.filter((i) => i.kind === "idea");
    const innov = ideas.find((i) => /Innovation Finance/i.test(i.title));
    expect(innov).toBeTruthy();
    expect(innov?.body).toMatch(/Grant readiness|service line/i);
  });
  it("maps future research to research items", () => {
    const research = p.items.filter((i) => i.kind === "research").map((i) => i.title);
    expect(research).toContain("Canadian grants database");
    expect(research).toContain("SR&ED knowledge system");
  });
  it("maps new standards to systems", () => {
    expect(p.items.some((i) => i.kind === "system" && /explicitly closes/i.test(i.title))).toBe(true);
  });
  it("collects open questions separately (not as register items)", () => {
    expect(p.openQuestions.some((q) => /public brand name/i.test(q))).toBe(true);
    expect(p.items.some((i) => /public brand name/i.test(i.title))).toBe(false);
  });
  it("skips changelog / AI team / priorities", () => {
    expect(p.items.some((i) => /Renamed Claude/i.test(i.title))).toBe(false);
  });
  it("never throws on junk input", () => {
    expect(() => parseSessionPackage("")).not.toThrow();
    expect(parseSessionPackage("just some text").items).toEqual([]);
  });
});
