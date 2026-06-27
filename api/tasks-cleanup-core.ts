/**
 * TASKS CLEANUP — pure core (Markie 2026-06-27, backlog #49: "review every client,
 * kill duplicates, make tasks make sense").
 * =============================================================================
 * Purpose:  The boot dedupe already collapses EXACT duplicates (same client +
 *           title + due-day) and dead-client tasks are hidden. This finds what
 *           that misses and a human should eyeball: NEAR-duplicates (same client,
 *           similar title, different day), UNDATED tasks (no start/due → never
 *           surface on the calendar), and long-STALE overdue tasks (due months ago,
 *           still open — do it or kill it).
 * Inputs:   tasks [{id, clientId, title, startDate, dueDate, completed, priority}],
 *           nowMs, options (staleDays, similarity threshold).
 * Outputs:  { nearDuplicates: groups, undated, staleOverdue, summary } — a review
 *           list. Pure + deterministic (no DB/network) so it's testable.
 * Limitations: SUGGESTS cleanup; the router applies only what the human ticks.
 *           Completed tasks are ignored (history is preserved).
 * =============================================================================
 */

export interface CleanupTask {
  id: number;
  clientId: number | null;
  clientName?: string | null;
  title: string;
  startDate?: number | Date | null;
  dueDate?: number | Date | null;
  completed?: boolean | null;
  priority?: string | null;
}

export interface DuplicateGroup {
  clientId: number | null;
  clientName?: string | null;
  keepId: number;                 // suggested survivor (earliest-dated / lowest id)
  tasks: Array<{ id: number; title: string; dueDate: number | null }>;
}
export interface CleanupResult {
  nearDuplicates: DuplicateGroup[];
  undated: Array<{ id: number; clientId: number | null; clientName?: string | null; title: string }>;
  staleOverdue: Array<{ id: number; clientId: number | null; clientName?: string | null; title: string; dueDate: number; ageDays: number }>;
  summary: { nearDuplicateGroups: number; nearDuplicateExtra: number; undated: number; staleOverdue: number };
}

const ms = (d: number | Date | null | undefined): number | null => {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : (typeof d === "number" ? d : new Date(d).getTime());
  return Number.isNaN(t) ? null : t;
};

/** Normalize a title to comparable tokens: lowercase, strip dates/years/punctuation. */
function tokens(title: string): Set<string> {
  const clean = (title || "").toLowerCase()
    .replace(/\b20\d{2}\b/g, " ")                     // years
    .replace(/\bq[1-4]\b/g, " ")                      // quarter labels
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ").trim();
  return new Set(clean.split(" ").filter((w) => w.length > 2));
}

/** Jaccard similarity of two token sets (0..1). */
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Analyze open tasks for cleanup. Only PENDING (not completed) tasks are considered.
 *  - nearDuplicates: per client, cluster tasks whose titles are ≥ `threshold` similar
 *    (default 0.6) AND aren't the exact same due-day (the boot dedupe owns those).
 *  - undated: no startDate and no dueDate → invisible on the calendar.
 *  - staleOverdue: dueDate older than `staleDays` (default 120) and still open.
 */
export function analyzeTasks(
  all: CleanupTask[],
  nowMs: number,
  opts?: { staleDays?: number; threshold?: number },
): CleanupResult {
  const staleDays = opts?.staleDays ?? 120;
  const threshold = opts?.threshold ?? 0.6;
  const open = all.filter((t) => !t.completed);

  // --- near-duplicates, per client ---
  const byClient = new Map<string, CleanupTask[]>();
  for (const t of open) {
    const k = String(t.clientId ?? "none");
    if (!byClient.has(k)) byClient.set(k, []);
    byClient.get(k)!.push(t);
  }
  const nearDuplicates: DuplicateGroup[] = [];
  for (const group of byClient.values()) {
    const used = new Set<number>();
    const withTok = group.map((t) => ({ t, tok: tokens(t.title) }));
    for (let i = 0; i < withTok.length; i++) {
      if (used.has(withTok[i].t.id)) continue;
      const cluster = [withTok[i]];
      for (let j = i + 1; j < withTok.length; j++) {
        if (used.has(withTok[j].t.id)) continue;
        if (similarity(withTok[i].tok, withTok[j].tok) >= threshold) cluster.push(withTok[j]);
      }
      if (cluster.length < 2) continue;
      cluster.forEach((c) => used.add(c.t.id));
      // skip clusters that are exactly the same due-day (boot dedupe handles those)
      const days = new Set(cluster.map((c) => { const m = ms(c.t.dueDate); return m == null ? "none" : new Date(m).toISOString().slice(0, 10); }));
      if (days.size <= 1) continue;
      const sorted = cluster.slice().sort((a, b) => (ms(a.t.dueDate) ?? Infinity) - (ms(b.t.dueDate) ?? Infinity) || a.t.id - b.t.id);
      nearDuplicates.push({
        clientId: sorted[0].t.clientId,
        clientName: sorted[0].t.clientName,
        keepId: sorted[0].t.id,
        tasks: sorted.map((c) => ({ id: c.t.id, title: c.t.title, dueDate: ms(c.t.dueDate) })),
      });
    }
  }

  // --- undated ---
  const undated = open
    .filter((t) => ms(t.startDate) == null && ms(t.dueDate) == null)
    .map((t) => ({ id: t.id, clientId: t.clientId, clientName: t.clientName, title: t.title }));

  // --- stale overdue ---
  const staleOverdue = open
    .map((t) => ({ t, due: ms(t.dueDate) }))
    .filter(({ due }) => due != null && (nowMs - due) / 86_400_000 >= staleDays)
    .map(({ t, due }) => ({ id: t.id, clientId: t.clientId, clientName: t.clientName, title: t.title, dueDate: due as number, ageDays: Math.round((nowMs - (due as number)) / 86_400_000) }))
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    nearDuplicates,
    undated,
    staleOverdue,
    summary: {
      nearDuplicateGroups: nearDuplicates.length,
      nearDuplicateExtra: nearDuplicates.reduce((s, g) => s + (g.tasks.length - 1), 0),
      undated: undated.length,
      staleOverdue: staleOverdue.length,
    },
  };
}
