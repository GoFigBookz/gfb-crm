import { z } from "zod";
import { createRouter, staffQuery, seniorQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientVault } from "../db/schema";
import { eq } from "drizzle-orm";

function maskField(value: string | null, visible = 4): string | null {
  if (!value) return null;
  if (value.length <= visible) return value;
  return "*".repeat(value.length - visible) + value.slice(-visible);
}

export const vaultRouter = createRouter({
  getByClient: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const row = await db.select().from(clientVault).where(eq(clientVault.clientId, input.clientId)).limit(1);
      if (!row[0]) return null;

      const isJunior = ctx.user.role === "junior_bookkeeper";
      const data = row[0];

      if (isJunior) {
        // Mask sensitive fields for junior bookkeepers
        return {
          ...data,
          bankAccountNumber: maskField(data.bankAccountNumber),
          bankRoutingNumber: maskField(data.bankRoutingNumber),
          bankTransitNumber: maskField(data.bankTransitNumber),
          bankLogin: maskField(data.bankLogin, 2),
          bankPassword: "****",
          creditCardNumber: maskField(data.creditCardNumber, 4),
          creditCardCvv: "***",
          qboLogin: maskField(data.qboLogin, 2),
          qboPassword: "****",
          xeroLogin: maskField(data.xeroLogin, 2),
          xeroPassword: "****",
          waveLogin: maskField(data.waveLogin, 2),
          wavePassword: "****",
          freshbooksLogin: maskField(data.freshbooksLogin, 2),
          freshbooksPassword: "****",
          craMyAccountLogin: maskField(data.craMyAccountLogin, 2),
          craMyAccountPassword: "****",
          irsLogin: maskField(data.irsLogin, 2),
          irsPassword: "****",
        };
      }

      return data;
    }),

  upsert: seniorQuery
    .input(z.object({
      clientId: z.number(),
      bankName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankRoutingNumber: z.string().optional(),
      bankTransitNumber: z.string().optional(),
      bankBranch: z.string().optional(),
      bankLogin: z.string().optional(),
      bankPassword: z.string().optional(),
      creditCardNumber: z.string().optional(),
      creditCardExpiry: z.string().optional(),
      creditCardCvv: z.string().optional(),
      qboLogin: z.string().optional(),
      qboPassword: z.string().optional(),
      xeroLogin: z.string().optional(),
      xeroPassword: z.string().optional(),
      waveLogin: z.string().optional(),
      wavePassword: z.string().optional(),
      freshbooksLogin: z.string().optional(),
      freshbooksPassword: z.string().optional(),
      otherSoftwareLogins: z.string().optional(),
      craMyAccountLogin: z.string().optional(),
      craMyAccountPassword: z.string().optional(),
      craRepId: z.string().optional(),
      craAuthorizationDate: z.date().optional(),
      irsLogin: z.string().optional(),
      irsPassword: z.string().optional(),
      irsCafNumber: z.string().optional(),
      irsPowerOfAttorneyDate: z.date().optional(),
      vaultNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.select().from(clientVault).where(eq(clientVault.clientId, input.clientId)).limit(1);

      const values = { ...input, lastUpdatedBy: ctx.user.id, updatedAt: new Date() };

      if (existing[0]) {
        await db.update(clientVault).set(values).where(eq(clientVault.id, existing[0].id));
        return { success: true, id: existing[0].id };
      } else {
        const result = await db.insert(clientVault).values({ ...values, createdAt: new Date() });
        return { success: true, id: Number(result.lastInsertRowid) };
      }
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(clientVault).where(eq(clientVault.id, input.id));
      return { success: true };
    }),
});
