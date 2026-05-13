import { z } from "zod";
import { createRouter, staffQuery, seniorQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { engagementLetters } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export const engagementLetterRouter = createRouter({
  list: staffQuery
    .input(z.object({ clientId: z.number() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      if (input?.clientId) {
        return db.select().from(engagementLetters).where(eq(engagementLetters.clientId, input.clientId)).orderBy(desc(engagementLetters.createdAt));
      }
      return db.select().from(engagementLetters).orderBy(desc(engagementLetters.createdAt));
    }),

  get: staffQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const row = await db.select().from(engagementLetters).where(eq(engagementLetters.id, input.id)).limit(1);
      return row[0] || null;
    }),

  create: seniorQuery
    .input(z.object({
      clientId: z.number(),
      templateName: z.string().optional(),
      title: z.string().min(1),
      content: z.string().min(1),
      monthlyFee: z.number().optional(),
      hourlyRate: z.number().optional(),
      retainerAmount: z.number().optional(),
      servicesIncluded: z.string().optional(),
      servicesExcluded: z.string().optional(),
      termStart: z.date().optional(),
      termEnd: z.date().optional(),
      autoRenew: z.boolean().optional(),
      renewalNoticeDays: z.number().optional(),
      jurisdiction: z.string().optional(),
      governingLaw: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.insert(engagementLetters).values({
        ...input,
        sentBy: ctx.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { success: true, id: Number(result.lastInsertRowid) };
    }),

  update: seniorQuery
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      monthlyFee: z.number().optional(),
      hourlyRate: z.number().optional(),
      retainerAmount: z.number().optional(),
      servicesIncluded: z.string().optional(),
      servicesExcluded: z.string().optional(),
      termStart: z.date().optional(),
      termEnd: z.date().optional(),
      autoRenew: z.boolean().optional(),
      renewalNoticeDays: z.number().optional(),
      jurisdiction: z.string().optional(),
      governingLaw: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const db = getDb();
      await db.update(engagementLetters).set({ ...data, updatedAt: new Date() }).where(eq(engagementLetters.id, id));
      return { success: true };
    }),

  send: seniorQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(engagementLetters)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(eq(engagementLetters.id, input.id));
      return { success: true };
    }),

  markSigned: seniorQuery
    .input(z.object({ id: z.number(), signedBy: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(engagementLetters)
        .set({ status: "signed", signedAt: new Date(), signedBy: input.signedBy, updatedAt: new Date() })
        .where(eq(engagementLetters.id, input.id));
      return { success: true };
    }),

  delete: seniorQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(engagementLetters).where(eq(engagementLetters.id, input.id));
      return { success: true };
    }),
});
