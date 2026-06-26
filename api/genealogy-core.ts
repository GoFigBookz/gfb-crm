/**
 * GENEALOGY CORE — pure logic for the Phoenix Rising family tree.
 * =============================================================================
 * Purpose:  The accuracy + tree-shape brain behind Markie's legacy family tree
 *           (the "extension of Heritage" he'll pass to his daughter). No DB, no
 *           network — just deterministic, testable helpers:
 *             - proof level <-> confidence% mapping (so every fact carries an
 *               honest "how sure are we" rating — Markie's hard requirement).
 *             - person de-duplication (don't add a relative we already have).
 *             - tree grouping by generation for display + the public share page.
 *             - the monthly web-scan prompt builder + defensive JSON parser.
 *             - overall "tree verified %" headline.
 * Inputs:   plain member rows ({name, birthDate, deathDate, proofLevel,
 *           confidence, fatherId, motherId, generation, side, ...}).
 * Outputs:  pure values — grouped tree, dedupe verdicts, scan prompts, parsed
 *           findings. The router/scanner wire these to the DB + Anthropic.
 * Errors:   parseScanFindings never throws — bad/garbage model output -> [].
 * Limitation: confidence is an HONEST ESTIMATE, never a guarantee. Web/tree
 *           clues default LOW; only record-backed facts earn "proven".
 * =============================================================================
 */

export type ProofLevel = "proven" | "likely" | "clue" | "wall";

export interface ProofMeta {
  level: ProofLevel;
  label: string;
  emoji: string;
  /** tailwind-ish token used by both the app card and the share page. */
  color: string;
  /** confidence assigned when a level is chosen without an explicit number. */
  defaultConfidence: number;
}

export const PROOF_META: Record<ProofLevel, ProofMeta> = {
  proven: { level: "proven", label: "Verified by record", emoji: "✅", color: "emerald", defaultConfidence: 98 },
  likely: { level: "likely", label: "Likely — strong but incomplete", emoji: "🟡", color: "amber", defaultConfidence: 80 },
  clue:   { level: "clue",   label: "Tree clue — needs proof", emoji: "🔍", color: "sky", defaultConfidence: 55 },
  wall:   { level: "wall",   label: "Brick wall — unproven", emoji: "🧱", color: "rose", defaultConfidence: 20 },
};

export const PROOF_ORDER: ProofLevel[] = ["proven", "likely", "clue", "wall"];

