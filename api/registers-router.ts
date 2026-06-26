/**
 * FIRM REGISTERS ROUTER — Decision Register, Improvement Register, Prompt Library.
 * The three knowledge registers the Figgy Operating System (FOS) requires. Owner-
 * scoped (firm-wide for Markie). Raw SQL. Read + add + update-status + edit + remove.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

const KIND = z.enum(["decision", "improvement", "prompt"]);

export const registersRouter = createRouter({
  /** List entries of one register kind (newest first; open improvements first). */
  list: authedQuery.input(z.object({ kind: KIND })).query(async ({ ctx, input }) => {
    const db = getDb();
    const rows = (await db.all(sql`
      SELECT * FROM firm_registers
      WHERE userId = ${ctx.user.id} AND kind = ${input.kind} AND active = 1
      ORDER BY (status = 'open') DESC, createdAt DESC`)) as any[];
    return { rows };
  }),

  /** Counts for each register (for the page badges). */
  counts: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = (await db.all(sql`
      SELECT kind, COUNT(*) AS n, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open
      FROM firm_registers WHERE userId = ${ctx.user.id} AND active = 1 GROUP BY kind`)) as any[];
    const out: Record<string, { total: number; open: number }> = {};
    for (const r of rows) out[r.kind] = { total: Number(r.n) || 0, open: Number(r.open) || 0 };
    return out;
  }),

  /** Add or edit an entry. */
  upsert: authedQuery
    .input(z.object({
      id: z.number().optional(),
      kind: KIND,
      title: z.string().min(1).max(200),
      body: z.string().max(8000).optional(),
      tags: z.string().max(300).optional(),
      author: z.string().max(60).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE firm_registers SET title=${input.title}, body=${input.body ?? null}, tags=${input.tags ?? null}, updatedAt=${now}
          WHERE id=${input.id} AND userId=${ctx.user.id}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO firm_registers (userId, kind, title, body, tags, status, author, createdAt, updatedAt)
        VALUES (${ctx.user.id}, ${input.kind}, ${input.title}, ${input.body ?? null}, ${input.tags ?? null}, 'open', ${input.author ?? "Markie"}, ${now}, ${now})`);
      return { ok: true };
    }),

  /** Toggle an improvement open ↔ done (no-op meaning on other kinds). */
  setStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["open", "done"]) }))
    .mutation(async ({ ctx, input }) => {
      await getDb().run(sql`UPDATE firm_registers SET status=${input.status}, updatedAt=${Date.now()} WHERE id=${input.id} AND userId=${ctx.user.id}`);
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`UPDATE firm_registers SET active=0 WHERE id=${input.id} AND userId=${ctx.user.id}`);
    return { ok: true };
  }),
});
