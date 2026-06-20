import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { intercoPeriods, intercoEntries, clients } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * INTER-COMPANY (interco) JOURNAL TRACKER — staging + review only.
 * Logs monthly cross-entity bill-backs (e.g. 2303851 fronts Motion Invest /
 * Seahorse payroll), gates on "all source txns posted in QBO", and generates a
 * DRAFT settlement JE for Markie to review + post by hand. NEVER posts to QBO
 * (posters stay OFF). Numbers pull from QBO once connected; manual until then.
 */

export type IntercoEntry = { counterpartyClientId: number; amount: number; description?: string | null };
export type JeLine = { account: string; debit: number; credit: number; description: string };

/** Round to cents to avoid float drift in the balance check. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build a balanced DRAFT journal entry from a period's interco entries.
 * Convention: a positive entry amount means the counterparty OWES the payer
 * (payer fronted the cost). In the payer's books that books a Due-from
 * (interco receivable) DEBIT, with the contra (offset account) CREDITed.
 * Negative nets reverse. Accounts come from the period (user-picked, locked
 * chart) — never invented. Returns lines + whether it balances.
 */
export function buildIntercoJe(opts: {
  intercoAccount?: string | null;
  offsetAccount?: string | null;
  entries: IntercoEntry[];
  nameOf: (clientId: number) => string;
}): { lines: JeLine[]; totalDebit: number; totalCredit: number; balanced: boolean; net: number } {
  const interco = opts.intercoAccount?.trim() || "[interco account — select from chart]";
  const offset = opts.offsetAccount?.trim() || "[offset account — select from chart]";

  // Net per counterparty so a month of many lines collapses to one JE line each.
  const byParty = new Map<number, number>();
  for (const e of opts.entries) byParty.set(e.counterpartyClientId, r2((byParty.get(e.counterpartyClientId) ?? 0) + (e.amount || 0)));

  const lines: JeLine[] = [];
  let net = 0;
  for (const [cp, amtRaw] of byParty) {
    const amt = r2(amtRaw);
    if (amt === 0) continue;
    net = r2(net + amt);
    const who = opts.nameOf(cp);
    if (amt > 0) {
      lines.push({ account: interco, debit: amt, credit: 0, description: `Due from ${who} (interco settlement)` });
    } else {
      lines.push({ account: interco, debit: 0, credit: -amt, description: `Due to ${who} (interco settlement)` });
    }
  }
  // Single balancing contra line on the offset account.
  if (net > 0) lines.push({ account: offset, debit: 0, credit: net, description: "Interco bill-back — contra" });
  else if (net < 0) lines.push({ account: offset, debit: -net, credit: 0, description: "Interco bill-back — contra" });

  const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
  return { lines, totalDebit, totalCredit, balanced: totalDebit === totalCredit, net };
}

async function clientNameMap(): Promise<Map<number, string>> {
  const db = getDb();
  const cs = await db.select().from(clients);
  return new Map((cs as any[]).map((c) => [c.id, c.name]));
}

