/**
 * FIGGY JR — TASK / RULE DEDUPE
 * =============================================================================
 * Earlier (pre-idempotency) boots created duplicate recurring rules + task
 * instances for clients (e.g. Originality showed each task several times). The
 * generators are idempotent now, but the legacy duplicates persist in the live
 * DB. This collapses them safely:
 *   1. Rules: keep the lowest-id rule per (clientId, ruleType); repoint the
 *      duplicates' tasks to the survivor, then delete the duplicate rules.
 *   2. Tasks: keep one per (clientId, title, due-day); prefer a completed copy
 *      (don't lose history), else the lowest id; delete the rest.
 * Idempotent — a second run finds nothing to do.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clientTaskRules, tasks } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

const dayKey = (d: any) => {
  if (!d) return "none";
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? "none" : t.toISOString().slice(0, 10);
};

export async function dedupeTasks(): Promise<{ rulesRemoved: number; tasksRemoved: number }> {
  const db = getDb();
  let rulesRemoved = 0, tasksRemoved = 0;

  // 1) Duplicate recurring rules: one survivor per (clientId, ruleType).
  const allRules: any[] = await db.select().from(clientTaskRules);
  const ruleGroups = new Map<string, any[]>();
  for (const r of allRules) {
    const key = `${r.clientId}::${r.ruleType ?? r.title}`;
    if (!ruleGroups.has(key)) ruleGroups.set(key, []);
    ruleGroups.get(key)!.push(r);
  }
  for (const group of ruleGroups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.id - b.id);
    const keep = group[0];
    const dropIds = group.slice(1).map((r) => r.id);
    // repoint the duplicates' task instances to the surviving rule
    await db.update(tasks).set({ ruleId: keep.id }).where(inArray(tasks.ruleId, dropIds));
    await db.delete(clientTaskRules).where(inArray(clientTaskRules.id, dropIds));
    rulesRemoved += dropIds.length;
  }

  // 2) Duplicate task instances: one per (clientId, title, due-day).
  const allTasks: any[] = await db.select().from(tasks);
  const taskGroups = new Map<string, any[]>();
  for (const t of allTasks) {
    const key = `${t.clientId}::${(t.title ?? "").trim().toLowerCase()}::${dayKey(t.dueDate)}`;
    if (!taskGroups.has(key)) taskGroups.set(key, []);
    taskGroups.get(key)!.push(t);
  }
  for (const group of taskGroups.values()) {
    if (group.length < 2) continue;
    // prefer a completed copy (keep history), else lowest id
    group.sort((a, b) => {
      const ac = a.completed ? 0 : 1, bc = b.completed ? 0 : 1;
      return ac !== bc ? ac - bc : a.id - b.id;
    });
    const dropIds = group.slice(1).map((t) => t.id);
    await db.delete(tasks).where(inArray(tasks.id, dropIds));
    tasksRemoved += dropIds.length;
  }

  if (rulesRemoved || tasksRemoved) console.log(`[dedupe-tasks] removed ${rulesRemoved} dup rules, ${tasksRemoved} dup tasks`);
  return { rulesRemoved, tasksRemoved };
}
