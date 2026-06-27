/**
 * EXECUTIVE BRIEFING — Liv's Chief-of-Staff daily digest (Markie 2026-06-27, Finn's
 * architecture: "one executive briefing instead of dozens of notifications").
 * =============================================================================
 * Purpose:  Liv (now EA + Chief of Staff) orchestrates across the team and delivers
 *           ONE concise digest: what needs Markie, what's behind, what's due, what
 *           the team learned, and the top thing to approve next. Replaces scattered
 *           per-agent pings. Reads existing app state — no premium AI call (free).
 * Inputs:   userId (Markie). Reads tasks + agent_learnings (defensive per-section).
 * Outputs:  a structured briefing object + a short markdown render for chat/UI.
 * Limitations: scheduled PUSH needs an email/SMS channel (Liv drafts, never auto-
 *           sends) — for now the digest is on-demand ("brief me") + on the Dashboard.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { tasks, clients, agentLearnings } from "../db/schema";
import { and, eq, or, lt, gte, lte, desc, sql } from "drizzle-orm";

export interface BriefItem { id?: number; title: string; client?: string | null; due?: string | null; tag?: string | null; }
export interface ExecBriefing {
  date: string;
  needsYou: BriefItem[];      // approvals / credentials / decisions only Markie can do
  behind: { count: number; top: BriefItem[] };      // overdue
  dueToday: { count: number; top: BriefItem[] };
  learned: string[];          // what the team learned recently (confirmed lessons)
  headline: string;           // one-line summary
}

const dayStr = (d: any): string | null => {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
};
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

/** Heuristic: does this task need MARKIE specifically (approval / credential / decision)? */
const NEEDS_MARKIE = /\bmarkie\b|needs? markie|approve|sign(?:ed|ature)?|connect|publish|credential|password|login|o ?auth|decision|your (call|input|ok)/i;

export async function buildExecBriefing(userId: number): Promise<ExecBriefing> {
  const db = getDb();
  const date = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });

  // Client names for labelling.
  let nameById = new Map<number, string>();
  try {
    const rows = (await db.select({ id: clients.id, name: clients.name }).from(clients)) as any[];
    nameById = new Map(rows.map((c) => [c.id, c.name]));
  } catch { /* skip labels */ }
  const lbl = (t: any): BriefItem => ({ id: t.id, title: t.title, client: t.clientId ? nameById.get(t.clientId) ?? null : null, due: dayStr(t.dueDate), tag: t.assignedTo ?? null });

  // Active (not completed) tasks, excluding inactive/archived clients' work.
  let open: any[] = [];
  try {
    const dead = new Set(((await db.select({ id: clients.id }).from(clients).where(or(eq(clients.status, "inactive"), eq(clients.status, "archived")))) as any[]).map((c) => c.id));
    const rows = (await db.select().from(tasks).where(eq(tasks.completed, false))) as any[];
    open = rows.filter((t) => !t.clientId || !dead.has(t.clientId));
  } catch { /* skip */ }

  const now = Date.now();
  const sot = startOfToday().getTime();
  const eot = endOfToday().getTime();
  const ms = (d: any) => { if (!d) return null; const t = d instanceof Date ? d.getTime() : new Date(d).getTime(); return Number.isNaN(t) ? null : t; };

  const overdue = open.filter((t) => { const m = ms(t.dueDate); return m != null && m < sot; }).sort((a, b) => (ms(a.dueDate)! - ms(b.dueDate)!));
  const dueToday = open.filter((t) => { const m = ms(t.dueDate); return m != null && m >= sot && m <= eot; });
  const needsYou = open
    .filter((t) => NEEDS_MARKIE.test(`${t.title} ${t.description ?? ""} ${t.assignedTo ?? ""}`))
    .sort((a, b) => (ms(a.dueDate) ?? Infinity) - (ms(b.dueDate) ?? Infinity))
    .slice(0, 8).map(lbl);

  // What the team learned recently (last 14 days) — confirmed/correction lessons.
  let learned: string[] = [];
  try {
    const since = new Date(now - 14 * 86_400_000);
    const rows = (await db.select({ lesson: agentLearnings.lesson, scope: agentLearnings.scope })
      .from(agentLearnings).where(gte(agentLearnings.createdAt, since)).orderBy(desc(agentLearnings.createdAt)).limit(5)) as any[];
    learned = rows.map((r) => (r.scope && r.scope !== "all" ? `[${r.scope}] ` : "") + r.lesson);
  } catch { /* table may not exist */ }

  const headline = [
    needsYou.length ? `${needsYou.length} need${needsYou.length === 1 ? "s" : ""} you` : null,
    overdue.length ? `${overdue.length} overdue` : null,
    dueToday.length ? `${dueToday.length} due today` : null,
  ].filter(Boolean).join(" · ") || "All clear — nothing pressing.";

  return {
    date,
    needsYou,
    behind: { count: overdue.length, top: overdue.slice(0, 5).map(lbl) },
    dueToday: { count: dueToday.length, top: dueToday.slice(0, 5).map(lbl) },
    learned,
    headline,
  };
}

/** Render the briefing as a short markdown digest for chat or the Dashboard. */
export function formatExecBriefing(b: ExecBriefing): string {
  const line = (i: BriefItem) => `• ${i.title}${i.client ? ` (${i.client})` : ""}${i.due ? ` — due ${i.due}` : ""}`;
  const out: string[] = [`📋 **Executive briefing — ${b.date}**`, b.headline, ""];
  if (b.needsYou.length) { out.push("**Needs you:**", ...b.needsYou.map(line), ""); }
  if (b.behind.count) { out.push(`**Behind (${b.behind.count} overdue):**`, ...b.behind.top.map(line), ...(b.behind.count > b.behind.top.length ? [`…and ${b.behind.count - b.behind.top.length} more`] : []), ""); }
  if (b.dueToday.count) { out.push(`**Due today (${b.dueToday.count}):**`, ...b.dueToday.top.map(line), ""); }
  if (b.learned.length) { out.push("**Team learned recently:**", ...b.learned.map((l) => `• ${l}`), ""); }
  if (!b.needsYou.length && !b.behind.count && !b.dueToday.count) out.push("Nothing needs you and nothing's overdue. 🎉");
  return out.join("\n").trim();
}
