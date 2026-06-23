/**
 * LEARNING CORE — pure helpers for the agent learning loop (unit-tested).
 * Picks which remembered lessons are relevant to the active agent and formats
 * them into a compact block injected into that agent's context.
 */
export interface Lesson {
  scope: string;            // agent key (fig/sage/…) or "all"
  lesson: string;
  clientName?: string | null;
  createdAt?: number | Date | null;
}

function ms(d: number | Date | null | undefined): number {
  if (d == null) return 0;
  const t = d instanceof Date ? d.getTime() : Number(d);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Choose lessons that apply to `agent`: its own scope + team-wide ("all"),
 * most recent first, capped to `limit` to control context size.
 */
export function selectRelevant(all: Lesson[], agent: string, limit = 15): Lesson[] {
  return all
    .filter((l) => l.scope === agent || l.scope === "all")
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
    .slice(0, limit);
}

/** Format selected lessons into the prompt block (empty string if none). */
export function formatLessonsBlock(lessons: Lesson[]): string {
  if (!lessons.length) return "";
  const lines = lessons.map((l) => `- ${l.lesson}${l.clientName ? ` [${l.clientName}]` : ""}`);
  return [
    "=== REMEMBERED (confirmed by Markie — apply these, they override defaults) ===",
    ...lines,
  ].join("\n");
}
