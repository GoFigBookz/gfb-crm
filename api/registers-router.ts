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
import { addTruth, fileQuestion } from "./brain-store";
import { parseSessionPackage } from "./session-import-core";

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

  // ───────── SESSION IMPORT ─────────
  // Paste a "Session Close Package" → numbered register assets + Brain entries.
  // Reuses the existing kinds/numbering; no parallel doc system.

  /** Dry-run: parse the package and show exactly what WOULD be created. */
  importSessionPreview: authedQuery
    .input(z.object({ text: z.string().min(1).max(60000) }))
    .query(async ({ ctx, input }) => {
      const parsed = parseSessionPackage(input.text);
      const counts: Record<string, number> = {};
      for (const it of parsed.items) counts[it.kind] = (counts[it.kind] || 0) + 1;
      let alreadyImported = false;
      if (parsed.sessionId) {
        const dup = (await getDb().all(sql`SELECT id FROM firm_registers WHERE userId=${ctx.user.id} AND kind='system' AND title LIKE ${`Session ${parsed.sessionId}%`} AND active=1 LIMIT 1`)) as any[];
        alreadyImported = dup.length > 0;
      }
      return { ...parsed, counts, alreadyImported };
    }),

  /** Commit: create the numbered assets, mirror decisions + open questions to Brain. */
  importSessionCommit: authedQuery
    .input(z.object({ text: z.string().min(1).max(60000) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      const parsed = parseSessionPackage(input.text);
      const tag = parsed.sessionId || `session-${now}`;

      // idempotent: skip if this session was already imported
      if (parsed.sessionId) {
        const dup = (await db.all(sql`SELECT id FROM firm_registers WHERE userId=${uid} AND kind='system' AND title LIKE ${`Session ${parsed.sessionId}%`} AND active=1 LIMIT 1`)) as any[];
        if (dup.length) return { ok: true, alreadyImported: true, sessionId: parsed.sessionId, created: 0, codes: [] as string[] };
      }

      const codes: string[] = [];
      // 1) a SYS record for the session itself = the master-index anchor
      const sessCode = await nextCode(db, uid, "system");
      await db.run(sql`INSERT INTO firm_registers (userId, kind, code, title, body, tags, status, author, createdAt, updatedAt)
        VALUES (${uid}, 'system', ${sessCode}, ${`Session ${tag} — ${parsed.title}`.slice(0, 200)}, ${parsed.summary || null}, ${tag}, 'open', 'Session Import', ${now}, ${now})`);
      codes.push(sessCode);

      // 2) each parsed item → a numbered asset of its kind
      for (const it of parsed.items) {
        const code = await nextCode(db, uid, it.kind);
        await db.run(sql`INSERT INTO firm_registers (userId, kind, code, title, body, tags, status, author, createdAt, updatedAt)
          VALUES (${uid}, ${it.kind}, ${code}, ${it.title}, ${it.body ?? null}, ${tag}, 'open', 'Session Import', ${now}, ${now})`);
        codes.push(code);
        // decisions mirror to the firm Brain (so Liv can recall the "why")
        if (it.kind === "decision") {
          try { await addTruth({ scope: { kind: "firm" }, label: `${code} — ${it.title}`.slice(0, 120), statement: [`Decision ${code}: ${it.title}.`, it.body || ""].filter(Boolean).join(" "), category: "decision", sourceLabels: [`Session ${tag}`] }); } catch { /* best-effort */ }
        }
      }

      // 3) open questions → filed to the Brain (firm) so they're tracked, not lost
      let questionsFiled = 0;
      for (const q of parsed.openQuestions) {
        try { await fileQuestion(q, { kind: "firm" }, { askedBy: "Session Import", category: "strategy" }); questionsFiled++; } catch { /* best-effort */ }
      }

      const byKind: Record<string, number> = {};
      for (const it of parsed.items) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
      return { ok: true, alreadyImported: false, sessionId: parsed.sessionId, created: parsed.items.length + 1, byKind, questionsFiled, codes };
    }),
});
