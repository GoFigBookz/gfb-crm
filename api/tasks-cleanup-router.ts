/**
 * TASKS CLEANUP — tRPC (Markie 2026-06-27, backlog #49). Surfaces the cleanup
 * review (near-duplicates / undated / long-stale) over the live task table and
 * applies only what the human ticks.
 * =============================================================================
 * Inputs:   none for scan; { ids } for the apply actions.
 * Outputs:  scan → analyzeTasks result enriched with client names.
 *           bulkComplete → marks ticked tasks done (history preserved).
 *           bulkDelete   → deletes ticked tasks (near-duplicate extras).
 * Dependencies: analyzeTasks (tasks-cleanup-core), tasks/clients tables.
 * Security: admin/senior see all tasks; others only their own (mirrors task-router).
 *           Read-only scan; mutations require an explicit id list (no bulk wipe).
 * Errors:   defensive — a missing client name just shows the id.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, clients } from "../db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { syncUpdate } from "./sync-hooks";
import { analyzeTasks, type CleanupTask } from "./tasks-cleanup-core";

/** The tasks this user may clean (admin/senior = all; else own/assigned). */
async function visibleTasks(ctx: any): Promise<any[]> {
  const db = getDb();
  const { role, id: userId, name, email } = ctx.user;
  const all = role === "admin" || role === "senior_bookkeeper";
  const rows = all
    ? await db.select().from(tasks)
    : await db.select().from(tasks).where(or(eq(tasks.userId, userId), eq(tasks.assignedTo, name || email)));
  // Drop tasks tied to inactive/archived clients (they shouldn't surface anywhere).
  const dead = await db.select({ id: clients.id }).from(clients)
    .where(or(eq(clients.status, "inactive"), eq(clients.status, "archived")));
  const deadIds = new Set((dead as any[]).map((c) => c.id));
  return (rows as any[]).filter((t) => !t.clientId || !deadIds.has(t.clientId));
}

export const tasksCleanupRouter = createRouter({
  /** Read-only scan: find near-duplicate, undated, and long-stale open tasks. */
  scan: authedQuery
    .input(z.object({ staleDays: z.number().min(30).max(730).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await visibleTasks(ctx);
      const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);
      const nameById = new Map<number, string>((clientRows as any[]).map((c) => [c.id, c.name]));
      const mapped: CleanupTask[] = rows.map((t) => ({
        id: t.id, clientId: t.clientId, clientName: t.clientId ? nameById.get(t.clientId) ?? null : null,
        title: t.title, startDate: t.startDate, dueDate: t.dueDate, completed: t.completed, priority: t.priority,
      }));
      const result = analyzeTasks(mapped, Date.now(), { staleDays: input?.staleDays ?? 120 });
      return { ...result, totalOpen: mapped.filter((t) => !t.completed).length };
    }),

  /** Mark the ticked tasks complete (preserves history — used for stale-overdue). */
  bulkComplete: authedQuery
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const allowed = new Set((await visibleTasks(ctx)).map((t) => t.id));
      const ids = input.ids.filter((id) => allowed.has(id));
      if (!ids.length) return { ok: true as const, updated: 0 };
      const now = new Date();
      await db.update(tasks).set({ completed: true, completedAt: now, status: "completed", updatedAt: now }).where(inArray(tasks.id, ids));
      for (const id of ids) {
        const row = (await db.select().from(tasks).where(eq(tasks.id, id)).limit(1))[0];
        if (row) syncUpdate("tasks", row);
      }
      return { ok: true as const, updated: ids.length };
    }),

  /** Delete the ticked tasks (used for confirmed near-duplicate extras). */
  bulkDelete: authedQuery
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const allowed = new Set((await visibleTasks(ctx)).map((t) => t.id));
      const ids = input.ids.filter((id) => allowed.has(id));
      if (!ids.length) return { ok: true as const, deleted: 0 };
      await db.delete(tasks).where(inArray(tasks.id, ids));
      return { ok: true as const, deleted: ids.length };
    }),
});
