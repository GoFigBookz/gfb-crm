/**
 * PERSONAL ROUTER — Liv's private personal space.
 * =============================================================================
 * Markie's personal life (tasks, reminders, notes), WALLED OFF from all client
 * data. Every query is scoped to ctx.user.id — a user only ever sees their own
 * personal items, and nothing here ever touches the clients table. This is the
 * "separate personal section" Markie asked for.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { personalItems } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const personalRouter = createRouter({
  list: authedQuery
    .input(z.object({ includeDone: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(personalItems.userId, ctx.user.id)];
      if (!input?.includeDone) conds.push(eq(personalItems.done, false));
      return db.select().from(personalItems).where(and(...conds)).orderBy(desc(personalItems.createdAt));
    }),

  add: authedQuery
    .input(z.object({
      kind: z.enum(["task", "reminder", "note"]).default("task"),
      title: z.string().min(1).max(500),
      body: z.string().max(5000).optional(),
      dueDate: z.date().nullable().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.insert(personalItems).values({
        userId: ctx.user.id,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
        done: false,
      } as any);
      return { ok: true };
    }),

  toggle: authedQuery
    .input(z.object({ id: z.number(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(personalItems)
        .set({ done: input.done, doneAt: input.done ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(personalItems.id, input.id), eq(personalItems.userId, ctx.user.id)));
      return { ok: true };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(500).optional(),
      body: z.string().max(5000).nullable().optional(),
      dueDate: z.date().nullable().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...rest } = input;
      await db.update(personalItems)
        .set({ ...rest, updatedAt: new Date() } as any)
        .where(and(eq(personalItems.id, id), eq(personalItems.userId, ctx.user.id)));
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(personalItems)
        .where(and(eq(personalItems.id, input.id), eq(personalItems.userId, ctx.user.id)));
      return { ok: true };
    }),
});
