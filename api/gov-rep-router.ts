import { z } from "zod";
import { createRouter, staffQuery, seniorQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientGovReps } from "../db/schema";
import { eq } from "drizzle-orm";

export const govRepRouter = createRouter({
  getByClient: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const row = await db.select().from(clientGovReps).where(eq(clientGovReps.clientId, input.clientId)).limit(1);
      return row[0] || null;
    }),

  upsert: seniorQuery
    .input(z.object({
      clientId: z.number(),
      craRepName: z.string().optional(),
      craRepNumber: z.string().optional(),
      craRepPhone: z.string().optional(),
      craRepEmail: z.string().optional(),
      craAuthorizationLevel: z.enum(["level_1", "level_2", "level_3"]).optional(),
      craAuthorizationStart: z.date().optional(),
      craAuthorizationEnd: z.date().optional(),
      irsRepName: z.string().optional(),
      irsRepPtin: z.string().optional(),
      irsRepPhone: z.string().optional(),
      irsRepEmail: z.string().optional(),
      irsRepType: z.enum(["attorney", "cpa", "enrolled_agent", "other"]).optional(),
      irsForm2848Date: z.date().optional(),
      irsForm8821Date: z.date().optional(),
      stateTaxRepName: z.string().optional(),
      stateTaxRepPhone: z.string().optional(),
      stateTaxRepEmail: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(clientGovReps).where(eq(clientGovReps.clientId, input.clientId)).limit(1);

      const values = { ...input, updatedAt: new Date() };

      if (existing[0]) {
        await db.update(clientGovReps).set(values).where(eq(clientGovReps.id, existing[0].id));
        return { success: true, id: existing[0].id };
      } else {
        const result = await db.insert(clientGovReps).values({ ...values, createdAt: new Date() });
        return { success: true, id: Number(result.lastInsertRowid) };
      }
    }),
});
