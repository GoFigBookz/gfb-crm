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
import { personalItems, personalFacts } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { normalizeCategory, splitDump } from "./personal-core";

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

  // ===== PERSONAL KNOWLEDGE BASE (Liv's private memory) =====
  // Durable facts about Markie's personal life. Scoped strictly to ctx.user.id —
  // walled off from clients and from every agent's context except Liv's.
  factsList: authedQuery
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(personalFacts.userId, ctx.user.id)];
      if (input?.category) conds.push(eq(personalFacts.category, normalizeCategory(input.category)));
      return db.select().from(personalFacts).where(and(...conds))
        .orderBy(desc(personalFacts.pinned), desc(personalFacts.createdAt));
    }),

  factAdd: authedQuery
    .input(z.object({
      fact: z.string().min(1).max(2000),
      category: z.string().max(60).optional(),
      tags: z.string().max(300).nullable().optional(),
      pinned: z.boolean().optional(),
      source: z.string().max(40).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.insert(personalFacts).values({
        userId: ctx.user.id,
        category: normalizeCategory(input.category),
        fact: input.fact,
        tags: input.tags ?? null,
        pinned: input.pinned ?? false,
        source: input.source ?? "markie",
      } as any);
      return { ok: true };
    }),

  factUpdate: authedQuery
    .input(z.object({
      id: z.number(),
      fact: z.string().min(1).max(2000).optional(),
      category: z.string().max(60).optional(),
      tags: z.string().max(300).nullable().optional(),
      pinned: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, category, ...rest } = input;
      const patch: any = { ...rest, updatedAt: new Date() };
      if (category != null) patch.category = normalizeCategory(category);
      await db.update(personalFacts).set(patch)
        .where(and(eq(personalFacts.id, id), eq(personalFacts.userId, ctx.user.id)));
      return { ok: true };
    }),

  factRemove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(personalFacts)
        .where(and(eq(personalFacts.id, input.id), eq(personalFacts.userId, ctx.user.id)));
      return { ok: true };
    }),

  // Bulk "dump" — paste a package about your life; each line becomes a fact for
  // Liv to file (lands in the chosen category, default misc/inbox to organize).
  factDump: authedQuery
    .input(z.object({ text: z.string().min(1), category: z.string().max(60).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const lines = splitDump(input.text);
      const cat = normalizeCategory(input.category ?? "misc");
      for (const fact of lines) {
        await db.insert(personalFacts).values({ userId: ctx.user.id, category: cat, fact, source: "dump", pinned: false } as any);
      }
      return { ok: true, added: lines.length };
    }),
});
