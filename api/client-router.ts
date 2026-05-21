import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, satisfactionScores } from "../db/schema";
import { eq, and, like, desc } from "drizzle-orm";
import { syncInsert, syncUpdate } from "./sync-hooks";
import { createRecurringTasksForClient } from "./client-task-creator";

export const clientRouter = createRouter({
  // List clients for current user
  list: authedQuery
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(["active", "inactive", "prospect", "lead", "all"]).optional().default("all"),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const search = input?.search;
      const status = input?.status ?? "all";

      const conditions = [eq(clients.userId, userId)];
      if (status !== "all") conditions.push(eq(clients.status, status));
      if (search) conditions.push(like(clients.name, `%${search}%`));

      const results = await db
        .select()
        .from(clients)
        .where(and(...conditions))
        .orderBy(desc(clients.updatedAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      return results;
    }),

  // Get single client
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)))
        .limit(1);

      return result[0] ?? null;
    }),

  // Create client
  create: authedQuery
    .input(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      phone: z.string().max(50).optional(),
      company: z.string().max(255).optional(),
      address: z.string().optional(),
      taxId: z.string().max(50).optional(),
      status: z.enum(["active", "inactive", "prospect", "lead"]).optional().default("active"),
      leadSource: z.string().max(100).optional(),
      leadSourceDetail: z.string().max(255).optional(),
      assignedTo: z.enum(["Markie", "Rachelle"]).optional(),
      notes: z.string().optional(),
      qboAccountType: z.enum(["ca_clients", "us_clients", "personal_business"]).optional().default("ca_clients"),
      billingType: z.enum(["monthly_fixed", "annual_fixed", "one_time_cleanup", "hourly", "project", "hybrid"]).optional().default("monthly_fixed"),
      monthlyFee: z.number().optional(),
      // Bookkeeping flags
      hasHST: z.boolean().optional().default(false),
      hstNumber: z.string().optional(),
      hstPeriod: z.enum(["monthly", "quarterly", "annual"]).optional(),
      hasWSIB: z.boolean().optional().default(false),
      wsibAccountNumber: z.string().optional(),
      wsibQuarter: z.enum(["Q1", "Q2", "Q3", "Q4", "all"]).optional(),
      hasPayroll: z.boolean().optional().default(false),
      payrollFrequency: z.enum(["weekly", "bi-weekly", "semi-monthly", "monthly", "self"]).optional(),
      yearEndMonth: z.enum(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]).optional(),
      // Quote fields
      quoteAmount: z.number().optional(),
      quoteSentAt: z.date().optional(),
      quoteApprovedAt: z.date().optional(),
      transactionsPerMonth: z.number().min(0).optional().default(0),
      estimatedMonthlyValue: z.number().min(0).optional(),
      leadScore: z.number().min(1).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { hasHST, hstPeriod, hasWSIB, wsibQuarter, hasPayroll, payrollFrequency, quoteAmount, quoteSentAt, quoteApprovedAt, ...rest } = input;
      const [client] = await db.insert(clients).values({
        ...rest,
        userId: ctx.user.id,
        hasHST,
        hstPeriod,
        hasWSIB,
        wsibQuarter,
        hasPayroll,
        payrollFrequency,
        quoteAmount,
        quoteSentAt,
        quoteApprovedAt,
      }).returning();
      if (client) syncInsert("clients", client);

      // Auto-create recurring tasks if flags are set
      if (client) {
        await createRecurringTasksForClient(
          client.id,
          ctx.user.id,
          { hasHST, hstPeriod, hasWSIB, wsibQuarter, hasPayroll, payrollFrequency },
          client.name,
          client.assignedTo
        );
      }

      return client;
    }),

  // Update client
  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(50).optional(),
      company: z.string().max(255).optional(),
      address: z.string().optional(),
      taxId: z.string().max(50).optional(),
      status: z.enum(["active", "inactive", "prospect", "lead"]).optional(),
      workflowStatus: z.string().optional(),
      leadSource: z.string().max(100).optional(),
      leadSourceDetail: z.string().max(255).optional(),
      assignedTo: z.enum(["Markie", "Rachelle"]).optional(),
      notes: z.string().optional(),
      driveFolderUrl: z.string().optional(),
      quickLinks: z.string().optional(),
      qboAccountType: z.enum(["ca_clients", "us_clients", "personal_business"]).optional(),
      billingType: z.enum(["monthly_fixed", "annual_fixed", "one_time_cleanup", "hourly", "project", "hybrid"]).optional(),
      monthlyFee: z.number().optional(),
      // Bookkeeping flags
      hasHST: z.boolean().optional(),
      hstNumber: z.string().optional(),
      hstPeriod: z.enum(["monthly", "quarterly", "annual"]).optional(),
      hasWSIB: z.boolean().optional(),
      wsibAccountNumber: z.string().optional(),
      wsibQuarter: z.enum(["Q1", "Q2", "Q3", "Q4", "all"]).optional(),
      hasPayroll: z.boolean().optional(),
      payrollFrequency: z.enum(["weekly", "bi-weekly", "semi-monthly", "monthly", "self"]).optional(),
      yearEndMonth: z.enum(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]).optional(),
      quoteAmount: z.number().optional(),
      quoteSentAt: z.string().optional(),
      quoteApprovedAt: z.string().optional(),
      engagementSentAt: z.string().optional(),
      engagementSignedAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, hasHST, hstPeriod, hasWSIB, wsibQuarter, hasPayroll, payrollFrequency, billingType, monthlyFee, transactionsPerMonth, workflowStatus, quoteAmount, quoteSentAt, quoteApprovedAt, engagementSentAt, engagementSignedAt, ...updates } = input;

      // Get current client to compare flags
      const current = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
      const currentClient = current[0];

      await db
        .update(clients)
        .set({
          ...updates,
          ...(hasHST !== undefined && { hasHST }),
          ...(hstPeriod !== undefined && { hstPeriod }),
          ...(hasWSIB !== undefined && { hasWSIB }),
          ...(wsibQuarter !== undefined && { wsibQuarter }),
          ...(hasPayroll !== undefined && { hasPayroll }),
          ...(payrollFrequency !== undefined && { payrollFrequency }),
          ...(billingType !== undefined && { billingType }),
          ...(monthlyFee !== undefined && { monthlyFee }),
          ...(transactionsPerMonth !== undefined && { transactionsPerMonth }),
          ...(workflowStatus !== undefined && { workflowStatus }),
          ...(quoteAmount !== undefined && { quoteAmount }),
          ...(quoteSentAt !== undefined && { quoteSentAt }),
          ...(quoteApprovedAt !== undefined && { quoteApprovedAt }),
          ...(engagementSentAt !== undefined && { engagementSentAt }),
          ...(engagementSignedAt !== undefined && { engagementSignedAt }),
        })
        .where(and(eq(clients.id, id), eq(clients.userId, ctx.user.id)));

      // Fetch updated record
      const updatedRows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
      const updated = updatedRows[0];
      if (updated) syncUpdate("clients", updated);

      // Auto-create tasks if flags were newly enabled
      const wasHst = currentClient?.hasHST ?? false;
      const wasWsib = currentClient?.hasWSIB ?? false;
      const wasPayroll = currentClient?.hasPayroll ?? false;

      if (updated) {
        await createRecurringTasksForClient(
          updated.id,
          ctx.user.id,
          {
            hasHST: !wasHst && updated.hasHST ? true : undefined,
            hstPeriod: updated.hstPeriod || undefined,
            hasWSIB: !wasWsib && updated.hasWSIB ? true : undefined,
            wsibQuarter: updated.wsibQuarter || undefined,
            hasPayroll: !wasPayroll && updated.hasPayroll ? true : undefined,
            payrollFrequency: updated.payrollFrequency || undefined,
          },
          updated.name,
          updated.assignedTo
        );
      }

      return { success: true };
    }),

  // Update client links only
  updateLinks: authedQuery
    .input(z.object({
      id: z.number(),
      driveFolderUrl: z.string().optional(),
      quickLinks: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(clients)
        .set(updates)
        .where(and(eq(clients.id, id), eq(clients.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete client
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(clients)
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));

      return { success: true };
    }),

  // Send Quote
  sendQuote: authedQuery
    .input(z.object({
      id: z.number(),
      amount: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();
      await db
        .update(clients)
        .set({
          quoteAmount: input.amount,
          quoteSentAt: now,
          workflowStatus: "quote_sent",
        })
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
      return { success: true, quoteSentAt: now };
    }),

  // Approve Quote
  approveQuote: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();
      await db
        .update(clients)
        .set({
          quoteApprovedAt: now,
          workflowStatus: "quote_approved",
        })
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
      return { success: true, quoteApprovedAt: now };
    }),

  // Send Engagement Letter
  sendEngagement: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();
      await db
        .update(clients)
        .set({
          engagementSentAt: now,
          workflowStatus: "engagement_sent",
        })
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
      return { success: true, engagementSentAt: now };
    }),

  // Sign Engagement Letter
  signEngagement: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();
      await db
        .update(clients)
        .set({
          engagementSignedAt: now,
          workflowStatus: "onboarding_sent",
        })
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
      return { success: true, engagementSignedAt: now };
    }),

  // Archive client (make inactive)
  archive: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(clients)
        .set({
          status: "inactive",
          workflowStatus: "inactive",
        })
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));
      return { success: true };
    }),

  // Satisfaction scores
  getSatisfactionScores: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(satisfactionScores)
        .where(eq(satisfactionScores.clientId, input.clientId))
        .orderBy(desc(satisfactionScores.createdAt));
    }),

  addSatisfactionScore: authedQuery
    .input(z.object({
      clientId: z.number(),
      score: z.number().min(1).max(10),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [result] = await db.insert(satisfactionScores).values({
        clientId: input.clientId,
        userId: ctx.user.id,
        score: input.score,
        notes: input.notes,
        createdAt: new Date(),
      }).returning();
      return result;
    }),

  // Lead Pipeline Stats
  pipelineStats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    const allClients = await db
      .select()
      .from(clients)
      .where(eq(clients.userId, userId));

    const leads = allClients.filter(c => c.status === "lead" || c.status === "prospect");
    const active = allClients.filter(c => c.status === "active");
    
    return {
      totalLeads: leads.length,
      newLeads: leads.filter(c => c.workflowStatus === "new_lead").length,
      discoveryCalls: leads.filter(c => c.workflowStatus === "discovery_call").length,
      quotesSent: leads.filter(c => c.workflowStatus === "quote_sent").length,
      quotesApproved: leads.filter(c => c.workflowStatus === "quote_approved").length,
      engagementsSent: leads.filter(c => c.workflowStatus === "engagement_sent").length,
      onboarding: leads.filter(c => c.workflowStatus === "onboarding_sent" || c.workflowStatus === "onboarding_complete").length,
      activeClients: active.length,
      totalPipelineValue: leads.reduce((sum, c) => sum + (c.estimatedMonthlyValue || 0), 0),
    };
  }),
});