export const intercoRouter = createRouter({
  // Active clients for the entity dropdowns.
  clients: staffQuery.query(async () => {
    const db = getDb();
    const cs = await db.select().from(clients);
    return (cs as any[])
      .filter((c) => c.status !== "churned")
      .map((c) => ({ id: c.id, name: c.name, clientType: c.clientType }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),

  // All periods (newest first), with payer name + a quick entry total.
  listPeriods: staffQuery.query(async () => {
    const db = getDb();
    const periods = await db.select().from(intercoPeriods).orderBy(desc(intercoPeriods.period));
    const entries = await db.select().from(intercoEntries);
    const names = await clientNameMap();
    return (periods as any[]).map((p) => {
      const mine = (entries as any[]).filter((e) => e.period === p.period && e.payerClientId === p.payerClientId);
      const total = r2(mine.reduce((s, e) => s + (e.amount || 0), 0));
      return { ...p, payerName: names.get(p.payerClientId) ?? `#${p.payerClientId}`, entryCount: mine.length, total };
    });
  }),

  // Full detail for one period: record, entries, computed JE + summary.
  getPeriod: staffQuery
    .input(z.object({ period: z.string(), payerClientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [p] = await db.select().from(intercoPeriods)
        .where(and(eq(intercoPeriods.period, input.period), eq(intercoPeriods.payerClientId, input.payerClientId)));
      const entries = await db.select().from(intercoEntries)
        .where(and(eq(intercoEntries.period, input.period), eq(intercoEntries.payerClientId, input.payerClientId)))
        .orderBy(intercoEntries.counterpartyClientId);
      const names = await clientNameMap();
      const withNames = (entries as any[]).map((e) => ({ ...e, counterpartyName: names.get(e.counterpartyClientId) ?? `#${e.counterpartyClientId}` }));
      const je = buildIntercoJe({
        intercoAccount: p?.intercoAccount, offsetAccount: p?.offsetAccount,
        entries: withNames, nameOf: (id) => names.get(id) ?? `#${id}`,
      });
      // Net owed per counterparty (the human-readable summary).
      const byParty = new Map<number, number>();
      for (const e of withNames) byParty.set(e.counterpartyClientId, r2((byParty.get(e.counterpartyClientId) ?? 0) + (e.amount || 0)));
      const summary = Array.from(byParty.entries()).map(([id, amt]) => ({ counterpartyClientId: id, name: names.get(id) ?? `#${id}`, net: r2(amt) }));
      return { period: p ?? null, entries: withNames, je, summary };
    }),

  // Create or update a period header (accounts, notes). Idempotent per (period,payer).
  upsertPeriod: staffQuery
    .input(z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      payerClientId: z.number(),
      intercoAccount: z.string().optional(),
      offsetAccount: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [existing] = await db.select().from(intercoPeriods)
        .where(and(eq(intercoPeriods.period, input.period), eq(intercoPeriods.payerClientId, input.payerClientId)));
      if (existing) {
        await db.update(intercoPeriods).set({
          intercoAccount: input.intercoAccount ?? existing.intercoAccount,
          offsetAccount: input.offsetAccount ?? existing.offsetAccount,
          notes: input.notes ?? existing.notes,
          updatedAt: new Date(),
        }).where(eq(intercoPeriods.id, existing.id));
        return { id: existing.id };
      }
      const [row] = await db.insert(intercoPeriods).values({
        period: input.period, payerClientId: input.payerClientId,
        intercoAccount: input.intercoAccount, offsetAccount: input.offsetAccount, notes: input.notes,
      }).returning();
      return { id: row.id };
    }),

  // Readiness gate: confirm all source txns/Visa statements posted in QBO.
  // (Manual confirm now; auto-checked against QBO once the connection is live.)
  setReadiness: staffQuery
    .input(z.object({ id: z.number(), sourcePosted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [p] = await db.select().from(intercoPeriods).where(eq(intercoPeriods.id, input.id));
      if (!p) throw new Error("Period not found");
      await db.update(intercoPeriods).set({
        sourcePosted: input.sourcePosted,
        sourcePostedBy: input.sourcePosted ? ctx.user.id : null,
        sourcePostedAt: input.sourcePosted ? new Date() : null,
        // Flip status, but never downgrade away from 'posted'.
        status: p.status === "posted" ? "posted" : (input.sourcePosted ? "ready" : "open"),
        updatedAt: new Date(),
      }).where(eq(intercoPeriods.id, input.id));
      return { success: true };
    }),

  // Record that the draft JE was posted in QBO by hand (gate must be green).
  markPosted: staffQuery
    .input(z.object({ id: z.number(), postedJeRef: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [p] = await db.select().from(intercoPeriods).where(eq(intercoPeriods.id, input.id));
      if (!p) throw new Error("Period not found");
      if (!p.sourcePosted) throw new Error("Readiness gate is not green — confirm all source txns are posted in QBO first.");
      await db.update(intercoPeriods).set({ status: "posted", postedJeRef: input.postedJeRef ?? p.postedJeRef, updatedAt: new Date() })
        .where(eq(intercoPeriods.id, input.id));
      return { success: true };
    }),

  addEntry: staffQuery
    .input(z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      payerClientId: z.number(),
      counterpartyClientId: z.number(),
      amount: z.number(),
      description: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Ensure a period header exists so the gate/accounts have somewhere to live.
      const [existing] = await db.select().from(intercoPeriods)
        .where(and(eq(intercoPeriods.period, input.period), eq(intercoPeriods.payerClientId, input.payerClientId)));
      if (!existing) await db.insert(intercoPeriods).values({ period: input.period, payerClientId: input.payerClientId });
      const [row] = await db.insert(intercoEntries).values({
        period: input.period, payerClientId: input.payerClientId, counterpartyClientId: input.counterpartyClientId,
        amount: input.amount, description: input.description, category: input.category,
        source: "manual", createdBy: ctx.user.id,
      }).returning();
      return { id: row.id };
    }),

  deleteEntry: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(intercoEntries).where(eq(intercoEntries.id, input.id));
      return { success: true };
    }),
});
