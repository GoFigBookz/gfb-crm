import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dividendPayments, clients } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { encryptSecret, decryptSecret, checkRevealCode } from "./sensitive";
import { buildT5Slip } from "./dividend-core";

/** Drop the encrypted recipient SIN from responses. */
function stripSin(row: any) {
  const { recipientSin, ...rest } = row;
  return { ...rest, hasSin: !!recipientSin };
}

export const dividendRouter = createRouter({
  list: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(dividendPayments)
        .where(eq(dividendPayments.clientId, input.clientId))
        .orderBy(desc(dividendPayments.paymentDate));
      return (rows as any[]).map(stripSin);
    }),

  add: staffQuery
    .input(z.object({
      clientId: z.number(),
      paymentDate: z.date().optional(),
      recipient: z.string().optional(),
      recipientSin: z.string().optional(),
      amount: z.number().default(0),
      dividendType: z.enum(["eligible", "non_eligible"]).default("non_eligible"),
      taxYear: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { recipientSin, ...rest } = input;
      const [row] = await db.insert(dividendPayments).values({
        ...rest,
        recipientSin: recipientSin ? encryptSecret(recipientSin) : null, // encrypted at rest
        paymentDate: input.paymentDate ?? new Date(),
        taxYear: input.taxYear ?? (input.paymentDate ?? new Date()).getFullYear(),
        createdAt: new Date(),
      }).returning();
      return stripSin(row);
    }),

  delete: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(dividendPayments).where(eq(dividendPayments.id, input.id));
      return { success: true };
    }),

  // Per-recipient T5 slips for a tax year: aggregate eligible + non-eligible
  // dividends and compute the gross-up + DTC boxes. SIN is NOT included (use
  // revealRecipientSin to fill it on the printed slip).
  t5Slips: staffQuery
    .input(z.object({ clientId: z.number(), year: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const year = input.year ?? new Date().getFullYear();
      const rows = (await db.select().from(dividendPayments).where(eq(dividendPayments.clientId, input.clientId))) as any[];
      const inYear = rows.filter((r) => (r.taxYear ?? new Date(r.paymentDate).getFullYear()) === year);
      const byRecipient = new Map<string, { eligible: number; nonEligible: number; hasSin: boolean }>();
      for (const r of inYear) {
        const key = (r.recipient || "(unnamed)").trim();
        const agg = byRecipient.get(key) || { eligible: 0, nonEligible: 0, hasSin: false };
        if (r.dividendType === "eligible") agg.eligible += r.amount || 0; else agg.nonEligible += r.amount || 0;
        if (r.recipientSin) agg.hasSin = true;
        byRecipient.set(key, agg);
      }
      const payer = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      const slips = Array.from(byRecipient.entries()).map(([recipient, a]) => ({
        recipient, hasSin: a.hasSin, ...buildT5Slip(a.eligible, a.nonEligible),
      })).sort((x, y) => x.recipient.localeCompare(y.recipient));
      return {
        year,
        payer: payer ? { name: payer.company || payer.name, address: payer.address || "", bn: payer.taxId || "" } : null,
        slips,
      };
    }),

  // Code-gated reveal of a recipient's SIN for the T5 slip (latest entry with a
  // SIN for that recipient in the year). Requires FIGGY_SIN_PIN.
  revealRecipientSin: staffQuery
    .input(z.object({ clientId: z.number(), recipient: z.string(), code: z.string() }))
    .mutation(async ({ input }) => {
      const gate = checkRevealCode(input.code);
      if (!gate.ok) return { ok: false as const, reason: gate.reason };
      const db = getDb();
      const rows = (await db.select().from(dividendPayments)
        .where(and(eq(dividendPayments.clientId, input.clientId), eq(dividendPayments.recipient, input.recipient)))) as any[];
      const withSin = rows.find((r) => r.recipientSin);
      return { ok: true as const, sin: withSin?.recipientSin ? decryptSecret(withSin.recipientSin) : null };
    }),
});
