/**
 * FIRM SUBSCRIPTIONS ROUTER — what Markie bills each client vs his cost (margin).
 * "We need to know what I'm billing, what my cost is." Senior-gated. Raw SQL.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export const subscriptionsRouter = createRouter({
  list: authedQuery.query(async () => {
    const db = getDb();
    const rows = (await db.all(sql`
      SELECT s.*, c.company AS clientCompany, c.name AS clientName
      FROM firm_subscriptions s LEFT JOIN clients c ON c.id = s.clientId
      WHERE s.active = 1 ORDER BY COALESCE(c.company, c.name, s.label)`)) as any[];
    let cost = 0, billed = 0;
    for (const r of rows) { cost += Number(r.monthlyCost) || 0; billed += Number(r.monthlyBilled) || 0; }
    return { rows, totals: { monthlyCost: cost, monthlyBilled: billed, monthlyMargin: billed - cost, annualMargin: (billed - cost) * 12 } };
  }),

  upsert: authedQuery
    .input(z.object({
      id: z.number().optional(),
      clientId: z.number().nullable().optional(),
      label: z.string().min(1).max(160),
      provider: z.string().max(60).default("QuickBooks"),
      tier: z.string().max(60).optional(),
      monthlyCost: z.number().default(0),
      monthlyBilled: z.number().default(0),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb(); const now = Date.now();
      if (input.id) {
        await db.run(sql`UPDATE firm_subscriptions SET clientId=${input.clientId ?? null}, label=${input.label}, provider=${input.provider}, tier=${input.tier ?? null}, monthlyCost=${input.monthlyCost}, monthlyBilled=${input.monthlyBilled}, notes=${input.notes ?? null}, updatedAt=${now} WHERE id=${input.id}`);
        return { ok: true, id: input.id };
      }
      await db.run(sql`INSERT INTO firm_subscriptions (clientId, label, provider, tier, monthlyCost, monthlyBilled, notes, createdAt, updatedAt)
        VALUES (${input.clientId ?? null}, ${input.label}, ${input.provider}, ${input.tier ?? null}, ${input.monthlyCost}, ${input.monthlyBilled}, ${input.notes ?? null}, ${now}, ${now})`);
      return { ok: true };
    }),

  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await getDb().run(sql`UPDATE firm_subscriptions SET active=0 WHERE id=${input.id}`);
    return { ok: true };
  }),
});
