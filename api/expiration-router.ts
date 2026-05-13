import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { signatureDocuments, engagementLetters, clients } from "../db/schema";
import { eq, and, lte, gte, isNotNull } from "drizzle-orm";

export const expirationRouter = createRouter({
  // Get documents expiring in the next N days
  getExpiringSoon: staffQuery
    .input(z.object({ days: z.number().min(1).max(365).optional().default(30) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const days = input?.days ?? 30;

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + days);

      // Signature documents expiring
      const sigDocs = await db
        .select()
        .from(signatureDocuments)
        .where(
          and(
            isNotNull(signatureDocuments.expiresAt),
            gte(signatureDocuments.expiresAt, now),
            lte(signatureDocuments.expiresAt, futureDate)
          )
        );

      // Engagement letters expiring
      const letters = await db
        .select()
        .from(engagementLetters)
        .where(
          and(
            isNotNull(engagementLetters.endDate),
            gte(engagementLetters.endDate, now),
            lte(engagementLetters.endDate, futureDate)
          )
        );

      // Get client names
      const clientIds = [...new Set([
        ...sigDocs.map((d) => d.clientId),
        ...letters.map((l) => l.clientId),
      ])];

      const clientMap: Record<number, string> = {};
      for (const cid of clientIds) {
        const rows = await db.select().from(clients).where(eq(clients.id, cid)).limit(1);
        if (rows[0]) clientMap[cid] = rows[0].name;
      }

      const sigResults = sigDocs.map((d) => ({
        id: d.id,
        type: "signature" as const,
        title: d.title,
        clientId: d.clientId,
        clientName: clientMap[d.clientId] || "Unknown",
        documentType: d.documentType,
        status: d.status,
        expiresAt: d.expiresAt,
        daysRemaining: d.expiresAt ? Math.ceil((new Date(d.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      }));

      const letterResults = letters.map((l) => ({
        id: l.id,
        type: "engagement" as const,
        title: l.title,
        clientId: l.clientId,
        clientName: clientMap[l.clientId] || "Unknown",
        documentType: "engagement_letter",
        status: l.status,
        expiresAt: l.endDate,
        daysRemaining: l.endDate ? Math.ceil((new Date(l.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      }));

      const allDocs = [...sigResults, ...letterResults].sort(
        (a, b) => (a.daysRemaining || 999) - (b.daysRemaining || 999)
      );

      return {
        total: allDocs.length,
        critical: allDocs.filter((d) => d.daysRemaining <= 7).length,
        warning: allDocs.filter((d) => d.daysRemaining > 7 && d.daysRemaining <= 14).length,
        items: allDocs,
      };
    }),
});
