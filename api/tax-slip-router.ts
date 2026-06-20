import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { taxSlipEntries, clients } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { encryptSecret, decryptSecret, checkRevealCode } from "./sensitive";

/** Drop the encrypted recipient BN/SIN from responses. */
function strip(row: any) {
  const { recipientId, ...rest } = row;
  return { ...rest, hasRecipientId: !!recipientId };
}

/** T4A (contractor fees, box 048) and T5018 (construction subcontractor
 *  payments) manual slip entries + printable aggregation. */
export const taxSlipRouter = createRouter({
  list: staffQuery
    .input(z.object({ clientId: z.number(), slipType: z.enum(["t4a", "t5018"]) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(taxSlipEntries)
        .where(and(eq(taxSlipEntries.clientId, input.clientId), eq(taxSlipEntries.slipType, input.slipType)))
        .orderBy(desc(taxSlipEntries.taxYear));
      return (rows as any[]).map(strip);
    }),

  add: staffQuery
    .input(z.object({
      clientId: z.number(),
      slipType: z.enum(["t4a", "t5018"]),
      recipient: z.string().optional(),
      recipientId: z.string().optional(),
      amount: z.number().default(0),
      taxYear: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { recipientId, ...rest } = input;
      const [row] = await db.insert(taxSlipEntries).values({
        ...rest,
        recipientId: recipientId ? encryptSecret(recipientId) : null,
        taxYear: input.taxYear ?? new Date().getFullYear(),
        createdAt: new Date(),
      }).returning();
      return strip(row);
    }),

  delete: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(taxSlipEntries).where(eq(taxSlipEntries.id, input.id));
      return { success: true };
    }),

  // Per-recipient aggregated slips for a year (no recipient ID).
  slips: staffQuery
    .input(z.object({ clientId: z.number(), slipType: z.enum(["t4a", "t5018"]), year: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const year = input.year ?? new Date().getFullYear();
      const rows = (await db.select().from(taxSlipEntries)
        .where(and(eq(taxSlipEntries.clientId, input.clientId), eq(taxSlipEntries.slipType, input.slipType)))) as any[];
      const inYear = rows.filter((r) => (r.taxYear ?? new Date(r.createdAt).getFullYear()) === year);
      const byRecipient = new Map<string, { amount: number; hasId: boolean }>();
      for (const r of inYear) {
        const key = (r.recipient || "(unnamed)").trim();
        const agg = byRecipient.get(key) || { amount: 0, hasId: false };
        agg.amount += r.amount || 0;
        if (r.recipientId) agg.hasId = true;
        byRecipient.set(key, agg);
      }
      const payer = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      const slips = Array.from(byRecipient.entries())
        .map(([recipient, a]) => ({ recipient, amount: Math.round((a.amount + Number.EPSILON) * 100) / 100, hasId: a.hasId }))
        .sort((x, y) => x.recipient.localeCompare(y.recipient));
      return {
        year, slipType: input.slipType,
        payer: payer ? { name: payer.company || payer.name, address: payer.address || "", bn: payer.taxId || "" } : null,
        slips,
      };
    }),

  // Code-gated reveal of a recipient's BN/SIN for printing.
  revealRecipientId: staffQuery
    .input(z.object({ clientId: z.number(), slipType: z.enum(["t4a", "t5018"]), recipient: z.string(), code: z.string() }))
    .mutation(async ({ input }) => {
      const gate = checkRevealCode(input.code);
      if (!gate.ok) return { ok: false as const, reason: gate.reason };
      const db = getDb();
      const rows = (await db.select().from(taxSlipEntries).where(and(
        eq(taxSlipEntries.clientId, input.clientId),
        eq(taxSlipEntries.slipType, input.slipType),
        eq(taxSlipEntries.recipient, input.recipient),
      ))) as any[];
      const withId = rows.find((r) => r.recipientId);
      return { ok: true as const, recipientId: withId?.recipientId ? decryptSecret(withId.recipientId) : null };
    }),
});
