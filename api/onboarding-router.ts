import { z } from "zod";
import { createRouter, staffQuery, seniorQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientOnboarding, clients } from "../db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { createClientTaskRules } from "./task-generator";

export const onboardingRouter = createRouter({
  // Staff creates an onboarding link for a client
  create: seniorQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const token = crypto.randomBytes(32).toString("hex");

      // Check if one already exists
      const existing = await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, input.clientId)).limit(1);

      if (existing[0]) {
        await db.update(clientOnboarding)
          .set({ token, status: "pending", updatedAt: new Date() })
          .where(eq(clientOnboarding.id, existing[0].id));
        return { success: true, token, url: `/onboarding/${token}` };
      }

      await db.insert(clientOnboarding).values({
        clientId: input.clientId,
        token,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update client record
      await db.update(clients)
        .set({ onboardingSentAt: new Date(), workflowStatus: "onboarding_sent" })
        .where(eq(clients.id, input.clientId));

      return { success: true, token, url: `/onboarding/${token}` };
    }),

  // Public: get onboarding form data by token
  getByToken: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const row = await db.select().from(clientOnboarding).where(eq(clientOnboarding.token, input.token)).limit(1);
      if (!row[0]) throw new Error("Invalid token");
      return row[0];
    }),

  // Public: submit onboarding form
  submit: publicQuery
    .input(z.object({
      token: z.string(),
      businessLegalName: z.string().optional(),
      businessOperatingName: z.string().optional(),
      businessStructure: z.string().optional(),
      industry: z.string().optional(),
      incorporationDate: z.date().optional(),
      businessNumber: z.string().optional(),
      ein: z.string().optional(),
      craBusinessNumber: z.string().optional(),
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
      // NEW: Business Profile fields for Task Automation
      hstGstFrequency: z.enum(["monthly", "quarterly", "annually", "none"]).optional(),
      payrollFrequency: z.enum(["weekly", "biweekly", "semi_monthly", "monthly", "none"]).optional(),
      hasEmployees: z.boolean().optional(),
      hasSubcontractors: z.boolean().optional(),
      hasInvestments: z.boolean().optional(),
      wsibRequired: z.boolean().optional(),
      bankAccountCount: z.number().min(0).optional(),
      creditCardCount: z.number().min(0).optional(),
      needsYearEnd: z.boolean().optional(),
      // NEW: Sales entry platforms
      usesStripe: z.boolean().optional(),
      usesSquare: z.boolean().optional(),
      usesJobber: z.boolean().optional(),
      salesEntryFrequency: z.enum(["daily", "weekly", "monthly", "none"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = await db.select().from(clientOnboarding).where(eq(clientOnboarding.token, input.token)).limit(1);
      if (!existing[0]) throw new Error("Invalid token");

      const { token, ...data } = input;

      await db.update(clientOnboarding)
        .set({
          ...data,
          status: "submitted",
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientOnboarding.id, existing[0].id));

      // Update client record
      await db.update(clients)
        .set({
          onboardingCompletedAt: new Date(),
          workflowStatus: "onboarding_complete",
          painPoints: data.painPoints || null,
          expectations: data.expectations || null,
        })
        .where(eq(clients.id, existing[0].clientId));

      return { success: true };
    }),

  // Staff: directly submit intake form (creates client + onboarding + tasks)
  staffSubmit: staffQuery
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      company: z.string().optional(),
      address: z.string().optional(),
      industry: z.string().optional(),
      province: z.string().optional(),
      qboAccountType: z.enum(["ca_clients", "us_clients"]).default("ca_clients"),
      contactName: z.string().optional(),
      notes: z.string().optional(),
      businessLegalName: z.string().optional(),
      businessOperatingName: z.string().optional(),
      businessStructure: z.string().optional(),
      incorporationDate: z.string().optional(),
      businessNumber: z.string().optional(),
      hstGstNumber: z.string().optional(),
      payrollAccountNumber: z.string().optional(),
      wsibAccountNumber: z.string().optional(),
      primaryContactName: z.string().optional(),
      primaryContactEmail: z.string().optional(),
      primaryContactPhone: z.string().optional(),
      bankName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankRoutingNumber: z.string().optional(),
      fiscalYearEnd: z.string().optional(),
      lastFiledYear: z.string().optional(),
      outstandingFilings: z.string().optional(),
      hstGstFrequency: z.enum(["monthly", "quarterly", "annually", "none"]).default("none"),
      payrollFrequency: z.enum(["weekly", "biweekly", "semi_monthly", "monthly", "none"]).default("none"),
      hasEmployees: z.boolean().default(false),
      hasSubcontractors: z.boolean().default(false),
      hasInvestments: z.boolean().default(false),
      wsibRequired: z.boolean().default(false),
      bankAccountCount: z.number().min(0).default(1),
      creditCardCount: z.number().min(0).default(0),
      needsYearEnd: z.boolean().default(true),
      usesStripe: z.boolean().default(false),
      usesSquare: z.boolean().default(false),
      usesJobber: z.boolean().default(false),
      usesTouchBistro: z.boolean().default(false),
      salesEntryFrequency: z.enum(["daily", "weekly", "monthly", "none"]).default("none"),
      currentAccountingSoftware: z.string().optional(),
      currentPayrollProvider: z.string().optional(),
      servicesNeeded: z.string().optional(),
      painPoints: z.string().optional(),
      expectations: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // 1. Create client
      const [client] = await db.insert(clients).values({
        userId,
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        company: input.company || input.name,
        address: input.address || null,
        status: "active",
        workflowStatus: "active",
        industry: input.industry || null,
        province: input.province || null,
        qboAccountType: input.qboAccountType,
        figgyEmail: `markie+${input.name.toLowerCase().replace(/[^a-z0-9]/g, "")}@gofig.ca`,
        contactName: input.contactName || null,
        notes: input.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      if (!client) throw new Error("Failed to create client");

      // 2. Create onboarding record (auto-approved since staff entered it)
      const [onboarding] = await db.insert(clientOnboarding).values({
        clientId: client.id,
        token: "staff-" + crypto.randomBytes(16).toString("hex"),
        status: "approved",
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: userId,
        businessLegalName: input.businessLegalName || null,
        businessOperatingName: input.businessOperatingName || null,
        businessStructure: input.businessStructure || null,
        industry: input.industry || null,
        incorporationDate: input.incorporationDate ? new Date(input.incorporationDate) : null,
        businessNumber: input.businessNumber || null,
        hstGstNumber: input.hstGstNumber || null,
        payrollAccountNumber: input.payrollAccountNumber || null,
        wsibAccountNumber: input.wsibAccountNumber || null,
        primaryContactName: input.primaryContactName || input.contactName || null,
        primaryContactEmail: input.primaryContactEmail || input.email || null,
        primaryContactPhone: input.primaryContactPhone || input.phone || null,
        bankName: input.bankName || null,
        bankAccountNumber: input.bankAccountNumber || null,
        bankRoutingNumber: input.bankRoutingNumber || null,
        fiscalYearEnd: input.fiscalYearEnd || null,
        lastFiledYear: input.lastFiledYear || null,
        outstandingFilings: input.outstandingFilings || null,
        hstGstFrequency: input.hstGstFrequency,
        payrollFrequency: input.payrollFrequency,
        hasEmployees: input.hasEmployees,
        hasSubcontractors: input.hasSubcontractors,
        hasInvestments: input.hasInvestments,
        wsibRequired: input.wsibRequired,
        bankAccountCount: input.bankAccountCount,
        creditCardCount: input.creditCardCount,
        needsYearEnd: input.needsYearEnd,
        usesStripe: input.usesStripe,
        usesSquare: input.usesSquare,
        usesJobber: input.usesJobber,
        usesTouchBistro: input.usesTouchBistro,
        salesEntryFrequency: input.salesEntryFrequency,
        currentAccountingSoftware: input.currentAccountingSoftware || null,
        currentPayrollProvider: input.currentPayrollProvider || null,
        servicesNeeded: input.servicesNeeded || null,
        painPoints: input.painPoints || null,
        expectations: input.expectations || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // 3. Update client
      await db.update(clients)
        .set({ workflowStatus: "active", onboardingCompletedAt: new Date() })
        .where(eq(clients.id, client.id));

      // 4. Auto-generate task rules and first tasks
      const taskResult = await createClientTaskRules({
        clientId: client.id,
        userId,
        assignedTo: null,
        fiscalYearEnd: input.fiscalYearEnd,
        hstGstFrequency: input.hstGstFrequency,
        payrollFrequency: input.payrollFrequency,
        hasEmployees: input.hasEmployees,
        hasSubcontractors: input.hasSubcontractors,
        hasInvestments: input.hasInvestments,
        wsibRequired: input.wsibRequired,
        bankAccountCount: input.bankAccountCount,
        creditCardCount: input.creditCardCount,
        needsYearEnd: input.needsYearEnd,
        usesStripe: input.usesStripe,
        usesSquare: input.usesSquare,
        usesJobber: input.usesJobber,
        usesTouchBistro: input.usesTouchBistro,
        salesEntryFrequency: input.salesEntryFrequency,
      });

      return {
        success: true,
        message: `Created client "${client.name}" with ${taskResult.tasks.length} auto-generated tasks.`,
        clientId: client.id,
        tasksCreated: taskResult.tasks.length,
      };
    }),

  // Staff: list all onboarding submissions
  list: staffQuery.query(async () => {
    const db = getDb();
    return db.select().from(clientOnboarding).orderBy(clientOnboarding.createdAt);
  }),

  // Staff: review an onboarding submission
  review: seniorQuery
    .input(z.object({
      id: z.number(),
      status: z.enum(["reviewed", "approved", "rejected"]),
      notes: z.string().optional(),
      assignedTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(clientOnboarding)
        .set({
          status: input.status,
          notes: input.notes || null,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clientOnboarding.id, input.id));

      if (input.status === "approved") {
        const row = await db.select().from(clientOnboarding).where(eq(clientOnboarding.id, input.id)).limit(1);
        if (row[0]) {
          await db.update(clients)
            .set({ workflowStatus: "active" })
            .where(eq(clients.id, row[0].clientId));

          // Get the client record for userId and assignedTo
          const clientRows = await db.select().from(clients).where(eq(clients.id, row[0].clientId)).limit(1);
          const client = clientRows[0];

          if (client) {
            // Generate recurring task rules based on onboarding data
            await createClientTaskRules({
              clientId: row[0].clientId,
              userId: client.userId,
              assignedTo: input.assignedTo || client.assignedTo,
              fiscalYearEnd: row[0].fiscalYearEnd,
              hstGstFrequency: row[0].hstGstFrequency || "none",
              payrollFrequency: row[0].payrollFrequency || "none",
              hasEmployees: row[0].hasEmployees || false,
              hasSubcontractors: row[0].hasSubcontractors || false,
              hasInvestments: row[0].hasInvestments || false,
              wsibRequired: row[0].wsibRequired || false,
              bankAccountCount: row[0].bankAccountCount || 1,
              creditCardCount: row[0].creditCardCount || 0,
              needsYearEnd: row[0].needsYearEnd !== false,
              usesStripe: row[0].usesStripe || false,
              usesSquare: row[0].usesSquare || false,
              usesJobber: row[0].usesJobber || false,
              salesEntryFrequency: row[0].salesEntryFrequency || "monthly",
            });
          }
        }
      }

      return { success: true };
    }),
});
