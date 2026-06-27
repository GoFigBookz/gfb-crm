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

  // ───────── Side Sales (resale side business; Skye markets it) ─────────
  sideOverview: authedQuery.query(async ({ ctx }) => {
    const db = getDb(); const uid = ctx.user.id;
    const products = (await db.all(sql`SELECT * FROM side_products WHERE userId=${uid} AND active=1 ORDER BY name`)) as any[];
    const sales = (await db.all(sql`SELECT * FROM side_sales WHERE userId=${uid} ORDER BY soldAt DESC LIMIT 200`)) as any[];
    // Per-product sold qty + revenue, and overall totals.
    const soldByProduct: Record<number, { units: number; revenue: number }> = {};
    let totalUnits = 0, totalRevenue = 0;
    for (const s of sales) {
      const r = (soldByProduct[s.productId] ||= { units: 0, revenue: 0 });
      r.units += Number(s.qty) || 0; r.revenue += (Number(s.qty) || 0) * (Number(s.unitPrice) || 0);
      totalUnits += Number(s.qty) || 0; totalRevenue += (Number(s.qty) || 0) * (Number(s.unitPrice) || 0);
    }
    return { products, sales, soldByProduct, totals: { totalUnits, totalRevenue } };
  }),
  sideProductUpsert: authedQuery
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(200),
      category: z.string().max(80).optional(),
      qtyOnHand: z.number().int().default(0),
      givenAway: z.number().int().default(0),
      unitCost: z.number().default(0),
      minPrice: z.number().default(0),
      targetPrice: z.number().default(0),
      discreet: z.boolean().default(false),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE side_products SET name=${input.name}, category=${input.category ?? null}, qtyOnHand=${input.qtyOnHand}, givenAway=${input.givenAway}, unitCost=${input.unitCost}, minPrice=${input.minPrice}, targetPrice=${input.targetPrice}, discreet=${input.discreet ? 1 : 0}, notes=${input.notes ?? null}, updatedAt=${now} WHERE id=${input.id} AND userId=${uid}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO side_products (userId, name, category, qtyOnHand, givenAway, unitCost, minPrice, targetPrice, discreet, notes, createdAt, updatedAt)
        VALUES (${uid}, ${input.name}, ${input.category ?? null}, ${input.qtyOnHand}, ${input.givenAway}, ${input.unitCost}, ${input.minPrice}, ${input.targetPrice}, ${input.discreet ? 1 : 0}, ${input.notes ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),
  sideProductRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`UPDATE side_products SET active=0 WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),
  /** Log a sale and decrement on-hand stock. */
  sideSaleAdd: authedQuery
    .input(z.object({ productId: z.number(), qty: z.number().int().min(1).default(1), unitPrice: z.number().min(0), channel: z.string().max(80).optional(), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      await db.run(sql`INSERT INTO side_sales (userId, productId, qty, unitPrice, channel, soldAt, notes, createdAt)
        VALUES (${uid}, ${input.productId}, ${input.qty}, ${input.unitPrice}, ${input.channel ?? null}, ${now}, ${input.notes ?? null}, ${now})`);
      await db.run(sql`UPDATE side_products SET qtyOnHand = MAX(qtyOnHand - ${input.qty}, 0), updatedAt=${now} WHERE id=${input.productId} AND userId=${uid}`);
      return { ok: true };
    }),
  sideSaleRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM side_sales WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  // ───────── Reseller engine — Skye-drafted listings (draft → paste-and-post) ─────────
  /** Draft channel-tailored listings for a product (cheap workhorse model; never posts). */
  generateListing: authedQuery
    .input(z.object({ productId: z.number(), channels: z.array(z.string()).max(6).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      const p = ((await db.all(sql`SELECT * FROM side_products WHERE id=${input.productId} AND userId=${uid} LIMIT 1`)) as any[])[0];
      if (!p) return { ok: false as const, error: "product_not_found" };
      const { generateListings } = await import("./listing-generator");
      const drafts = await generateListings(
        { name: p.name, category: p.category, condition: null, minPrice: p.minPrice, targetPrice: p.targetPrice, discreet: !!p.discreet, notes: p.notes },
        input.channels ?? ["marketplace", "kijiji", "ebay"],
      );
      for (const d of drafts) {
        await db.run(sql`INSERT INTO side_listings (userId, productId, channel, title, body, price, hashtags, status, createdAt)
          VALUES (${uid}, ${input.productId}, ${d.channel}, ${d.title}, ${d.body}, ${d.price ?? null}, ${d.hashtags}, 'draft', ${now})`);
      }
      return { ok: true as const, count: drafts.length };
    }),
  /** Listings for a product (most recent first). */
  listings: authedQuery.input(z.object({ productId: z.number() })).query(async ({ ctx, input }) => {
    return (await getDb().all(sql`SELECT * FROM side_listings WHERE productId=${input.productId} AND userId=${ctx.user.id} ORDER BY id DESC`)) as any[];
  }),
  listingSetStatus: authedQuery.input(z.object({ id: z.number(), status: z.enum(["draft", "listed"]) })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`UPDATE side_listings SET status=${input.status} WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),
  listingRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM side_listings WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),

  // ───────── Trading bot — OVERSIGHT (track + flag, not manage) ─────────
  tradingOverview: authedQuery.query(async ({ ctx }) => {
    const db = getDb(); const uid = ctx.user.id;
    const cfg = ((await db.all(sql`SELECT * FROM trading_config WHERE userId=${uid} LIMIT 1`)) as any[])[0] || null;
    const snaps = (await db.all(sql`SELECT * FROM trading_snapshots WHERE userId=${uid} ORDER BY takenAt ASC LIMIT 365`)) as any[];
    let peak = 0, current = 0, drawdownPct = 0;
    if (snaps.length) {
      for (const s of snaps) peak = Math.max(peak, Number(s.equity) || 0);
      current = Number(snaps[snaps.length - 1].equity) || 0;
      drawdownPct = peak > 0 ? Math.max(0, (peak - current) / peak * 100) : 0;
    }
    const start = Number(cfg?.startingCapital) || (snaps[0] ? Number(snaps[0].equity) : 0);
    const totalReturn = start > 0 ? (current - start) / start * 100 : 0;
    const maxDD = Number(cfg?.maxDrawdownPct) || 20;
    return { cfg, snaps, current, peak, drawdownPct, totalReturn, start, maxDD, breach: drawdownPct > maxDD };
  }),
  tradingConfigSet: authedQuery
    .input(z.object({ name: z.string().max(120).optional(), strategy: z.string().max(2000).optional(), startingCapital: z.number().default(0), maxDrawdownPct: z.number().default(20), rules: z.string().max(4000).optional(), notes: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const uid = ctx.user.id; const now = Date.now();
      const exists = ((await db.all(sql`SELECT userId FROM trading_config WHERE userId=${uid} LIMIT 1`)) as any[])[0];
      if (exists) {
        await db.run(sql`UPDATE trading_config SET name=${input.name ?? null}, strategy=${input.strategy ?? null}, startingCapital=${input.startingCapital}, maxDrawdownPct=${input.maxDrawdownPct}, rules=${input.rules ?? null}, notes=${input.notes ?? null}, updatedAt=${now} WHERE userId=${uid}`);
      } else {
        await db.run(sql`INSERT INTO trading_config (userId, name, strategy, startingCapital, maxDrawdownPct, rules, notes, updatedAt)
          VALUES (${uid}, ${input.name ?? null}, ${input.strategy ?? null}, ${input.startingCapital}, ${input.maxDrawdownPct}, ${input.rules ?? null}, ${input.notes ?? null}, ${now})`);
      }
      return { ok: true };
    }),
  tradingSnapshotAdd: authedQuery
    .input(z.object({ equity: z.number(), pnl: z.number().optional(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      await getDb().run(sql`INSERT INTO trading_snapshots (userId, equity, pnl, note, takenAt, createdAt)
        VALUES (${ctx.user.id}, ${input.equity}, ${input.pnl ?? null}, ${input.note ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),
  tradingSnapshotRemove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    await getDb().run(sql`DELETE FROM trading_snapshots WHERE id=${input.id} AND userId=${ctx.user.id}`); return { ok: true };
  }),
});
