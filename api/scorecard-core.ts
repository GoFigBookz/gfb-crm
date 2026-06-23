/**
 * AGENT SCORECARD CORE — Jinx's measurable quality signal (pure, testable).
 * =============================================================================
 * Best practice (2026): you can't improve what you don't measure. The real
 * accuracy signal we already have is the REVIEW outcome on each agent's
 * proposals (triage findings): approved = the human accepted it, dismissed =
 * the human rejected it. Acceptance rate = how often the agent is right.
 * This file turns raw finding rows → a per-agent scorecard with a drift trend.
 * No I/O so it's fully unit-tested.
 * =============================================================================
 */

export interface FindingRow {
  agentName: string | null;
  status: string | null;        // "new" | "approved" | "dismissed" | "awaiting_client"
  confidence: number | null;    // stored 0-1 or 0-100 — normalized below
  createdAt: number | Date | null;
}

export type Grade = "excellent" | "good" | "watch" | "n/a";
export type Trend = "up" | "down" | "flat" | "n/a";

export interface AgentScore {
  agent: string;
  total: number;
  approved: number;
  dismissed: number;
  pending: number;       // new + awaiting_client
  reviewed: number;      // approved + dismissed
  acceptanceRate: number | null; // % approved of reviewed
  avgConfidence: number | null;  // 0-100
  trend: Trend;          // recent acceptance vs prior period
  grade: Grade;
}

export interface Scorecard {
  agents: AgentScore[];
  overall: { reviewed: number; acceptanceRate: number | null; pending: number };
  ts: string;
}

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function toMs(d: number | Date | null): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : Number(d);
  return Number.isFinite(t) ? t : null;
}

/** Normalize confidence to 0-100 (rows may store 0-1 or 0-100). */
function normConf(c: number | null): number | null {
  if (c == null || !Number.isFinite(c)) return null;
  return c <= 1 ? Math.round(c * 100) : Math.round(c);
}

function gradeFor(acceptance: number | null, reviewed: number): Grade {
  if (acceptance == null || reviewed < 3) return "n/a"; // not enough data to judge
  if (acceptance >= 90) return "excellent";
  if (acceptance >= 75) return "good";
  return "watch";
}

export function scoreAgents(rows: FindingRow[], now: number = Date.now()): Scorecard {
  const byAgent = new Map<string, FindingRow[]>();
  for (const r of rows) {
    const name = (r.agentName ?? "").trim() || "Unknown";
    if (!byAgent.has(name)) byAgent.set(name, []);
    byAgent.get(name)!.push(r);
  }

  const agents: AgentScore[] = [];
  for (const [agent, items] of byAgent) {
    const approved = items.filter((i) => i.status === "approved").length;
    const dismissed = items.filter((i) => i.status === "dismissed").length;
    const pending = items.filter((i) => i.status === "new" || i.status === "awaiting_client").length;
    const reviewed = approved + dismissed;
    const acceptanceRate = reviewed ? Math.round((approved / reviewed) * 100) : null;

    const confs = items.map((i) => normConf(i.confidence)).filter((c): c is number => c != null);
    const avgConfidence = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : null;

    // Drift: compare acceptance in the last 30 days vs before.
    const recent = items.filter((i) => { const t = toMs(i.createdAt); return t != null && now - t <= RECENT_WINDOW_MS; });
    const prior = items.filter((i) => { const t = toMs(i.createdAt); return t != null && now - t > RECENT_WINDOW_MS; });
    const rate = (xs: FindingRow[]) => {
      const a = xs.filter((i) => i.status === "approved").length;
      const d = xs.filter((i) => i.status === "dismissed").length;
      return a + d ? (a / (a + d)) * 100 : null;
    };
    const rRecent = rate(recent), rPrior = rate(prior);
    let trend: Trend = "n/a";
    if (rRecent != null && rPrior != null) {
      trend = rRecent > rPrior + 5 ? "up" : rRecent < rPrior - 5 ? "down" : "flat";
    }

    agents.push({
      agent, total: items.length, approved, dismissed, pending, reviewed,
      acceptanceRate, avgConfidence, trend, grade: gradeFor(acceptanceRate, reviewed),
    });
  }

  // Sort: most-reviewed first (most signal), then by name.
  agents.sort((a, b) => b.reviewed - a.reviewed || a.agent.localeCompare(b.agent));

  const totReviewed = agents.reduce((s, a) => s + a.reviewed, 0);
  const totApproved = agents.reduce((s, a) => s + a.approved, 0);
  const totPending = agents.reduce((s, a) => s + a.pending, 0);

  return {
    agents,
    overall: {
      reviewed: totReviewed,
      acceptanceRate: totReviewed ? Math.round((totApproved / totReviewed) * 100) : null,
      pending: totPending,
    },
    ts: new Date(now).toISOString(),
  };
}
