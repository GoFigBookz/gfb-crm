import { describe, it, expect } from "vitest";
import {
  confidenceToProof, resolveProof, clampConfidence, normalizeName, approxYear,
  samePerson, matchExistingMember, generationOf, groupByGeneration, treeAccuracy,
  buildScanTargets, buildScanPrompt, parseScanFindings, periodKey, makeShareToken,
} from "./genealogy-core";

describe("confidence <-> proof", () => {
  it("buckets confidence into proof levels", () => {
    expect(confidenceToProof(99)).toBe("proven");
    expect(confidenceToProof(80)).toBe("likely");
    expect(confidenceToProof(50)).toBe("clue");
    expect(confidenceToProof(10)).toBe("wall");
  });
  it("clamps out-of-range values", () => {
    expect(clampConfidence(150)).toBe(100);
    expect(clampConfidence(-5)).toBe(0);
    expect(clampConfidence("nope")).toBe(0);
  });
  it("resolves a level with no number to its default confidence", () => {
    expect(resolveProof("proven", null)).toEqual({ level: "proven", confidence: 98 });
    expect(resolveProof(null, 55).level).toBe("clue");
    expect(resolveProof(undefined, undefined).level).toBe("clue");
  });
});

describe("person identity", () => {
  it("normalizes names and strips accents/punctuation", () => {
    expect(normalizeName("O'Brien, Mary-Frances")).toBe("obrien mary frances");
  });
  it("pulls a plausible birth year", () => {
    expect(approxYear("3 SEP 1851, St. Marys Bay")).toBe(1851);
    expect(approxYear("abt 1846")).toBe(1846);
    expect(approxYear("no year here")).toBeNull();
  });
  it("treats a name subset with matching first+last as the same person", () => {
    expect(samePerson({ name: "John Walsh", birthDate: "1782" }, { name: "John Louis Walsh", birthDate: "5 Dec 1782" })).toBe(true);
  });
  it("rejects different people and far-apart birth years", () => {
    expect(samePerson({ name: "John Walsh", birthDate: "1782" }, { name: "John Walsh", birthDate: "1860" })).toBe(false);
    expect(samePerson({ name: "Mary Dobbin" }, { name: "Mary Downey" })).toBe(false);
  });
  it("finds an existing member match", () => {
    const members = [{ name: "Louise M. Walsh", birthDate: "23 Apr 1915" }, { name: "David Walsh", birthDate: "1889" }];
    expect(matchExistingMember({ name: "Louise Walsh", birthDate: "1915" }, members)?.name).toBe("Louise M. Walsh");
    expect(matchExistingMember({ name: "Nobody Here" }, members)).toBeNull();
  });
});

describe("tree shape", () => {
  const members = [
    { name: "Olivera Antle", relation: "Mother", generation: 1, confidence: 80, birthDate: "1949" },
    { name: "Louise M. Walsh", relation: "Grandmother (maternal)", generation: 2, confidence: 90, birthDate: "1915", deathDate: "1989" },
    { name: "Thomas Patrick Antle", relation: "Great-grandfather", generation: 3, proofLevel: "wall", confidence: 30, birthDate: "1872" },
    { name: "Walsh (maternal line)", relation: "line", confidence: null as any },
  ];
  it("derives generation from column then relation text", () => {
    expect(generationOf({ generation: 2 })).toBe(2);
    expect(generationOf({ relation: "Great-grandmother" })).toBe(3);
    expect(generationOf({ relation: "Father" })).toBe(1);
    expect(generationOf({ relation: "some line" })).toBe(99);
  });
  it("groups members into ordered generation bands", () => {
    const groups = groupByGeneration(members);
    expect(groups[0].gen).toBe(1);
    expect(groups[groups.length - 1].gen).toBe(99); // lines last
    expect(groups.find((g) => g.gen === 3)?.label).toContain("Great-grandparents");
  });
  it("computes a confidence-weighted tree accuracy, ignoring undated lines", () => {
    expect(treeAccuracy(members)).toBe(Math.round((80 + 90 + 30) / 3));
    expect(treeAccuracy([])).toBe(0);
  });
});

describe("monthly scan", () => {
  const members = [
    { id: 1, name: "Thomas Patrick Antle", relation: "Great-grandfather", generation: 3, proofLevel: "wall", birthDate: "1872", fatherId: null, motherId: null },
    { id: 2, name: "Olivera Antle", relation: "Mother", generation: 1, fatherId: 5, motherId: 6, birthDate: "1949" },
    { id: 3, name: "John Walsh", relation: "5x great-grandparent", generation: 7, fatherId: null, motherId: null, birthDate: "1760" },
  ];
  it("prioritizes brick walls and oldest generations as scan targets", () => {
    const targets = buildScanTargets(members, 2);
    const names = targets.map((t) => t.name);
    expect(names).toContain("Thomas Patrick Antle"); // wall + no parents
    expect(targets.find((t) => t.name === "Thomas Patrick Antle")?.gap).toBe("parents");
  });
  it("builds a prompt that demands sources + honest confidence", () => {
    const { system, user } = buildScanPrompt(
      { name: "Thomas Patrick Antle", gap: "parents", birthDate: "1872", birthplace: "Brigus, NL" },
      { surnames: ["Antle", "Walsh"], places: ["Fleur de Lys"] },
    );
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/proofLevel/);
    expect(user).toMatch(/PARENTS/);
    expect(user).toMatch(/Antle, Walsh/);
  });
  it("parses model JSON defensively and keeps only named+claimed findings", () => {
    const text = `Here you go: {"findings":[
      {"subjectName":"Patrick Antle Sr.","kind":"new_person","claim":"Possible father of Thomas Patrick Antle","proofLevel":"clue","confidence":45,"sourceType":"FamilySearch","sourceUrl":"https://familysearch.org/x"},
      {"subjectName":"","claim":"missing name - dropped"},
      {"claim":"no subject - dropped"}
    ]}`;
    const findings = parseScanFindings(text);
    expect(findings).toHaveLength(1);
    expect(findings[0].subjectName).toBe("Patrick Antle Sr.");
    expect(findings[0].proofLevel).toBe("clue");
  });
  it("returns [] for garbage output instead of throwing", () => {
    expect(parseScanFindings("the model said no")).toEqual([]);
    expect(parseScanFindings("")).toEqual([]);
  });
  it("makes a stable monthly period key", () => {
    expect(periodKey(new Date("2026-06-28T00:00:00Z"))).toBe("2026-06");
  });
  it("makes a usable share token", () => {
    const t = makeShareToken(() => "abc123");
    expect(t.startsWith("fam_")).toBe(true);
    expect(t.length).toBeGreaterThan(8);
  });
});
