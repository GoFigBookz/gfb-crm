import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, clientOnboarding, workflowLogs } from "../db/schema";
import { eq } from "drizzle-orm";

export const publicRouter = createRouter({
  // Public: create a lead from the marketing website
  createLead: publicQuery
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      company: z.string().optional(),
      businessStructure: z.string().optional(),
      industry: z.string().optional(),
      businessNumber: z.string().optional(),
      hstGstNumber: z.string().optional(),
      payrollAccountNumber: z.string().optional(),
      wsibAccountNumber: z.string().optional(),
      primaryContactName: z.string().optional(),
      primaryContactEmail: z.string().optional(),
      primaryContactPhone: z.string().optional(),
      secondaryContactName: z.string().optional(),
      secondaryContactEmail: z.string().optional(),
      bankName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankRoutingNumber: z.string().optional(),
      currentAccountingSoftware: z.string().optional(),
      currentPayrollProvider: z.string().optional(),
      servicesNeeded: z.string().optional(),
      painPoints: z.string().optional(),
      expectations: z.string().optional(),
      fiscalYearEnd: z.string().optional(),
      lastFiledYear: z.string().optional(),
      outstandingFilings: z.string().optional(),
      planSelected: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // 1. Create the client as a new lead
      const clientResult = await db.insert(clients).values({
        userId: 1, // System user / admin
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        company: input.company || null,
        status: "active",
        workflowStatus: "new_lead",
        leadSource: "website",
        painPoints: input.painPoints || null,
        expectations: input.expectations || null,
        serviceTier: (input.planSelected as any) || "standard",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const clientId = Number(clientResult.lastInsertRowid);

      // 2. Create the onboarding record
      const token = crypto.randomUUID();
      await db.insert(clientOnboarding).values({
        clientId,
        token,
        businessLegalName: input.company || null,
        businessOperatingName: input.company || null,
        businessStructure: input.businessStructure || null,
        industry: input.industry || null,
        businessNumber: input.businessNumber || null,
        hstGstNumber: input.hstGstNumber || null,
        payrollAccountNumber: input.payrollAccountNumber || null,
        wsibAccountNumber: input.wsibAccountNumber || null,
        primaryContactName: input.primaryContactName || input.name,
        primaryContactEmail: input.primaryContactEmail || input.email,
        primaryContactPhone: input.primaryContactPhone || input.phone || null,
        secondaryContactName: input.secondaryContactName || null,
        secondaryContactEmail: input.secondaryContactEmail || null,
        bankName: input.bankName || null,
        bankAccountNumber: input.bankAccountNumber || null,
        bankRoutingNumber: input.bankRoutingNumber || null,
        currentAccountingSoftware: input.currentAccountingSoftware || null,
        currentPayrollProvider: input.currentPayrollProvider || null,
        servicesNeeded: input.servicesNeeded || null,
        painPoints: input.painPoints || null,
        expectations: input.expectations || null,
        fiscalYearEnd: input.fiscalYearEnd || null,
        lastFiledYear: input.lastFiledYear || null,
        outstandingFilings: input.outstandingFilings || null,
        status: "submitted",
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Log the workflow transition
      await db.insert(workflowLogs).values({
        clientId,
        fromStatus: null,
        toStatus: "new_lead",
        action: "website_lead_created",
        notes: `Plan selected: ${input.planSelected || "none"}. Source: website form.`,
        createdAt: new Date(),
      });

      return { success: true, clientId, token };
    }),
});
