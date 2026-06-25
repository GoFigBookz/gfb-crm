/**
 * MY LIFE ROUTER — Liv's private life-OS, walled off from all client data.
 * =============================================================================
 * Markie's whole life in one place: Finance, Travel, Health, Growth (+ more as
 * we go). Every query is scoped to ctx.user.id — a user only ever sees their OWN
 * life, and nothing here ever touches the clients table. Sections are config, so
 * adding a new one later is a one-line change, not a rebuild.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { lifeEntries, calendarEvents } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

const safeMeta = (s: any): any => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };

// Section catalogue — the hub's structure. Add a row here to add a section.
export const LIFE_SECTIONS = [
  { key: "finance", title: "Finance", blurb: "Accounts, assets, net worth", money: true,
    types: ["asset", "liability", "account", "income", "expense", "note"] },
  { key: "social", title: "Social", blurb: "Your social calendar — plans & people", money: false,
    types: ["event", "gathering", "date night", "birthday", "trip", "reminder"] },
  { key: "milestones", title: "Milestones", blurb: "Where you want to be — doing & feeling", money: false,
    types: ["doing", "feeling", "aspiration", "milestone", "wish"] },
  { key: "travel", title: "Travel", blurb: "Trips, itineraries, documents", money: false,
    types: ["trip", "flight", "stay", "document", "note"] },
  { key: "health", title: "Health", blurb: "Appointments, metrics, meds", money: false,
    types: ["appointment", "metric", "medication", "provider", "routine", "profile", "document", "note"] },
  { key: "growth", title: "Growth", blurb: "Goals, habits, journal", money: false,
    types: ["goal", "habit", "journal", "note"] },
] as const;

const SECTION_KEYS = LIFE_SECTIONS.map((s) => s.key) as unknown as [string, ...string[]];
const r2 = (n: number) => Math.round(n * 100) / 100;

export const lifeRouter = createRouter({
  // Section catalogue + per-section counts + finance net worth + what's coming up.
  overview: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = (await db.select().from(lifeEntries)
      .where(and(eq(lifeEntries.userId, ctx.user.id), eq(lifeEntries.archived, false)))) as any[];

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.section] = (counts[r.section] || 0) + 1;

    const fin = rows.filter((r) => r.section === "finance" && r.amount != null);
    const netWorth = r2(fin.reduce((s, r) => s + (Number(r.amount) || 0), 0));
    const assets = r2(fin.filter((r) => (Number(r.amount) || 0) > 0).reduce((s, r) => s + Number(r.amount), 0));
    const liabilities = r2(fin.filter((r) => (Number(r.amount) || 0) < 0).reduce((s, r) => s + Number(r.amount), 0));

    const now = Date.now();
    const soon = now + 60 * 86400000;
    const upcoming = rows
      .filter((r) => r.date && new Date(r.date).getTime() >= now - 86400000 && new Date(r.date).getTime() <= soon)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8)
      .map((r) => ({ id: r.id, section: r.section, title: r.title, date: r.date, type: r.type }));

    return {
      sections: LIFE_SECTIONS.map((s) => ({ ...s, count: counts[s.key] || 0 })),
      finance: { netWorth, assets, liabilities },
      upcoming,
    };
  }),

  list: authedQuery
    .input(z.object({ section: z.enum(SECTION_KEYS), includeArchived: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(lifeEntries.userId, ctx.user.id), eq(lifeEntries.section, input.section)];
      if (!input.includeArchived) conds.push(eq(lifeEntries.archived, false));
      return db.select().from(lifeEntries).where(and(...conds))
        .orderBy(desc(lifeEntries.pinned), desc(lifeEntries.createdAt));
    }),

  add: authedQuery
    .input(z.object({
      section: z.enum(SECTION_KEYS),
      type: z.string().max(40).optional(),
      title: z.string().min(1).max(300),
      subtitle: z.string().max(300).optional(),
      amount: z.number().nullable().optional(),
      currency: z.string().max(8).optional(),
      date: z.date().nullable().optional(),
      status: z.string().max(60).optional(),
      notes: z.string().max(5000).optional(),
      meta: z.string().max(8000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const ins = (await db.insert(lifeEntries).values({
        userId: ctx.user.id, section: input.section, type: input.type ?? null,
        title: input.title, subtitle: input.subtitle ?? null,
        amount: input.amount ?? null, currency: input.currency ?? "CAD",
        date: input.date ?? null, status: input.status ?? null,
        notes: input.notes ?? null, meta: input.meta ?? null,
        createdAt: new Date(), updatedAt: new Date(),
      } as any).returning()) as any[];
      const entry = ins[0];

      // Social calendar SYNCS with the main calendar so Liv can manage everything:
      // a dated Social entry creates a linked calendar event (id kept in meta).
      if (input.section === "social" && input.date) {
        const ev = (await db.insert(calendarEvents).values({
          userId: ctx.user.id, title: input.title, startDate: input.date, endDate: input.date,
          isAllDay: true, color: "purple", description: "Phoenix Rising · Social", status: "confirmed",
          createdAt: new Date(), updatedAt: new Date(),
        } as any).returning()) as any[];
        const meta = JSON.stringify({ ...safeMeta(input.meta), calendarEventId: ev[0]?.id });
        await db.update(lifeEntries).set({ meta }).where(and(eq(lifeEntries.id, entry.id), eq(lifeEntries.userId, ctx.user.id)));
        entry.meta = meta;
      }
      return entry;
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(300).optional(),
      subtitle: z.string().max(300).nullable().optional(),
      type: z.string().max(40).nullable().optional(),
      amount: z.number().nullable().optional(),
      date: z.date().nullable().optional(),
      status: z.string().max(60).nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
      meta: z.string().max(8000).nullable().optional(),
      pinned: z.boolean().optional(),
      archived: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...rest } = input;
      const patch: any = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      // Scope to the owner — never let one user touch another's life.
      await db.update(lifeEntries).set(patch)
        .where(and(eq(lifeEntries.id, id), eq(lifeEntries.userId, ctx.user.id)));

      // Keep a linked Social calendar event in sync (title/date).
      if (patch.title !== undefined || patch.date !== undefined) {
        const cur = (await db.select().from(lifeEntries)
          .where(and(eq(lifeEntries.id, id), eq(lifeEntries.userId, ctx.user.id))).limit(1))[0] as any;
        const cid = cur?.section === "social" ? safeMeta(cur.meta).calendarEventId : null;
        if (cid) {
          const evPatch: any = { updatedAt: new Date(), title: cur.title };
          if (cur.date) { evPatch.startDate = cur.date; evPatch.endDate = cur.date; }
          await db.update(calendarEvents).set(evPatch)
            .where(and(eq(calendarEvents.id, cid), eq(calendarEvents.userId, ctx.user.id)));
        }
      }
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Remove the linked Social calendar event too, if any.
      const cur = (await db.select().from(lifeEntries)
        .where(and(eq(lifeEntries.id, input.id), eq(lifeEntries.userId, ctx.user.id))).limit(1))[0] as any;
      const cid = cur?.meta ? safeMeta(cur.meta).calendarEventId : null;
      if (cid) await db.delete(calendarEvents).where(and(eq(calendarEvents.id, cid), eq(calendarEvents.userId, ctx.user.id)));
      await db.delete(lifeEntries)
        .where(and(eq(lifeEntries.id, input.id), eq(lifeEntries.userId, ctx.user.id)));
      return { ok: true };
    }),
});
