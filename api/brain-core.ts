/**
 * FIGGY AI BRAIN — pure reasoning core (no DB, no I/O, fully testable).
 * =============================================================================
 * The shared knowledge layer every agent queries. Liv is its voice to Markie.
 * This file is the BRAIN'S DISCIPLINE, encoded as pure functions so it's the same
 * whether storage is SQLite today or Postgres+pgvector tomorrow:
 *
 *   - THREE LAYERS (never a junk drawer):
 *       • truth   — APPROVED facts (client profiles, rules, signed-off SOPs,
 *                   account mappings). Only approved info is truth.
 *       • source  — the raw docs truth is derived from (Drive/PDF/email/Hubdoc).
 *       • memory  — agent observations / preferences / OPEN questions (candidate
 *                   truth, not yet blessed).
 *   - PER-CLIENT ISOLATION enforced in the QUERY, not the prompt: a lookup scoped
 *     to Clark OS can never return Clark CW or personal data.
 *   - CITATIONS on every confident answer (the audit trail).
 *   - NEVER INVENT: if the brain can't answer from truth, it emits a MISSING-INFO
 *     question for Markie instead of guessing. His answer becomes new truth — that
 *     is how the brain learns.
 *
 * Storage + embeddings (pgvector) are a retrieval-QUALITY upgrade UNDER this core;
 * scoring here is lexical so it works today and improves when vectors land.
 * =============================================================================
 */

export type ScopeKind = "client" | "firm" | "personal";
export type Scope = { kind: ScopeKind; clientId?: number };

export type Layer = "truth" | "source" | "memory";
export type RecordStatus = "approved" | "draft" | "superseded";

export type BrainRecord = {
  id: string;
  layer: Layer;
  scope: Scope;
  /** Short label shown in citations, e.g. "Client Profile", "SOP-03". */
  label: string;
  /** The searchable text (statement for truth; body for source/memory). */
  text: string;
  status: RecordStatus;          // only "approved" truth answers confidently
  category?: string;             // e.g. "hst", "coding", "filing"
  sourceLabels?: string[];       // for a truth record: which sources back it
  updatedAt?: number;
};

export type Citation = { label: string; layer: Layer };

export type BrainAnswer = {
  answered: boolean;
  text?: string;                 // the answer (from the top truth record)
  confidence: number;            // 0-100
  citations: Citation[];
  /** When not answered: the question to file to Markie's missing-info queue. */
  missingInfo?: { question: string; scope: Scope; category?: string };
  /** Ranked supporting records (for transparency / the UI). */
  matches: { record: BrainRecord; score: number }[];
};

const STOP = new Set([
  "the", "a", "an", "of", "to", "for", "and", "or", "is", "are", "in", "on", "at",
  "what", "which", "how", "do", "does", "did", "i", "we", "you", "it", "this", "that",
  "with", "by", "from", "be", "as", "should", "need", "needs", "use", "uses",
]);

export function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * Isolation guard — THE boundary. A record is visible to a query only when their
 * scopes match. Client scope must match the exact clientId; firm and personal are
 * their own silos. Personal NEVER mixes with client/firm, and one client never
 * sees another. This is enforced here, not hoped for in a prompt.
 */
export function scopeMatches(recordScope: Scope, queryScope: Scope): boolean {
  if (recordScope.kind !== queryScope.kind) return false;
  if (recordScope.kind === "client") return recordScope.clientId != null && recordScope.clientId === queryScope.clientId;
  return true; // firm↔firm, personal↔personal
}

/** Lexical relevance: how much of the question is covered, weighted toward the
 *  record's TOPIC (its category + label) so an answer matches what's being asked,
 *  not incidental word overlap (e.g. the client's name appearing in both). Records
 *  are already scope-filtered, so client-identity words shouldn't carry the match.
 *  Swappable for vector cosine later without touching callers. */
