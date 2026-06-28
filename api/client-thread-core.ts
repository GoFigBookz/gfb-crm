/**
 * CLIENT TEAM THREAD — pure summary helpers.
 * =============================================================================
 * A per-client internal conversation between staff (Markie ↔ Rachel ↔ agents) —
 * status notes + questions like "want me to reclass these transactions?" This
 * replaces the WhatsApp back-and-forth now that the bookkeeper is a CRM user.
 * This file just summarizes a thread (open questions, latest activity) for the
 * Needs-Attention banner and the "where's she at" glance; the router does I/O.
 *
 * Inputs:  thread notes (body + isQuestion + resolved + createdAt).
 * Outputs: { total, openQuestions, lastNote, openList }.
 * Errors:  pure — tolerant of missing fields / mixed date types.
 * =============================================================================
 */
export interface ThreadNote {
  id?: number;
  authorName?: string | null;
  body: string;
  isQuestion?: boolean | null;
  resolved?: boolean | null;
  createdAt?: number | string | Date | null;
}

function ts(n: ThreadNote): number {
  const v = n.createdAt;
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const t = new Date(v as any).getTime();
  return Number.isFinite(t) ? t : 0;
}

export interface ThreadSummary {
  total: number;
  openQuestions: number;
  lastNote: ThreadNote | null;
  openList: ThreadNote[];
}

export function summarizeThread(notes: ThreadNote[]): ThreadSummary {
  const all = notes || [];
  const open = all.filter((n) => n.isQuestion && !n.resolved);
  const sorted = [...all].sort((a, b) => ts(b) - ts(a));
  return {
    total: all.length,
    openQuestions: open.length,
    lastNote: sorted[0] || null,
    openList: [...open].sort((a, b) => ts(b) - ts(a)),
  };
}
