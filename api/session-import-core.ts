/**
 * SESSION IMPORT CORE — turn a pasted "Session Close Package" into structured,
 * numberable knowledge assets. Pure + deterministic (no DB, no network, no tokens).
 * =============================================================================
 * Purpose:  Markie runs strategy sessions (with ChatGPT or anyone) that end in a
 *           "Session Close Package". This parses that text into the SAME register
 *           kinds the app already uses (decision/research/system/idea + open
 *           questions), so importing is one paste — not a second doc system.
 * Inputs:   the raw package text.
 * Outputs:  { sessionId, title, summary, items[], openQuestions[] } where each
 *           item = { kind, title, body? } ready for the registers router to number
 *           (DEC/RES/SYS/IDE…) and mirror to the Brain.
 * Errors:   never throws — unrecognized text yields an empty-ish result the caller
 *           can preview before committing (human gate).
 * Limitation: heuristic section parsing tuned to the common package shape; the
 *           PREVIEW step lets Markie see/adjust before anything is written.
 * =============================================================================
 */

export type RegisterKind = "decision" | "research" | "system" | "client_process" | "idea" | "lesson" | "improvement" | "prompt";

export interface SessionItem { kind: RegisterKind; title: string; body?: string; }
export interface ParsedSession {
  sessionId: string | null;
  title: string;
  summary: string;
  items: SessionItem[];
  openQuestions: string[];
}

/** Known section headers → how to treat their content. Order ~ as they appear. */
const SECTIONS: { re: RegExp; kind: RegisterKind | "open_questions" | "summary" | "skip"; numbered?: boolean }[] = [
  { re: /^executive summary/i, kind: "summary" },
  { re: /^(major )?decisions?\b/i, kind: "decision" },
  { re: /^business structure/i, kind: "decision" },
  { re: /^strategic breakthroughs?/i, kind: "idea", numbered: true },
  { re: /^business philosophy/i, kind: "decision" },
  { re: /^pricing philosophy/i, kind: "decision" },
  { re: /^new standards?/i, kind: "system" },
  { re: /^new kpis?/i, kind: "system" },
  { re: /^new project/i, kind: "idea" },
  { re: /^(future )?research( projects?)?/i, kind: "research" },
  { re: /^open questions?/i, kind: "open_questions" },
  // skipped (operational / narrative, not knowledge assets):
  { re: /^ai team/i, kind: "skip" },
  { re: /^immediate priorities/i, kind: "skip" },
  { re: /^changelog/i, kind: "skip" },
  { re: /^closing observation/i, kind: "skip" },
  { re: /^strategic breakthroughs?$/i, kind: "idea", numbered: true },
];

const clean = (s: string) => s.replace(/^[\s\-•*–—]+/, "").replace(/[\s:]+$/, "").trim();
const isBlank = (s: string) => !s.trim();

/** A line that looks like a section header we recognize. */
function matchSection(line: string): (typeof SECTIONS)[number] | null {
  const t = clean(line);
  if (t.length > 60) return null; // headers are short
  for (const s of SECTIONS) if (s.re.test(t)) return s;
  return null;
}

const isBullet = (line: string) => /^[\s]*[-•*–]\s+/.test(line);
const numberedStart = (line: string) => /^[\s]*\d+\.\s+/.test(line);

/** Pull simple bullet items from a block of lines. */
function extractBullets(lines: string[]): SessionItem[] {
  const out: SessionItem[] = [];
  for (const line of lines) {
    if (isBlank(line)) continue;
    const t = clean(line);
    if (!t || /:$/.test(line.trim())) continue;           // skip "Potential services include:"
    if (t.length < 3) continue;
    out.push({ kind: "idea", title: t.slice(0, 200) });   // kind set by caller
  }
  return out;
}

/** Pull numbered items (title line + following body) from a block. */
function extractNumbered(lines: string[]): SessionItem[] {
  const out: SessionItem[] = [];
  let cur: SessionItem | null = null;
  const body: string[] = [];
  const flush = () => { if (cur) { cur.body = body.filter(Boolean).join(" ").slice(0, 1500) || undefined; out.push(cur); } body.length = 0; };
  for (const line of lines) {
    if (numberedStart(line)) {
      flush();
      cur = { kind: "idea", title: clean(line.replace(/^\s*\d+\.\s+/, "")).slice(0, 200) };
    } else if (cur && !isBlank(line)) {
      const t = clean(line);
      if (t && !/:$/.test(line.trim())) body.push(t);
    }
  }
  flush();
  return out.length ? out : extractBullets(lines); // fall back if not actually numbered
}

export function parseSessionPackage(text: string): ParsedSession {
  const raw = (text || "").replace(/\r/g, "");
  const lines = raw.split("\n");

  // session id + title
  const idMatch = raw.match(/\bSES-\d{4}-\d{2}-\d{2}-\d+\b/) || raw.match(/Session ID:\s*([^\s]+)/i);
  const sessionId = idMatch ? (idMatch[0].startsWith("SES-") ? idMatch[0] : idMatch[1]) : null;

  // walk into sections
  const items: SessionItem[] = [];
  const openQuestions: string[] = [];
  let summary = "";
  let current: (typeof SECTIONS)[number] | null = null;
  let block: string[] = [];

  const commit = () => {
    if (!current || !block.length) { block = []; return; }
    if (current.kind === "summary") {
      summary = block.map((l) => clean(l)).filter(Boolean).join(" ").slice(0, 1200);
    } else if (current.kind === "open_questions") {
      for (const it of extractBullets(block)) openQuestions.push(it.title);
    } else if (current.kind !== "skip") {
      const found = current.numbered ? extractNumbered(block) : extractBullets(block);
      for (const it of found) items.push({ ...it, kind: current.kind as RegisterKind });
    }
    block = [];
  };

  for (const line of lines) {
    const sec = matchSection(line);
    if (sec) { commit(); current = sec; continue; }
    if (current) block.push(line);
  }
  commit();

  // title: first non-empty line that isn't the boilerplate header
  let title = "";
  for (const l of lines) {
    const t = clean(l);
    if (t && !/^session (close package|id)/i.test(t) && !/^status:/i.test(t) && !/^prepared by/i.test(t)) { title = t.slice(0, 160); break; }
  }
  if (!title) title = sessionId ? `Session ${sessionId}` : "Imported session";

  // de-dup items by normalized title
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const k = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });

  return { sessionId, title, summary, items: deduped, openQuestions };
}
