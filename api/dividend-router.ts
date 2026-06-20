import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { dividendPayments } from "../db/schema";
import { eq, desc } from "drizzle-orm";

/** Dividend log — records shareholder dividend payments per client. Feeds the
 *  Compliance tab + the T5 filing reminder (triggered by the client's
 *  "Dividends" payroll feature). */
export const dividendRouter = createRouter({
  list: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(dividendPayments)
        .where(eq(dividendPayments.clientId, input.clientId))
        .orderBy(desc(dividendPayments.paymentDate));
    }),

  add: staffQuery
    .input(z.object({
      clientId: z.number(),
      paymentDate: z.date().optional(),
      recipient: z.string().optional(),
      amount: z.number().default(0),
      dividendType: z.enum(["eligible", "non_eligible"]).default("non_eligible"),
      taxYear: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [row] = await db.insert(dividendPayments).values({
        ...input,
        paymentDate: input.paymentDate ?? new Date(),
        taxYear: input.taxYear ?? (input.paymentDate ?? new Date()).getFullYear(),
        createdAt: new Date(),
      }).returning();
      return row;
    }),

  delete: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(dividendPayments).where(eq(dividendPayments.id, input.id));
      return { success: true };
    }),
});
