/**
 * LAUNCHPAD ROUTER — Markie's new + launched business opportunities pipeline.
 * Owner-scoped (ctx.user.id) like Phoenix Rising; raw SQL → Postgres-portable.
 * Stages: idea → exploring → building → launched → parked.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

const STAGES = ["idea", "exploring", "building", "launched", "parked"] as const;

export const launchpadRouter = createRouter({
  list: authedQuery
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = (await db.all(sql`SELECT * FROM launchpad_opportunities WHERE userId = ${ctx.user.id} ${input?.includeArchived ? sql`` : sql`AND archived = 0`} ORDER BY pinned DESC, updatedAt DESC, id DESC`)) as any[];
      return rows;
    }),

  add: authedQuery
    .input(z.object({
      name: z.string().min(1).max(200),
      stage: z.enum(STAGES).default("idea"),
      category: z.string().max(80).optional(),
      notes: z.string().max(5000).optional(),
      nextStep: z.string().max(500).optional(),
      potentialValue: z.string().max(80).optional(),
      link: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const now = Date.now();
      await db.run(sql`INSERT INTO launchpad_opportunities (userId, name, stage, category, notes, nextStep, potentialValue, link, createdAt, updatedAt)
        VALUES (${ctx.user.id}, ${input.name}, ${input.stage}, ${input.category ?? null}, ${input.notes ?? null}, ${input.nextStep ?? null}, ${input.potentialValue ?? null}, ${input.link ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      stage: z.enum(STAGES).optional(),
      category: z.string().max(80).nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
      nextStep: z.string().max(500).nullable().optional(),
      potentialValue: z.string().max(80).nullable().optional(),
      link: z.string().max(500).nullable().optional(),
      pinned: z.boolean().optional(),
      archived: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const sets: any[] = [];
      const push = (col: string, val: any) => sets.push(sql`${sql.raw(col)} = ${val}`);
      if (input.name !== undefined) push("name", input.name);
      if (input.stage !== undefined) push("stage", input.stage);
      if (input.category !== undefined) push("category", input.category);
      if (input.notes !== undefined) push("notes", input.notes);
      if (input.nextStep !== undefined) push("nextStep", input.nextStep);
      if (input.potentialValue !== undefined) push("potentialValue", input.potentialValue);
      if (input.link !== undefined) push("link", input.link);
      if (input.pinned !== undefined) push("pinned", input.pinned ? 1 : 0);
      if (input.archived !== undefined) push("archived", input.archived ? 1 : 0);
      if (sets.length === 0) return { ok: true };
      push("updatedAt", Date.now());
      const setSql = sets.reduce((acc, s, i) => (i === 0 ? s : sql`${acc}, ${s}`));
      await db.run(sql`UPDATE launchpad_opportunities SET ${setSql} WHERE id = ${input.id} AND userId = ${ctx.user.id}`);
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.run(sql`DELETE FROM launchpad_opportunities WHERE id = ${input.id} AND userId = ${ctx.user.id}`);
      return { ok: true };
    }),
});
