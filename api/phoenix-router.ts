/**
 * PHOENIX ROUTER — Family History (genealogy) + Estate plan. PRIVATE, owner-only.
 * Every query is pinned to ctx.user.id; no clientId — personal never mixes with
 * client/firm data. Raw SQL (Postgres-portable).
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

const ESTATE_CATEGORIES = ["will", "executor", "business", "accounts", "assets", "debts", "insurance", "digital", "wishes", "contacts", "other"] as const;

export const phoenixRouter = createRouter({
  // ───────── Family history / genealogy ─────────
  familyList: authedQuery.query(async ({ ctx }) => {
    const rows = (await getDb().all(sql`SELECT * FROM family_members WHERE userId = ${ctx.user.id} ORDER BY living DESC, name`)) as any[];
    return { rows };
  }),
  familyUpsert: authedQuery
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(200),
      relation: z.string().max(60).optional(),
      side: z.enum(["maternal", "paternal", "self", "spouse"]).optional(),
      birthDate: z.string().max(60).optional(),
      deathDate: z.string().max(60).optional(),
      living: z.boolean().default(true),
      birthplace: z.string().max(200).optional(),
      notes: z.string().max(4000).optional(),
      medicalNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE family_members SET name=${input.name}, relation=${input.relation ?? null}, side=${input.side ?? null}, birthDate=${input.birthDate ?? null}, deathDate=${input.deathDate ?? null}, living=${input.living ? 1 : 0}, birthplace=${input.birthplace ?? null}, notes=${input.notes ?? null}, medicalNotes=${input.medicalNotes ?? null}, updatedAt=${now} WHERE id=${input.id} AND userId=${uid}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO family_members (userId, name, relation, side, birthDate, deathDate, living, birthplace, notes, medicalNotes, createdAt, updatedAt)
        VALUES (${uid}, ${input.name}, ${input.relation ?? null}, ${input.side ?? null}, ${input.birthDate ?? null}, ${input.deathDate ?? null}, ${input.living ? 1 : 0}, ${input.birthplace ?? null}, ${input.notes ?? null}, ${input.medicalNotes ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),
  familyRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM family_members WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  // ───────── Estate plan ("if something happens to me") ─────────
  estateList: authedQuery.query(async ({ ctx }) => {
    const rows = (await getDb().all(sql`SELECT * FROM estate_items WHERE userId = ${ctx.user.id} ORDER BY category, sortOrder, id`)) as any[];
    return { rows };
  }),
  estateUpsert: authedQuery
    .input(z.object({
      id: z.number().optional(),
      category: z.enum(ESTATE_CATEGORIES),
      title: z.string().min(1).max(200),
      detail: z.string().max(8000).optional(),
      location: z.string().max(400).optional(),
      contact: z.string().max(300).optional(),
      status: z.enum(["open", "done"]).default("open"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE estate_items SET category=${input.category}, title=${input.title}, detail=${input.detail ?? null}, location=${input.location ?? null}, contact=${input.contact ?? null}, status=${input.status}, updatedAt=${now} WHERE id=${input.id} AND userId=${uid}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO estate_items (userId, category, title, detail, location, contact, status, createdAt, updatedAt)
        VALUES (${uid}, ${input.category}, ${input.title}, ${input.detail ?? null}, ${input.location ?? null}, ${input.contact ?? null}, ${input.status}, ${now}, ${now})`);
      return { ok: true };
    }),
  estateSetStatus: authedQuery.input(z.object({ id: z.number(), status: z.enum(["open", "done"]) })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`UPDATE estate_items SET status=${input.status}, updatedAt=${Date.now()} WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),
  estateRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM estate_items WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),
});
