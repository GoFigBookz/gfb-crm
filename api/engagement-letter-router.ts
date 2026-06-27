import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, engagementLetters } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

// Engagement Letter PDF Generator
export const engagementLetterRouter = createRouter({
  // ── Saved engagement-letter records (the EngagementLetters page CRUD) ──
  // These back the templated multi-letter list view; the generate/get/sign procs
  // below drive the per-client onboarding gate. Both use the engagement_letters /
  // clients tables. (Fixes the page that threw NOT_FOUND on these procedures.)
  list: authedQuery
    .input(z.object({ clientId: z.number() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = input?.clientId
        ? await db.select().from(engagementLetters).where(eq(engagementLetters.clientId, input.clientId)).orderBy(desc(engagementLetters.createdAt))
        : await db.select().from(engagementLetters).orderBy(desc(engagementLetters.createdAt));
      return rows;
    }),

  create: authedQuery
    .input(z.object({
      clientId: z.number(),
      templateName: z.string().optional(),
      title: z.string(),
      content: z.string(),
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
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [row] = await db.insert(engagementLetters).values({ ...input, status: "draft" } as any).returning();
      return row;
    }),

  send: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(engagementLetters).set({ status: "sent", sentAt: new Date(), sentBy: ctx.user.id, updatedAt: new Date() }).where(eq(engagementLetters.id, input.id));
      return { success: true };
    }),

  markSigned: authedQuery
    .input(z.object({ id: z.number(), signedBy: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [row] = await db.update(engagementLetters).set({ status: "signed", signedAt: new Date(), signedBy: input.signedBy ?? null, updatedAt: new Date() }).where(eq(engagementLetters.id, input.id)).returning();
      // Advance the client's onboarding when their letter is signed.
      if (row?.clientId) await db.update(clients).set({ engagementSignedAt: new Date() }).where(eq(clients.id, row.clientId));
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(engagementLetters).where(eq(engagementLetters.id, input.id));
      return { success: true };
    }),

  // Generate engagement letter PDF
  generate: authedQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      // Fetch client
      const clientRows = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.userId, ctx.user.id)))
        .limit(1);
      
      const client = clientRows[0];
      if (!client) throw new Error("Client not found");

      // Build services list
      const services = [];
      if (client.hasHST) services.push(`HST Filing (${client.hstPeriod || "quarterly"})`);
      if (client.hasWSIB) services.push(`WSIB Filing (${client.wsibQuarter || "all quarters"})`);
      if (client.hasPayroll) services.push(`Payroll Services (${client.payrollFrequency || "bi-weekly"})`);
      services.push("Bookkeeping & Accounting");

      // Build engagement letter content
      const letterData = {
        date: new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }),
        clientName: client.name,
        clientAddress: client.address || "[Address to be provided]",
        clientCompany: client.company || client.name,
        services,
        feeType: client.billingType || "monthly_fixed",
        feeAmount: client.monthlyFee || 0,
        yearEnd: client.yearEndMonth || "December",
        gfbName: "Go Fig Books Inc.",
        gfbAddress: "[GFB Business Address]",
      };

      // Store letter data in client record
      await db
        .update(clients)
        .set({
          engagementSentAt: new Date(),
          workflowStatus: "engagement_sent",
        })
        .where(eq(clients.id, client.id));

      return {
        success: true,
        clientId: client.id,
        letterData,
        downloadUrl: `/api/engagement-letter/${client.id}/download`,
      };
    }),

  // Get engagement letter data (for display/preview)
  get: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      
      const clientRows = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.userId, ctx.user.id)))
        .limit(1);
      
      const client = clientRows[0];
      if (!client) throw new Error("Client not found");

      const services = [];
      if (client.hasHST) services.push(`HST Filing (${client.hstPeriod || "quarterly"})`);
      if (client.hasWSIB) services.push(`WSIB Filing (${client.wsibQuarter || "all quarters"})`);
      if (client.hasPayroll) services.push(`Payroll Services (${client.payrollFrequency || "bi-weekly"})`);
      services.push("Bookkeeping & Accounting");

      return {
        clientName: client.name,
        clientAddress: client.address,
        clientCompany: client.company || client.name,
        services,
        feeType: client.billingType || "monthly_fixed",
        feeAmount: client.monthlyFee || 0,
        yearEnd: client.yearEndMonth || "December",
        quoteAmount: client.quoteAmount,
        quoteApprovedAt: client.quoteApprovedAt,
        engagementSentAt: client.engagementSentAt,
        engagementSignedAt: client.engagementSignedAt,
        email: client.email,
      };
    }),

  // Mark engagement as signed
  sign: authedQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      await db
        .update(clients)
        .set({
          engagementSignedAt: new Date(),
          workflowStatus: "onboarding_sent",
        })
        .where(and(eq(clients.id, input.clientId), eq(clients.userId, ctx.user.id)));

      return { success: true };
    }),
});
