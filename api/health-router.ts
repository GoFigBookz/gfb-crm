/**
 * HEALTH HUB ROUTER — Markie's PRIVATE health data (Phoenix Rising).
 * =============================================================================
 * Purpose:  CRUD for meds, supplements, vitals, labs (bloodwork), conditions.
 * Inputs:   tRPC mutations/queries, all authed.
 * Outputs:  Owner-scoped rows (every query filters userId = ctx.user.id).
 * Privacy:  OWNER-ONLY. No clientId anywhere — health never mixes with client/
 *           firm data. Every read & write is pinned to the caller's userId, so
 *           one user can never see another's health record.
 * Errors:   Standard tRPC; raw SQL so it ports to Postgres.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export const healthRouter = createRouter({
  /** Everything for the hub in one call. */
  overview: authedQuery.query(async ({ ctx }) => {
    const db = getDb(); const uid = ctx.user.id;
    const meds = (await db.all(sql`SELECT * FROM health_meds WHERE userId=${uid} ORDER BY active DESC, name`)) as any[];
    const supplements = (await db.all(sql`SELECT * FROM health_supplements WHERE userId=${uid} ORDER BY taking DESC, name`)) as any[];
    const conditions = (await db.all(sql`SELECT * FROM health_conditions WHERE userId=${uid} ORDER BY active DESC, kind, name`)) as any[];
    const vitals = (await db.all(sql`SELECT * FROM health_vitals WHERE userId=${uid} ORDER BY measuredAt DESC LIMIT 200`)) as any[];
    const labs = (await db.all(sql`SELECT * FROM health_labs WHERE userId=${uid} ORDER BY measuredAt DESC LIMIT 300`)) as any[];
    return { meds, supplements, conditions, vitals, labs };
  }),

  // ───── Medications ─────
  medUpsert: authedQuery
    .input(z.object({ id: z.number().optional(), name: z.string().min(1).max(200), dose: z.string().max(120).optional(), schedule: z.string().max(200).optional(), prescriber: z.string().max(120).optional(), purpose: z.string().max(300).optional(), active: z.boolean().default(true), notes: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE health_meds SET name=${input.name}, dose=${input.dose ?? null}, schedule=${input.schedule ?? null}, prescriber=${input.prescriber ?? null}, purpose=${input.purpose ?? null}, active=${input.active ? 1 : 0}, notes=${input.notes ?? null}, updatedAt=${now} WHERE id=${input.id} AND userId=${uid}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO health_meds (userId, name, dose, schedule, prescriber, purpose, active, notes, startDate, createdAt, updatedAt)
        VALUES (${uid}, ${input.name}, ${input.dose ?? null}, ${input.schedule ?? null}, ${input.prescriber ?? null}, ${input.purpose ?? null}, ${input.active ? 1 : 0}, ${input.notes ?? null}, ${now}, ${now}, ${now})`);
      return { ok: true };
    }),
  medRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM health_meds WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  // ───── Supplements / vitamins ─────
  supplementUpsert: authedQuery
    .input(z.object({ id: z.number().optional(), name: z.string().min(1).max(200), dose: z.string().max(120).optional(), reason: z.string().max(400).optional(), taking: z.boolean().default(true), notes: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE health_supplements SET name=${input.name}, dose=${input.dose ?? null}, reason=${input.reason ?? null}, taking=${input.taking ? 1 : 0}, notes=${input.notes ?? null}, updatedAt=${now} WHERE id=${input.id} AND userId=${uid}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO health_supplements (userId, name, dose, reason, taking, notes, createdAt, updatedAt)
        VALUES (${uid}, ${input.name}, ${input.dose ?? null}, ${input.reason ?? null}, ${input.taking ? 1 : 0}, ${input.notes ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),
  supplementRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM health_supplements WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  // ───── Conditions / symptoms / allergies ─────
  conditionUpsert: authedQuery
    .input(z.object({ id: z.number().optional(), name: z.string().min(1).max(200), kind: z.enum(["condition", "symptom", "allergy"]).default("condition"), active: z.boolean().default(true), notes: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE health_conditions SET name=${input.name}, kind=${input.kind}, active=${input.active ? 1 : 0}, notes=${input.notes ?? null}, updatedAt=${now} WHERE id=${input.id} AND userId=${uid}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO health_conditions (userId, name, kind, active, notes, since, createdAt, updatedAt)
        VALUES (${uid}, ${input.name}, ${input.kind}, ${input.active ? 1 : 0}, ${input.notes ?? null}, ${now}, ${now}, ${now})`);
      return { ok: true };
    }),
  conditionRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM health_conditions WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  // ───── Vitals (weight / glucose / BP / HR) ─────
  vitalAdd: authedQuery
    .input(z.object({ type: z.string().min(1).max(40), value: z.number(), unit: z.string().max(20).optional(), measuredAt: z.number().optional(), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const now = Date.now();
      await db.run(sql`INSERT INTO health_vitals (userId, type, value, unit, measuredAt, source, notes, createdAt)
        VALUES (${ctx.user.id}, ${input.type}, ${input.value}, ${input.unit ?? null}, ${input.measuredAt ?? now}, 'manual', ${input.notes ?? null}, ${now})`);
      return { ok: true };
    }),
  vitalRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM health_vitals WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  // ───── Bloodwork / labs ─────
  labAdd: authedQuery
    .input(z.object({ panel: z.string().max(120).optional(), marker: z.string().min(1).max(120), value: z.number().optional(), valueText: z.string().max(120).optional(), unit: z.string().max(40).optional(), refLow: z.number().optional(), refHigh: z.number().optional(), measuredAt: z.number().optional(), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const now = Date.now();
      // Auto-flag against the reference range when numeric.
      let flag: string | null = null;
      if (input.value != null) {
        if (input.refLow != null && input.value < input.refLow) flag = "low";
        else if (input.refHigh != null && input.value > input.refHigh) flag = "high";
        else if (input.refLow != null || input.refHigh != null) flag = "normal";
      }
      await db.run(sql`INSERT INTO health_labs (userId, panel, marker, value, valueText, unit, refLow, refHigh, flag, measuredAt, notes, createdAt)
        VALUES (${ctx.user.id}, ${input.panel ?? null}, ${input.marker}, ${input.value ?? null}, ${input.valueText ?? null}, ${input.unit ?? null}, ${input.refLow ?? null}, ${input.refHigh ?? null}, ${flag}, ${input.measuredAt ?? now}, ${input.notes ?? null}, ${now})`);
      return { ok: true };
    }),
  labRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM health_labs WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  /** Bulk import parsed bloodwork rows (the "paste your results" feature). Each
   *  row is auto-flagged against its reference range. Returns how many landed. */
  labImport: authedQuery
    .input(z.object({
      panel: z.string().max(120).optional(),
      rows: z.array(z.object({
        marker: z.string().min(1).max(120),
        value: z.number().optional(),
        valueText: z.string().max(120).optional(),
        unit: z.string().max(40).optional(),
        refLow: z.number().optional(),
        refHigh: z.number().optional(),
      })).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const now = Date.now(); let added = 0;
      for (const r of input.rows) {
        let flag: string | null = null;
        if (r.value != null) {
          if (r.refLow != null && r.value < r.refLow) flag = "low";
          else if (r.refHigh != null && r.value > r.refHigh) flag = "high";
          else if (r.refLow != null || r.refHigh != null) flag = "normal";
        }
        await db.run(sql`INSERT INTO health_labs (userId, panel, marker, value, valueText, unit, refLow, refHigh, flag, measuredAt, createdAt)
          VALUES (${ctx.user.id}, ${input.panel ?? null}, ${r.marker}, ${r.value ?? null}, ${r.valueText ?? null}, ${r.unit ?? null}, ${r.refLow ?? null}, ${r.refHigh ?? null}, ${flag}, ${now}, ${now})`);
        added++;
      }
      return { ok: true, added };
    }),
});