export function scoreRecord(queryTerms: string[], record: BrainRecord): number {
  if (queryTerms.length === 0) return 0;
  const hay = new Set(tokenize(`${record.label} ${record.text} ${record.category ?? ""}`));
  let hits = 0;
  for (const t of queryTerms) if (hay.has(t)) hits += 1;
  const coverage = hits / queryTerms.length;          // how much of the question is covered
  const categoryHit = record.category ? queryTerms.includes(record.category.toLowerCase()) : false;
  const categoryBonus = categoryHit ? 0.25 : 0;       // the question names this record's topic
  const labelBonus = tokenize(record.label).some((t) => queryTerms.includes(t)) ? 0.15 : 0;
  return Math.min(1, coverage + categoryBonus + labelBonus);
}

/** Rank in-scope records by relevance (highest first). Out-of-scope records are
 *  dropped BEFORE scoring — they can't leak into the result at all. */
export function retrieve(question: string, scope: Scope, records: BrainRecord[], topN = 5): { record: BrainRecord; score: number }[] {
  const terms = tokenize(question);
  return records
    .filter((r) => scopeMatches(r.scope, scope))
    .map((r) => ({ record: r, score: scoreRecord(terms, r) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function formatCitations(matches: { record: BrainRecord }[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const m of matches) {
    const key = `${m.record.layer}:${m.record.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: m.record.label, layer: m.record.layer });
  }
  return out;
}

/**
 * The core decision: answer from APPROVED TRUTH with citations + confidence, OR
 * refuse and file a missing-info question. A confident answer requires a top match
 * that is (a) approved truth and (b) clears the coverage threshold. Anything else —
 * only drafts/memory, weak coverage, or nothing in scope — becomes a question for
 * Markie. The brain never fabricates an answer.
 */
export function answerFromBrain(question: string, scope: Scope, records: BrainRecord[], opts?: { confidentAt?: number; category?: string }): BrainAnswer {
  const confidentAt = opts?.confidentAt ?? 0.55;    // min topical match for an approved-truth answer
  const matches = retrieve(question, scope, records);
  const top = matches[0];
  const truthTop = matches.find((m) => m.record.layer === "truth" && m.record.status === "approved");

  if (truthTop && truthTop.score >= confidentAt) {
    return {
      answered: true,
      text: truthTop.record.text,
      confidence: Math.round(Math.min(99, 50 + truthTop.score * 49)),
      citations: formatCitations(matches.filter((m) => m.score >= confidentAt * 0.6)),
      matches,
    };
  }

  // Not answerable from approved truth → file a question, never guess.
  return {
    answered: false,
    confidence: top ? Math.round(top.score * 40) : 0,   // low, advisory only
    citations: [],
    missingInfo: { question: missingInfoQuestion(question, scope), scope, category: opts?.category },
    matches,
  };
}

/** Turn an unanswerable lookup into a crisp question for Markie's queue. */
export function missingInfoQuestion(question: string, scope: Scope): string {
  const who = scope.kind === "client" ? `client #${scope.clientId}` : scope.kind;
  return `Need confirmation for ${who}: ${question.trim().replace(/\?+$/, "")}? (not yet in the brain — answer to make it truth)`;
}

/** Promote an answered missing-info question into an approved truth record. This
 *  is the learning loop: Markie answers → it becomes truth the brain cites next time. */
export function truthFromAnswer(input: { id: string; scope: Scope; label: string; statement: string; category?: string; sourceLabels?: string[]; at?: number }): BrainRecord {
  return {
    id: input.id,
    layer: "truth",
    scope: input.scope,
    label: input.label,
    text: input.statement,
    status: "approved",
    category: input.category,
    sourceLabels: input.sourceLabels,
    updatedAt: input.at,
  };
}

/** Human-readable one-liner: "HST is quarterly … — Source: Client Profile + SOP-03 (92%)". */
export function renderAnswer(a: BrainAnswer): string {
  if (!a.answered) return `I don't have that in the brain yet — filing a question for you: "${a.missingInfo?.question}"`;
  const src = a.citations.map((c) => c.label).join(" + ") || "—";
  return `${a.text}  — Source: ${src} (${a.confidence}%)`;
}
