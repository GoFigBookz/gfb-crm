/**
 * MARKETING (SKYE) ROUTER — platform cleanup checklist + content-post pipeline.
 * Firm-level, authed. Raw SQL.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export const marketingRouter = createRouter({
  list: authedQuery.query(async () => {
    const db = getDb();
    return (await db.all(sql`SELECT * FROM marketing_items WHERE archived = 0 ORDER BY kind, platform, updatedAt DESC, id DESC`)) as any[];
  }),

  add: authedQuery
    .input(z.object({
      kind: z.enum(["platform", "post"]).default("post"),
      platform: z.string().max(40).optional(),
      title: z.string().min(1).max(300),
      body: z.string().max(8000).optional(),
      status: z.string().max(40).optional(),
      scheduledFor: z.string().max(20).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb(); const now = Date.now();
      const status = input.status || (input.kind === "platform" ? "todo" : "idea");
      await db.run(sql`INSERT INTO marketing_items (kind, platform, title, body, status, scheduledFor, createdAt, updatedAt)
        VALUES (${input.kind}, ${input.platform ?? null}, ${input.title}, ${input.body ?? null}, ${status}, ${input.scheduledFor ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      title: z.string().max(300).optional(),
      body: z.string().max(8000).nullable().optional(),
      status: z.string().max(40).optional(),
      platform: z.string().max(40).nullable().optional(),
      scheduledFor: z.string().max(20).nullable().optional(),
      archived: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const sets: any[] = [];
      const push = (c: string, v: any) => sets.push(sql`${sql.raw(c)} = ${v}`);
      if (input.title !== undefined) push("title", input.title);
      if (input.body !== undefined) push("body", input.body);
      if (input.status !== undefined) push("status", input.status);
      if (input.platform !== undefined) push("platform", input.platform);
      if (input.scheduledFor !== undefined) push("scheduledFor", input.scheduledFor);
      if (input.archived !== undefined) push("archived", input.archived ? 1 : 0);
      if (sets.length === 0) return { ok: true };
      push("updatedAt", Date.now());
      const setSql = sets.reduce((a, s, i) => (i === 0 ? s : sql`${a}, ${s}`));
      await db.run(sql`UPDATE marketing_items SET ${setSql} WHERE id = ${input.id}`);
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await getDb().run(sql`UPDATE marketing_items SET archived = 1 WHERE id = ${input.id}`);
    return { ok: true };
  }),
});
