import { z } from "zod";
import { createRouter, staffQuery, seniorQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientOnboarding, clients, tasks, clientTaskRules } from "../db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { isOperationalClient } from "./month-end-core";
import crypto from "crypto";
import { createClientTaskRules, ensureComplianceRulesAndTasks } from "./task-generator";
import { syncClientToMaster, upsertClientToMaster } from "./master-sheet-sync";
import { lookupGovRegistry } from "./gov-registry-lookup";
import { activateClientAsync } from "./client-activation";

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
      payrollRemitterFreq: z.enum(["regular", "quarterly", "accelerated"]).default("regular"),
      payrollExternal: z.boolean().default(false),
      hasEmployees: z.boolean().default(false),
      hasSubcontractors: z.boolean().default(false),
      hasInvestments: z.boolean().default(false),
      paysDividends: z.boolean().default(false),
      hasEHT: z.boolean().default(false),
      employeeCount: z.number().min(0).default(0),
      monthsBehind: z.number().min(0).default(0),
      wsibRequired: z.boolean().default(false),
      bankAccountCount: z.number().min(0).default(1),
      creditCardCount: z.number().min(0).default(0),
      needsYearEnd: z.boolean().default(true),
      usesStripe: z.boolean().default(false),
      usesSquare: z.boolean().default(false),
      usesJobber: z.boolean().default(false),
      usesTouchBistro: z.boolean().default(false),
      usesPayPal: z.boolean().default(false),
      usesWise: z.boolean().default(false),
      salesEntryFrequency: z.enum(["daily", "weekly", "monthly", "none"]).default("none"),
      usesHubdoc: z.boolean().default(false),
      hasJobCosting: z.boolean().default(false),
      avgMonthlyTransactions: z.number().min(0).default(0),
      bookkeepingFrequency: z.enum(["monthly", "quarterly", "annual", "none"]).default("monthly"),
      invoicingResponsibility: z.enum(["we_invoice", "client_invoices", "none"]).default("none"),
      billPayResponsibility: z.enum(["we_pay", "client_pays", "none"]).default("none"),
      currentAccountingSoftware: z.string().optional(),
      currentPayrollProvider: z.string().optional(),
      servicesNeeded: z.string().optional(),
      painPoints: z.string().optional(),
      expectations: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      // Map intake enums → client-record fields so the intake flows through to
      // the month-end board, client card, and the additive task backfill — not
      // just the onboarding record.
      const MONTHS3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const yearEndMonth = (() => {
        const w = (input.fiscalYearEnd || "").trim().slice(0, 3).toLowerCase();
        const i = MONTHS3.findIndex((m) => m.toLowerCase() === w);
        return i >= 0 ? MONTHS3[i] : null;
      })();
      const hstPeriod = input.hstGstFrequency === "annually" ? "annual"
        : input.hstGstFrequency === "quarterly" ? "quarterly"
        : input.hstGstFrequency === "monthly" ? "monthly" : null;
      const payFreq = input.payrollFrequency === "biweekly" ? "bi-weekly"
        : input.payrollFrequency === "semi_monthly" ? "semi-monthly"
        : (input.payrollFrequency && input.payrollFrequency !== "none") ? input.payrollFrequency : null;
      const hasPayroll = !!payFreq || input.hasEmployees;

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
        transactionsPerMonth: input.avgMonthlyTransactions || 0,
        payrollRemitterFreq: input.payrollRemitterFreq,
        payrollExternal: input.payrollExternal,
        // compliance flags that drive the board + tasks
        taxId: input.businessNumber || null,
        hasHST: input.hstGstFrequency !== "none",
        hstPeriod: hstPeriod as any,
        hstNumber: input.hstGstNumber || (input.businessNumber ? `${input.businessNumber}RT0001` : null),
        hasPayroll,
        payrollFrequency: payFreq as any,
        payrollRpNumber: input.payrollAccountNumber || (input.businessNumber ? `${input.businessNumber}RP0001` : null),
        hasWSIB: input.wsibRequired,
        wsibAccountNumber: input.wsibAccountNumber || null,
        payrollDividends: input.paysDividends,
        yearEndMonth: yearEndMonth as any,
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
        paysDividends: input.paysDividends,
        hasEHT: input.hasEHT,
        employeeCount: input.employeeCount,
        monthsBehind: input.monthsBehind,
        wsibRequired: input.wsibRequired,
        bankAccountCount: input.bankAccountCount,
        creditCardCount: input.creditCardCount,
        needsYearEnd: input.needsYearEnd,
        usesStripe: input.usesStripe,
        usesSquare: input.usesSquare,
        usesJobber: input.usesJobber,
        usesTouchBistro: input.usesTouchBistro,
        usesPayPal: input.usesPayPal,
        usesWise: input.usesWise,
        salesEntryFrequency: input.salesEntryFrequency,
        usesHubdoc: input.usesHubdoc,
        hasJobCosting: input.hasJobCosting,
        avgMonthlyTransactions: input.avgMonthlyTransactions,
        bookkeepingFrequency: input.bookkeepingFrequency,
        invoicingResponsibility: input.invoicingResponsibility,
        billPayResponsibility: input.billPayResponsibility,
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
        payrollRemitterFreq: input.payrollRemitterFreq,
        payrollExternal: input.payrollExternal,
        hasEmployees: input.hasEmployees,
        hasSubcontractors: input.hasSubcontractors,
        hasInvestments: input.hasInvestments,
        paysDividends: input.paysDividends,
        hasEHT: input.hasEHT,
        employeeCount: input.employeeCount,
        monthsBehind: input.monthsBehind,
        wsibRequired: input.wsibRequired,
        bankAccountCount: input.bankAccountCount,
        creditCardCount: input.creditCardCount,
        needsYearEnd: input.needsYearEnd,
        usesStripe: input.usesStripe,
        usesSquare: input.usesSquare,
        usesJobber: input.usesJobber,
        usesTouchBistro: input.usesTouchBistro,
        usesPayPal: input.usesPayPal,
        usesWise: input.usesWise,
        salesEntryFrequency: input.salesEntryFrequency,
        usesHubdoc: input.usesHubdoc,
        hasJobCosting: input.hasJobCosting,
        avgMonthlyTransactions: input.avgMonthlyTransactions,
        bookkeepingFrequency: input.bookkeepingFrequency,
        invoicingResponsibility: input.invoicingResponsibility,
        billPayResponsibility: input.billPayResponsibility,
      });

      // Staff-added clients are active immediately → enrich from the government
      // registry + promote into the Client Master sheet (best-effort, async).
      activateClientAsync(client.id);

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
              usesTouchBistro: row[0].usesTouchBistro || false,
              usesPayPal: row[0].usesPayPal || false,
              salesEntryFrequency: row[0].salesEntryFrequency || "monthly",
            });
          }
        }
      }

      return { success: true };
    }),

  // Get the latest onboarding record for a client (for the editable intake).
  getRecord: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(clientOnboarding)
        .where(eq(clientOnboarding.clientId, input.clientId))
        .orderBy(clientOnboarding.id);
      return rows[rows.length - 1] ?? null;
    }),

  // Edit/clean up a client's intake — upserts client_onboarding AND syncs the
  // client-level flags that drive tasks + quotes. All fields optional.
  updateRecord: staffQuery
    .input(z.object({
      clientId: z.number(),
      // client-level
      name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
      company: z.string().optional(), website: z.string().optional(), address: z.string().optional(), contactName: z.string().optional(),
      taxId: z.string().optional(), hstNumber: z.string().optional(), wsibAccountNumber: z.string().optional(),
      // NOTE: cadence/category fields are accepted as loose strings (DB columns
      // are TEXT). Strict enums here rejected legitimate saves when a stored
      // value used a different spelling (e.g. "biweekly" vs "bi-weekly") — which
      // is exactly the "can't save intake" error. Coerce/normalize, don't reject.
      clientType: z.string().optional(),
      payrollRpNumber: z.string().optional(), monthlyFee: z.number().optional(), craRacDone: z.boolean().optional(),
      hasHST: z.boolean().optional(), hstPeriod: z.string().optional(),
      hasWSIB: z.boolean().optional(), hasPayroll: z.boolean().optional(), payrollExternal: z.boolean().optional(),
      payrollFrequency: z.string().optional(),
      payrollRemitterFreq: z.string().optional(),
      yearEndMonth: z.string().optional(),
      // onboarding-level
      businessLegalName: z.string().optional(), craBusinessNumber: z.string().optional(),
      primaryContactName: z.string().optional(), primaryContactEmail: z.string().optional(), primaryContactPhone: z.string().optional(),
      fiscalYearEnd: z.string().optional(),
      hstGstFrequency: z.string().optional(),
      onbPayrollFrequency: z.string().optional(),
      hasEmployees: z.boolean().optional(), hasSubcontractors: z.boolean().optional(), hasInvestments: z.boolean().optional(),
      wsibRequired: z.boolean().optional(), paysDividends: z.boolean().optional(), hasEHT: z.boolean().optional(),
      employeeCount: z.number().optional(), monthsBehind: z.number().optional(),
      bankAccountCount: z.number().optional(), creditCardCount: z.number().optional(),
      needsYearEnd: z.boolean().optional(), usesHubdoc: z.boolean().optional(), hasJobCosting: z.boolean().optional(),
      avgMonthlyTransactions: z.number().optional(),
      bookkeepingFrequency: z.string().optional(),
      invoicingResponsibility: z.string().optional(),
      billPayResponsibility: z.string().optional(),
      usesStripe: z.boolean().optional(), usesSquare: z.boolean().optional(), usesJobber: z.boolean().optional(),
      usesTouchBistro: z.boolean().optional(), usesPayPal: z.boolean().optional(), usesWise: z.boolean().optional(),
      salesEntryFrequency: z.string().optional(),
      qboSoftwareTier: z.string().optional(),
      qboSoftwareWholesale: z.boolean().optional(), qboPayrollWholesale: z.boolean().optional(),
      servicesNeeded: z.string().optional(), painPoints: z.string().optional(), expectations: z.string().optional(),
      currentAccountingSoftware: z.string().optional(), currentPayrollProvider: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { clientId, onbPayrollFrequency, ...rest } = input;

      // client-level keys
      const clientKeys = ["name", "email", "phone", "company", "website", "address", "contactName", "taxId", "hstNumber",
        "wsibAccountNumber", "clientType", "payrollRpNumber", "monthlyFee", "craRacDone", "hasHST", "hstPeriod", "hasWSIB", "hasPayroll", "payrollExternal",
        "payrollFrequency", "payrollRemitterFreq", "yearEndMonth"] as const;
      const prior = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
      const clientPatch: Record<string, any> = { updatedAt: new Date() };
      for (const k of clientKeys) if ((rest as any)[k] !== undefined) clientPatch[k] = (rest as any)[k];
      if (Object.keys(clientPatch).length > 1) await db.update(clients).set(clientPatch).where(eq(clients.id, clientId));

      // Switching a client TO wholesale (flow-through) pauses its open tasks +
      // recurring rules — no close/quote/compliance work for a QBO-resale client.
      if ((rest as any).clientType !== undefined &&
          !isOperationalClient((rest as any).clientType) &&
          isOperationalClient(prior?.clientType)) {
        await db.update(clientTaskRules).set({ active: false }).where(eq(clientTaskRules.clientId, clientId));
        await db.update(tasks).set({ active: false }).where(and(eq(tasks.clientId, clientId), ne(tasks.status, "completed")));
      }

      // onboarding-level keys
      const onbKeys = ["businessLegalName", "craBusinessNumber", "primaryContactName", "primaryContactEmail",
        "primaryContactPhone", "fiscalYearEnd", "hstGstFrequency", "hasEmployees", "hasSubcontractors", "hasInvestments",
        "wsibRequired", "paysDividends", "hasEHT", "employeeCount", "monthsBehind", "bankAccountCount", "creditCardCount",
        "needsYearEnd", "usesHubdoc", "hasJobCosting", "avgMonthlyTransactions", "bookkeepingFrequency",
        "invoicingResponsibility", "billPayResponsibility", "usesStripe", "usesSquare", "usesJobber", "usesTouchBistro",
        "usesPayPal", "usesWise", "salesEntryFrequency", "qboSoftwareTier", "qboSoftwareWholesale", "qboPayrollWholesale",
        "servicesNeeded", "painPoints", "expectations", "currentAccountingSoftware",
        "currentPayrollProvider"] as const;
      const onbPatch: Record<string, any> = { updatedAt: new Date() };
      for (const k of onbKeys) if ((rest as any)[k] !== undefined) onbPatch[k] = (rest as any)[k];
      if (onbPayrollFrequency !== undefined) onbPatch.payrollFrequency = onbPayrollFrequency;
      // also mirror wsib number into onboarding for completeness
      if (rest.wsibAccountNumber !== undefined) onbPatch.wsibAccountNumber = rest.wsibAccountNumber;

      const existing = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, clientId)).orderBy(clientOnboarding.id));
      const latest = existing[existing.length - 1];
      if (latest) {
        await db.update(clientOnboarding).set(onbPatch).where(eq(clientOnboarding.id, latest.id));
      } else {
        await db.insert(clientOnboarding).values({
          clientId, token: crypto.randomBytes(24).toString("hex"), status: "approved", ...onbPatch,
        });
      }

      // Saving intake should DO something: regenerate the client's compliance
      // tasks from the merged current flags so editing actually backfills missing
      // HST/payroll/etc tasks — and respects "we don't run payroll".
      try {
        const c = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
        if (c && isOperationalClient(c.clientType)) {
          // hstPeriod ("annual") → buildTaskRules expects "annually"
          const hstFreq = c.hasHST ? (c.hstPeriod === "monthly" ? "monthly" : c.hstPeriod === "quarterly" ? "quarterly" : "annually") : null;
          const ye = c.yearEndMonth ? `${c.yearEndMonth} 30` : (onbPatch.fiscalYearEnd ?? null);
          // If we don't run their payroll, retire any payroll rules/tasks so they
          // leave the board.
          if (c.payrollExternal) {
            const payTypes = ["payroll_remit_regular", "payroll_remit_quarterly", "payroll_remit_accelerated", "payroll_tax_prep", "t4_annual"];
            await db.update(clientTaskRules).set({ active: false }).where(and(eq(clientTaskRules.clientId, clientId), inArray(clientTaskRules.ruleType, payTypes)));
            await db.update(tasks).set({ active: false }).where(and(eq(tasks.clientId, clientId), ne(tasks.status, "completed"), inArray(tasks.category, ["Payroll"])));
          }
          await ensureComplianceRulesAndTasks({
            clientId, userId: 1, assignedTo: c.assignedTo ?? null, fiscalYearEnd: ye,
            hstGstFrequency: hstFreq,
            payrollFrequency: c.hasPayroll ? (c.payrollFrequency || "monthly") : null,
            payrollRemitterFreq: c.payrollRemitterFreq || "regular",
            payrollExternal: !!c.payrollExternal,
            hasEmployees: !!c.hasPayroll,
            wsibRequired: !!c.hasWSIB,
            needsYearEnd: true,
          });
        }
      } catch (e) {
        console.error("[onboarding] task regen on intake save failed (non-fatal):", e instanceof Error ? e.message : e);
      }

      // Mirror the edited client into the canonical Google master sheet so the
      // sheet always matches the CRM (best-effort, never blocks the save).
      try {
        const c = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0];
        if (c) syncClientToMaster(c as any);
      } catch { /* non-fatal */ }

      return { success: true };
    }),

  // Manually (re-)run the government-registry lookup for one client from its card
  // — fills any blank registry/bio fields then syncs the row to the master sheet.
  lookupGovRegistry: staffQuery
    .input(z.object({ clientId: z.number(), force: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const c = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      if (!c) return { success: false, error: "client not found" };
      const hit = await lookupGovRegistry(c.name, { province: c.province, knownBn: c.taxId });
      if (!hit) return { success: false, error: "no registry data found (or lookup disabled)" };
      const blank = (v: any) => v === null || v === undefined || v === "";
      const patch: Record<string, any> = { updatedAt: new Date() };
      const take = (k: string, v?: string) => { if (v && (input.force || blank(c[k]))) patch[k] = v; };
      take("bio", hit.bio); take("registryNumber", hit.registryNumber);
      take("incorporationDate", hit.incorporationDate); take("corpType", hit.corpType);
      take("governmentStatus", hit.governmentStatus); take("website", hit.website);
      take("address", hit.address); take("phone", hit.phone);
      if (hit.industry && (input.force || blank(c.industry) || c.industry === "other")) patch.industry = hit.industry;
      if (hit.craBusinessNumber && (input.force || blank(c.taxId))) patch.taxId = hit.craBusinessNumber;
      if (Object.keys(patch).length > 1) await db.update(clients).set(patch).where(eq(clients.id, input.clientId));
      const fresh = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0];
      if (fresh) syncClientToMaster(fresh as any);
      return { success: true, fields: Object.keys(patch).filter((k) => k !== "updatedAt") };
    }),

  // Push EVERY active client into the canonical Google master sheet (one-time
  // reconcile / drift fix). Upsert preserves the gov-registry columns. Awaited
  // so the caller gets a real count back. Cheap (~2 Sheets calls/client).
  syncAllToMaster: staffQuery.mutation(async () => {
    const db = getDb();
    const rows = await db.select().from(clients).where(eq(clients.status, "active"));
    let synced = 0, failed = 0;
    for (const c of rows) {
      const ok = await upsertClientToMaster(c as any);
      if (ok) synced++; else failed++;
    }
    return { success: true, total: rows.length, synced, failed };
  }),
});
