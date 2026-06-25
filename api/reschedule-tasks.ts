/**
 * RESCHEDULE + CLEAN UP TASKS (Markie 2026-06-25).
 * =============================================================================
 * Applies the canonical START + DUE schedule to every open compliance task and
 * cleans out the junk:
 *   - HST/GST → quarterly: start 5th of the month after quarter-end, due a week
 *     before the statutory deadline (Q1 → Apr 5 / Apr 23). Monthly + annual handled.
 *   - WSIB → same cadence as quarterly HST.
 *   - T4 → start Jan 15, due Feb 15 (CRA deadline Feb 28).
 *   - Year-end close → start the 1st of the month after year-end (begin promptly,
 *     not weeks later), due the 30th.
 *   - Payroll tasks for auto-paid / self-managed clients → DELETED (no task needed).
 *   - Open tasks for INACTIVE / old clients (e.g. Cavios) → DELETED.
 * Idempotent — safe to run repeatedly (re-dating never drifts the year).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { tasks, clients } from "../db/schema";
import { eq } from "drizzle-orm";
import { taskSchedule } from "./task-date-rules";

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** Which compliance rule (if any) a task is — from its title/category. */
function detectRule(title: string, category: string): string | null {
  const t = `${title} ${category}`.toLowerCase();
  if (/\bt4\b|\bt4a\b/.test(t)) return "t4";
  if (/year[\s-]?end/.test(t)) return "year_end";
  if (/\bwsib\b/.test(t)) return "wsib";
  if (/\bhst\b|\bgst\b/.test(t)) return "hst";
  return null;
}

export async function rescheduleAndCleanupTasks(): Promise<{
  rescheduled: number; deletedInactive: number; deletedAutoPayroll: number; deduped: number;
}> {
  const db = getDb();
  const stats = { rescheduled: 0, deletedInactive: 0, deletedAutoPayroll: 0, deduped: 0 };
  try {
    const allTasks = (await db.select().from(tasks)) as any[];
    const allClients = (await db.select().from(clients)) as any[];
    const byId = new Map(allClients.map((c) => [c.id, c]));

    for (const t of allTasks) {
      if (t.completed || t.status === "completed") continue;
      const c = t.clientId != null ? byId.get(t.clientId) : null;
      const title = String(t.title || "");
      const category = String(t.category || "");

      // 1) Old / inactive clients (Cavios, etc.) — remove their open tasks. Only
      //    truly inactive/churned (NOT leads/prospects, who may have onboarding tasks).
      const dead = c && (c.status === "inactive" || c.workflowStatus === "churned");
      if (dead) {
        await db.delete(tasks).where(eq(tasks.id, t.id));
        stats.deletedInactive++;
        continue;
      }

      // 2) Payroll tasks for auto-paid / self-managed clients — no task needed.
      const isPayroll = /payroll/i.test(title) || category.toLowerCase() === "payroll";
      if (isPayroll && c && (c.payrollExternal || c.payrollHoursSource === "qbo_autopay")) {
        await db.delete(tasks).where(eq(tasks.id, t.id));
        stats.deletedAutoPayroll++;
        continue;
      }

      // 3) Apply the start + due schedule for compliance tasks.
      const rule = detectRule(title, category);
      if (rule) {
        const sched = taskSchedule(rule, t.dueDate ? new Date(t.dueDate) : null, {
          yearEndMonth: c?.yearEndMonth ? MONTHS[c.yearEndMonth] ?? null : null,
          hstPeriod: c?.hstPeriod ?? null,
        });
        if (sched) {
          await db.update(tasks).set({ startDate: sched.start, dueDate: sched.due, updatedAt: new Date() } as any).where(eq(tasks.id, t.id));
          stats.rescheduled++;
        }
      }
    }

    // 4) Dedupe leftover duplicates.
    try {
      const { dedupeTasks } = await import("./dedupe-tasks");
      const r = await dedupeTasks();
      stats.deduped = r?.tasksRemoved ?? 0;
    } catch { /* best-effort */ }

    console.log(`[reschedule] re-dated ${stats.rescheduled}, removed ${stats.deletedInactive} inactive-client + ${stats.deletedAutoPayroll} auto-payroll, deduped ${stats.deduped}`);
    return stats;
  } catch (e) {
    console.error("[reschedule] failed:", e instanceof Error ? e.message : e);
    return stats;
  }
}