/** Clamp + round a confidence value into 0..100. */
export function clampConfidence(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/** A confidence% -> the proof bucket it falls in (used when only % is known). */
export function confidenceToProof(n: number): ProofLevel {
  const c = clampConfidence(n);
  if (c >= 95) return "proven";
  if (c >= 70) return "likely";
  if (c >= 40) return "clue";
  return "wall";
}

/** Resolve a (level?, confidence?) pair into a consistent {level, confidence}. */
export function resolveProof(level?: string | null, confidence?: number | null): { level: ProofLevel; confidence: number } {
  const lvl = (level && (PROOF_META as any)[level]) ? (level as ProofLevel) : null;
  if (lvl && (confidence == null || !Number.isFinite(Number(confidence)))) {
    return { level: lvl, confidence: PROOF_META[lvl].defaultConfidence };
  }
  if (confidence != null && Number.isFinite(Number(confidence))) {
    const c = clampConfidence(confidence);
    return { level: lvl ?? confidenceToProof(c), confidence: c };
  }
  return { level: "clue", confidence: PROOF_META.clue.defaultConfidence };
}

// ───────────────────────── person identity ─────────────────────────

export function normalizeName(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/['’.]/g, "")              // O'Brien -> obrien, St. -> st (don't split on these)
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First 4-digit year found in a free-text date, or null. */
export function approxYear(s: string | null | undefined): number | null {
  const m = String(s || "").match(/\b(1[5-9]\d\d|20\d\d)\b/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Are two people plausibly the SAME person? Conservative: names must match (or
 * one be a clear subset, e.g. "John Walsh" vs "John Louis Walsh"), AND birth
 * years must be within 3 (when both known). Used to avoid duplicate relatives.
 */
export function samePerson(
  a: { name?: string | null; birthDate?: string | null },
  b: { name?: string | null; birthDate?: string | null },
): boolean {
  const na = normalizeName(a.name), nb = normalizeName(b.name);
  if (!na || !nb) return false;
  const ta = na.split(" "), tb = nb.split(" ");
  const subset = ta.every((t) => tb.includes(t)) || tb.every((t) => ta.includes(t));
  // require at least first + last token overlap, not just a single common token
  const firstLastMatch = ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
  if (!(na === nb || (subset && firstLastMatch))) return false;
  const ya = approxYear(a.birthDate), yb = approxYear(b.birthDate);
  if (ya != null && yb != null) return Math.abs(ya - yb) <= 3;
  return true; // names match strongly, a year is missing -> treat as same
}

/** Find an existing member that matches a finding's subject, or null. */
export function matchExistingMember<T extends { name?: string | null; birthDate?: string | null }>(
  subject: { name?: string | null; birthDate?: string | null },
  members: T[],
): T | null {
  for (const m of members) if (samePerson(subject, m)) return m;
  return null;
}

// ───────────────────────── tree shape ─────────────────────────

const REL_GENERATION: { test: RegExp; gen: number }[] = [
  { test: /\b(self|me)\b/i, gen: 0 },
  { test: /great[-\s]*great[-\s]*grand/i, gen: 4 },
  { test: /great[-\s]*grand/i, gen: 3 },
  { test: /grand(father|mother|parent)/i, gen: 2 },
  { test: /\b(father|mother|mom|dad|parent)\b/i, gen: 1 },
  { test: /\b(sister|brother|sibling|self|spouse|child|son|daughter)\b/i, gen: 0 },
];

/** Best-effort generation for a member: explicit column wins, else infer from relation text. */
export function generationOf(m: { generation?: number | null; relation?: string | null }): number {
  if (m.generation != null && Number.isFinite(Number(m.generation))) return Number(m.generation);
  const rel = m.relation || "";
  for (const r of REL_GENERATION) if (r.test.test(rel)) return r.gen;
  return 99; // "lines / unknown placement" bucket, shown last
}

export const GENERATION_LABEL: Record<number, string> = {
  0: "Markie & immediate family",
  1: "Parents",
  2: "Grandparents",
  3: "Great-grandparents",
  4: "2× great-grandparents",
  5: "3× great-grandparents",
  6: "4× great-grandparents",
  7: "5× great-grandparents",
  8: "6× great-grandparents",
};
export function generationLabel(gen: number): string {
  if (GENERATION_LABEL[gen]) return GENERATION_LABEL[gen];
  if (gen >= 5 && gen <= 12) return `${gen - 2}× great-grandparents`;
  return "Family lines";
}

/** Group members into generation bands for display (ascending; 99 -> "lines"). */
export function groupByGeneration<T extends { generation?: number | null; relation?: string | null; name?: string | null }>(
  members: T[],
): { gen: number; label: string; members: T[] }[] {
  const byGen = new Map<number, T[]>();
  for (const m of members) {
    const g = generationOf(m);
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(m);
  }
  return [...byGen.keys()]
    .sort((a, b) => a - b)
    .map((gen) => ({
      gen,
      label: gen === 99 ? "Family lines" : generationLabel(gen),
      members: byGen.get(gen)!.slice().sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name))),
    }));
}

/**
 * Overall "this tree is ~X% verified" headline: confidence-weighted, but counts
 * named people only (lines/placeholders with no dates don't dilute or inflate).
 * Returns 0 when there's nothing meaningful yet.
 */
export function treeAccuracy(members: { confidence?: number | null; birthDate?: string | null; deathDate?: string | null }[]): number {
  const scored = members.filter((m) => m.confidence != null && (m.birthDate || m.deathDate));
  if (!scored.length) return 0;
  const sum = scored.reduce((s, m) => s + clampConfidence(m.confidence), 0);
  return Math.round(sum / scored.length);
}

// ───────────────────────── monthly web scan ─────────────────────────

export interface ScanTarget {
  id?: number;
  name: string;
  birthDate?: string | null;
  deathDate?: string | null;
  birthplace?: string | null;
  relation?: string | null;
  /** what we're missing for this person — drives the research ask. */
  gap: "parents" | "details" | "descendants";
  knownParents?: string | null;
}

/**
 * Pick who to research this month. Priority: brick walls (unknown parents) and
 * the oldest generations, then anyone thin on detail. Bounded so a run is cheap.
 */
export function buildScanTargets<
  T extends { id?: number; name?: string | null; birthDate?: string | null; deathDate?: string | null; birthplace?: string | null; relation?: string | null; proofLevel?: string | null; fatherId?: number | null; motherId?: number | null; generation?: number | null; notes?: string | null },
>(members: T[], limit = 6): ScanTarget[] {
  const named = members.filter((m) => normalizeName(m.name).split(" ").length >= 2);
  const scored = named.map((m) => {
    const noParents = !m.fatherId && !m.motherId;
    const wall = m.proofLevel === "wall";
    const gen = generationOf(m as any);
    // higher score = research first
    let score = gen; // older generations first
    if (wall) score += 10;
    if (noParents) score += 6;
    return { m, score, noParents, gen };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ m, noParents }) => ({
    id: m.id,
    name: m.name || "",
    birthDate: m.birthDate ?? null,
    deathDate: m.deathDate ?? null,
    birthplace: m.birthplace ?? null,
    relation: m.relation ?? null,
    gap: noParents ? "parents" : "details",
    knownParents: null,
  }));
}

export interface RawFinding {
  subjectName: string;
  kind: "new_person" | "new_fact" | "relationship" | "photo" | "source" | "dna";
  claim: string;
  proofLevel: ProofLevel;
  confidence: number;
  sourceType?: string;
  sourceUrl?: string;
  relatedTo?: string;
  birthDate?: string;
  deathDate?: string;
  birthplace?: string;
}

/** System + user prompt for one research target. */
export function buildScanPrompt(target: ScanTarget, context: { surnames: string[]; places: string[] }): { system: string; user: string } {
  const system = [
    "You are a careful, honest genealogy researcher helping build a family tree that will be passed down to a child.",
    "ACCURACY IS EVERYTHING. Never invent people, dates, or relationships. Only report what you can support with a real, citable source (FamilySearch, WikiTree, Find A Grave, Newfoundland Grand Banks, census/parish/cemetery records, published obituaries).",
    "For EVERY finding give an honest confidence 0-100 and a proofLevel: 'proven' (record-backed), 'likely' (strong but incomplete), 'clue' (appears in a tree/index, unproven), 'wall' (still unknown). Web/other-tree material is at most 'clue' unless you cite an actual record.",
    "If you cannot find anything credible, return an empty findings array. Do NOT pad. A small number of well-sourced findings is far better than many guesses.",
    "Return ONLY valid JSON: {\"findings\":[{\"subjectName\",\"kind\",\"claim\",\"proofLevel\",\"confidence\",\"sourceType\",\"sourceUrl\",\"relatedTo\",\"birthDate\",\"deathDate\",\"birthplace\"}]}. kind is one of new_person|new_fact|relationship|photo|source|dna.",
  ].join(" ");
  const ask = target.gap === "parents"
    ? `Find the PARENTS (and any well-sourced earlier ancestors) of this person, plus any newly-evidenced siblings or relatives.`
    : `Find any new, well-sourced facts, relatives, records or photos for this person.`;
  const user = [
    `Research target: ${target.name}.`,
    target.birthDate ? `Born: ${target.birthDate}${target.birthplace ? `, ${target.birthplace}` : ""}.` : "",
    target.deathDate ? `Died: ${target.deathDate}.` : "",
    target.relation ? `Relation to the tree owner: ${target.relation}.` : "",
    `Family surnames in this tree: ${context.surnames.join(", ")}.`,
    `Key family places: ${context.places.join(", ")}.`,
    ask,
    "Return the JSON object now.",
  ].filter(Boolean).join(" ");
  return { system, user };
}

/** Defensive parse of the model's JSON. Never throws; filters to sourced findings. */
export function parseScanFindings(text: string): RawFinding[] {
  if (!text) return [];
  let obj: any = null;
  try {
    const m = text.match(/\{[\s\S]*\}/); // tolerate prose around the JSON
    obj = JSON.parse(m ? m[0] : text);
  } catch {
    return [];
  }
  const arr: any[] = Array.isArray(obj) ? obj : Array.isArray(obj?.findings) ? obj.findings : [];
  const out: RawFinding[] = [];
  for (const f of arr) {
    const subjectName = String(f?.subjectName || f?.name || "").trim();
    const claim = String(f?.claim || "").trim();
    if (!subjectName || !claim) continue;
    const { level, confidence } = resolveProof(f?.proofLevel, f?.confidence);
    const kind = ["new_person", "new_fact", "relationship", "photo", "source", "dna"].includes(f?.kind) ? f.kind : "new_fact";
    out.push({
      subjectName: subjectName.slice(0, 200),
      kind,
      claim: claim.slice(0, 2000),
      proofLevel: level,
      confidence,
      sourceType: f?.sourceType ? String(f.sourceType).slice(0, 120) : undefined,
      sourceUrl: f?.sourceUrl ? String(f.sourceUrl).slice(0, 500) : undefined,
      relatedTo: f?.relatedTo ? String(f.relatedTo).slice(0, 200) : undefined,
      birthDate: f?.birthDate ? String(f.birthDate).slice(0, 60) : undefined,
      deathDate: f?.deathDate ? String(f.deathDate).slice(0, 60) : undefined,
      birthplace: f?.birthplace ? String(f.birthplace).slice(0, 200) : undefined,
    });
  }
  return out;
}

/** YYYY-MM period string for a Date (used to run the scan once per month). */
export function periodKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** A unique, hard-to-guess share token. */
export function makeShareToken(rand: () => string = () => Math.random().toString(36).slice(2)): string {
  return `fam_${rand()}${rand()}`.replace(/[^a-z0-9_]/gi, "").slice(0, 40);
}
