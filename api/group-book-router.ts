import { z } from "zod";
import crypto from "crypto";
import { createRouter, staffQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { groupEntities, groupOwnership, groupProfit, groupFamilyBenefit, groupBookShareLinks } from "../db/schema";
import { eq, desc } from "drizzle-orm";

const r2x = (n: number) => Math.round(n * 100) / 100;

/** Shared builder used by both the staff view and the public (token) view. */
async function buildBook(groupName: string, fiscalYear?: string) {
  const db = getDb();
  const g = groupName;
  const [entities, ownership, profit, family] = await Promise.all([
    db.select().from(groupEntities).where(eq(groupEntities.groupName, g)),
    db.select().from(groupOwnership).where(eq(groupOwnership.groupName, g)),
    db.select().from(groupProfit).where(eq(groupProfit.groupName, g)),
    db.select().from(groupFamilyBenefit).where(eq(groupFamilyBenefit.groupName, g)),
  ]) as any[][];

  const ent = (entities as any[]).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const own = ownership as any[];
  const prof = profit as any[];

  const years = Array.from(new Set(prof.map((p) => p.fiscalYear))).sort().reverse();
  const fy = fiscalYear && years.includes(fiscalYear) ? fiscalYear : years[0];
  const fyProfit = prof.filter((p) => p.fiscalYear === fy);

  const ownByCo = new Map<string, any[]>();
  for (const o of own) {
    if (!ownByCo.has(o.companyName)) ownByCo.set(o.companyName, []);
    ownByCo.get(o.companyName)!.push(o);
  }
  const byHolder = new Map<string, { name: string; type: string; total: number; lines: { company: string; pct: number; amount: number }[] }>();
  let attributed = 0;
  for (const p of fyProfit) {
    for (const h of ownByCo.get(p.companyName) || []) {
      if (h.ownershipPct == null) continue;
      const amount = r2x((Number(p.ytdProfit) || 0) * (Number(h.ownershipPct) / 100));
      attributed += amount;
      if (!byHolder.has(h.holderName)) byHolder.set(h.holderName, { name: h.holderName, type: h.holderType, total: 0, lines: [] });
      const rec = byHolder.get(h.holderName)!;
      rec.total = r2x(rec.total + amount);
      rec.lines.push({ company: p.companyName, pct: Number(h.ownershipPct), amount });
    }
  }
  const dividendByPerson = Array.from(byHolder.values()).sort((a, b) => b.total - a.total);
  const unattributed = r2x(fyProfit.reduce((s, p) => s + (Number(p.ytdProfit) || 0), 0) - attributed);

  const iscMap = new Map<string, { name: string; companies: { company: string; pct: number; note?: string }[] }>();
  for (const o of own) {
    if (o.holderType !== "individual" || o.ownershipPct == null || o.ownershipPct < 25) continue;
    if (!iscMap.has(o.holderName)) iscMap.set(o.holderName, { name: o.holderName, companies: [] });
    iscMap.get(o.holderName)!.companies.push({ company: o.companyName, pct: Number(o.ownershipPct), note: o.note || undefined });
  }
  const beneficialOwners = Array.from(iscMap.values()).sort((a, b) => b.companies.length - a.companies.length);

  return {
    groupName: g,
    entities: ent,
    ownership: own,
    family: family as any[],
    fiscalYears: years,
    fiscalYear: fy,
    profit: fyProfit.sort((a, b) => (Number(b.ytdProfit) || 0) - (Number(a.ytdProfit) || 0)),
    fyTotals: {
      ytdProfit: r2x(fyProfit.reduce((s, p) => s + (Number(p.ytdProfit) || 0), 0)),
      taxLiability: r2x(fyProfit.reduce((s, p) => s + (Number(p.taxLiability) || 0), 0)),
    },
    dividendByPerson,
    unattributed,
    beneficialOwners,
  };
}

/**
 * GROUP CONTROL BOOK — read surface that recreates a multi-company owner's control
 * book (entities / cap table / dividend-profit / family benefit) and DERIVES the
 * pieces Jon does by hand: a per-person dividend report (profit × ownership) and an
 * Individuals-with-Significant-Control (ISC ≥25%) register. Read-only; seeded from
 * the shared book, editable later. Nothing posts.
 */
export const groupBookRouter = createRouter({
  // Which groups have a control book seeded (for a "view book" affordance).
  groups: staffQuery.query(async () => {
    const db = getDb();
    const rows = (await db.select().from(groupEntities)) as any[];
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.groupName, (m.get(r.groupName) || 0) + 1);
    return Array.from(m.entries()).map(([name, entities]) => ({ name, entities }));
  }),

  get: staffQuery
    .input(z.object({ groupName: z.string(), fiscalYear: z.string().optional() }))
    .query(async ({ input }) => buildBook(input.groupName, input.fiscalYear)),

  // ===== Share links (read-only owner view) =====
  shareList: staffQuery
    .input(z.object({ groupName: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(groupBookShareLinks).where(eq(groupBookShareLinks.groupName, input.groupName)).orderBy(desc(groupBookShareLinks.createdAt));
    }),

  shareCreate: staffQuery
    .input(z.object({ groupName: z.string(), label: z.string().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const token = `gb_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(groupBookShareLinks).values({ groupName: input.groupName, token, label: input.label ?? null, active: true, createdBy: ctx.user.id } as any);
      return { ok: true, token };
    }),

  shareRevoke: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(groupBookShareLinks).set({ active: false, revokedAt: new Date() }).where(eq(groupBookShareLinks.id, input.id));
      return { ok: true };
    }),

  // ===== PUBLIC (token-gated, read-only) =====
  publicView: publicQuery
    .input(z.object({ token: z.string().min(6), fiscalYear: z.string().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const link = (await db.select().from(groupBookShareLinks).where(eq(groupBookShareLinks.token, input.token)).limit(1))[0] as any;
      if (!link || !link.active) return null;
      const book = await buildBook(link.groupName, input.fiscalYear);
      return { label: link.label ?? null, generatedAt: new Date().toISOString(), ...book };
    }),
});
