/**
 * FIRM REGISTERS / KNOWLEDGE-ASSET LIBRARY ROUTER.
 * "Everything becomes a numbered, reusable asset" (Markie 2026-06-26): each entry
 * gets a typed code (DEC-0001, RES-0042, SYS-0015, GF-0124, IDE-0021, LL-0008, …).
 * The Decision Register adds structured reason / alternatives / outcome, and every
 * decision is MIRRORED into the firm Brain so Liv can answer "why did we decide X?"
 * years later. Owner-scoped. Raw SQL.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { addTruth } from "./brain-store";

const KIND = z.enum(["decision", "improvement", "prompt", "research", "system", "client_process", "idea", "lesson"]);
const PREFIX: Record<string, string> = {
  decision: "DEC", improvement: "IMP", prompt: "PR", research: "RES",
  system: "SYS", client_process: "GF", idea: "IDE", lesson: "LL",
};

/** Next typed code for a kind, e.g. DEC-0001 → DEC-0002 (per user). */
async function nextCode(db: any, userId: number, kind: string): Promise<string> {
  const prefix = PREFIX[kind] || kind.slice(0, 3).toUpperCase();
  const rows = (await db.all(sql`SELECT code FROM firm_registers WHERE userId=${userId} AND kind=${kind} AND code IS NOT NULL`)) as any[];
  let max = 0;
  for (const r of rows) { const m = String(r.code || "").match(/-(\d+)$/); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export const registersRouter = createRouter({
  /** List entries of one kind (newest first; open improvements first). */
  list: authedQuery.input(z.object({ kind: KIND })).query(async ({ ctx, input }) => {
    const rows = (await getDb().all(sql`
      SELECT * FROM firm_registers
      WHERE userId = ${ctx.user.id} AND kind = ${input.kind} AND active = 1
      ORDER BY (status = 'open') DESC, createdAt DESC`)) as any[];
    return { rows };
  }),

  counts: authedQuery.query(async ({ ctx }) => {
    const rows = (await getDb().all(sql`
      SELECT kind, COUNT(*) AS n, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open
      FROM firm_registers WHERE userId = ${ctx.user.id} AND active = 1 GROUP BY kind`)) as any[];
    const out: Record<string, { total: number; open: number }> = {};
    for (const r of rows) out[r.kind] = { total: Number(r.n) || 0, open: Number(r.open) || 0 };
    return out;
  }),

  /** Add or edit. New entries get an auto typed-code; decisions mirror to the Brain. */
  upsert: authedQuery
    .input(z.object({
      id: z.number().optional(),
      kind: KIND,
      title: z.string().min(1).max(200),
      body: z.string().max(8000).optional(),
      tags: z.string().max(300).optional(),
      author: z.string().max(60).optional(),
      // Decision Register fields:
      reason: z.string().max(4000).optional(),
      alternatives: z.string().max(2000).optional(),
      outcome: z.string().max(400).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE firm_registers SET title=${input.title}, body=${input.body ?? null}, tags=${input.tags ?? null},
          reason=${input.reason ?? null}, alternatives=${input.alternatives ?? null}, outcome=${input.outcome ?? null}, updatedAt=${now}
          WHERE id=${input.id} AND userId=${ctx.user.id}`);
        return { ok: true, id: input.id };
      }
      const code = await nextCode(db, ctx.user.id, input.kind);
      await db.run(sql`INSERT INTO firm_registers (userId, kind, code, title, body, reason, alternatives, outcome, tags, status, author, createdAt, updatedAt)
        VALUES (${ctx.user.id}, ${input.kind}, ${code}, ${input.title}, ${input.body ?? null}, ${input.reason ?? null}, ${input.alternatives ?? null}, ${input.outcome ?? null}, ${input.tags ?? null}, 'open', ${input.author ?? "Markie"}, ${now}, ${now})`);

      // Mirror a DECISION into the firm Brain so Liv can recall it ("why did we decide X?").
      if (input.kind === "decision") {
        const statement = [
          `Decision ${code}: ${input.title}.`,
          input.reason ? `Reason: ${input.reason}` : "",
          input.alternatives ? `Alternatives considered: ${input.alternatives}` : "",
          input.outcome ? `Outcome: ${input.outcome}` : "",
        ].filter(Boolean).join(" ");
        try { await addTruth({ scope: { kind: "firm" }, label: `${code} — ${input.title}`.slice(0, 120), statement, category: "decision", sourceLabels: ["Decision Register"] }); } catch { /* mirror best-effort */ }
      }
      return { ok: true, code };
    }),

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
