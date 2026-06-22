import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, satisfactionScores, tasks, clientTaskRules } from "../db/schema";
import { eq, and, like, desc, ne } from "drizzle-orm";
import { syncInsert, syncUpdate } from "./sync-hooks";
import { createRecurringTasksForClient } from "./client-task-creator";
import { isOperationalClient } from "./month-end-core";

/** Row scope for client mutations: a "client"-role user may only touch their own
 *  client; staff (Markie/Rachelle/admin) edit ANY client — matching the list view,
 *  which shows staff all clients. Without this, edits to seeded/imported clients
 *  (owned by another/system user) silently matched 0 rows and saved nothing. */
function clientScope(ctx: any, idVal: number) {
  return ctx.user?.role === "client"
    ? and(eq(clients.id, idVal), eq(clients.userId, ctx.user.id))
    : eq(clients.id, idVal);
}

/** Deactivate a client's recurring rules + their not-yet-completed tasks so an
 *  inactive/archived client stops generating and showing work. Completed tasks
 *  are left as history. Reversible via reactivateClientTasks. */
async function deactivateClientTasks(db: any, clientId: number) {
  await db.update(clientTaskRules).set({ active: false }).where(eq(clientTaskRules.clientId, clientId));
  await db.update(tasks).set({ active: false })
    .where(and(eq(tasks.clientId, clientId), ne(tasks.status, "completed")));
}

/** Re-enable a client's rules + their open tasks when they're made active again. */
async function reactivateClientTasks(db: any, clientId: number) {
  await db.update(clientTaskRules).set({ active: true }).where(eq(clientTaskRules.clientId, clientId));
  await db.update(tasks).set({ active: true })
    .where(and(eq(tasks.clientId, clientId), ne(tasks.status, "completed")));
}

export const clientRouter = createRouter({
  // List clients — SHARED PRACTICE VIEW
  // All staff (junior_bookkeeper+) can see all clients
  // Client role only sees their own
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
      const userRole = ctx.user.role;
      const search = input?.search;
      const status = input?.status ?? "all";

      const conditions = [];
      
      // Client role only sees their own data
      if (userRole === "client") {
        conditions.push(eq(clients.userId, userId));
      }
      // Staff (junior+) sees ALL clients — shared practice view

      if (status !== "all") conditions.push(eq(clients.status, status));
      if (search) conditions.push(like(clients.name, `%${search}%`));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db
        .select()
        .from(clients)
        .where(whereClause)
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
        .where(clientScope(ctx, input.id))
        .limit(1);

      return result[0] ?? null;
    }),

  // Other companies in the same owner/group (client grouping). Staff see all; a
  // client-role user only ever sees their own, so returns empty for them.
  related: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role === "client") return [];
      const db = getDb();
      const me = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      const g = (me?.groupName || "").trim();
      if (!g) return [];
      const all = await db.select().from(clients);
      return (all as any[])
        .filter((c) => c.id !== input.clientId && (c.groupName || "").trim().toLowerCase() === g.toLowerCase())
        .map((c) => ({ id: c.id, name: c.name, status: c.status }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }),

  // Create client
  create: authedQuery
    .input(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      phone: z.string().max(50).optional(),
      company: z.string().max(255).optional(),
      website: z.string().max(255).optional(),
      address: z.string().optional(),
      taxId: z.string().max(50).optional(),
      status: z.enum(["active", "inactive", "prospect", "lead"]).optional().default("active"),
      clientType: z.enum(["monthly", "quarterly", "annual", "payroll", "wholesale"]).optional(),
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
      payrollExternal: z.boolean().optional(),
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

      // Auto-create recurring tasks if flags are set — but NOT for wholesale
      // (flow-through) clients: they have no books, no close, no compliance tasks.
      if (client && isOperationalClient(client.clientType)) {
        await createRecurringTasksForClient(
          client.id,
          ctx.user.id,
          { hasHST, hstPeriod, hasWSIB, wsibQuarter, hasPayroll, payrollFrequency, payrollExternal: input.payrollExternal },
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
      website: z.string().max(255).optional(),
      address: z.string().optional(),
      taxId: z.string().max(50).optional(),
      status: z.enum(["active", "inactive", "prospect", "lead"]).optional(),
      clientType: z.enum(["monthly", "quarterly", "annual", "payroll", "wholesale"]).optional(),
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
      payrollExternal: z.boolean().optional(),
      payrollBonuses: z.boolean().optional(),
      payrollDividends: z.boolean().optional(),
      payrollPhoneAllowance: z.boolean().optional(),
      payrollReimbursements: z.boolean().optional(),
      payrollRevenueShare: z.boolean().optional(),
      payrollCraComparison: z.boolean().optional(),
      payrollHoursSource: z.enum(["manual", "jobber", "touchbistro", "clockify", "qbo_autopay"]).optional(),
      monthlySalesReceipt: z.boolean().optional(),
      salesReceiptSource: z.string().optional(),
      groupName: z.string().optional(),
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
        .where(clientScope(ctx, id));

      // Fetch updated record
      const updatedRows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
      const updated = updatedRows[0];
      if (updated) syncUpdate("clients", updated);

      // Cascade a status flip to the client's tasks/rules: inactive pauses them,
      // reactivating resumes them — so task state always follows client state.
      if (updates.status !== undefined && currentClient && updates.status !== currentClient.status) {
        if (updates.status === "inactive") await deactivateClientTasks(db, id);
        else if (currentClient.status === "inactive") await reactivateClientTasks(db, id);
      }

      // If this client was switched TO wholesale (flow-through), pause all its
      // recurring compliance tasks — there's no close/quote/tasks for a client
      // we just resell QBO to. (Reversible: switch back + re-enable a flag.)
      if (updated && !isOperationalClient(updated.clientType) && isOperationalClient(currentClient?.clientType)) {
        await deactivateClientTasks(db, id);
      }

      // Auto-create tasks if flags were newly enabled
      const wasHst = currentClient?.hasHST ?? false;
      const wasWsib = currentClient?.hasWSIB ?? false;
      const wasPayroll = currentClient?.hasPayroll ?? false;
      const wasDividends = currentClient?.payrollDividends ?? false;

      // Wholesale clients never generate compliance tasks.
      if (updated && isOperationalClient(updated.clientType)) {
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
            payrollExternal: (updated as any).payrollExternal ?? undefined,
            paysDividends: !wasDividends && (updated as any).payrollDividends ? true : undefined,
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
        .where(clientScope(ctx, id));

      return { success: true };
    }),

  // Delete client — cascades to their tasks + recurring rules so nothing is
  // left orphaned (and they stop showing in task lists / generating new work).
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(tasks).where(eq(tasks.clientId, input.id));
      await db.delete(clientTaskRules).where(eq(clientTaskRules.clientId, input.id));
      await db
        .delete(clients)
        .where(clientScope(ctx, input.id));

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
        .where(clientScope(ctx, input.id));
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
        .where(clientScope(ctx, input.id));
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
        .where(clientScope(ctx, input.id));
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
        .where(clientScope(ctx, input.id));
      return { success: true, engagementSignedAt: now };
    }),

  // Archive client (make inactive) — also pauses their recurring rules + open
  // tasks so an archived client stops generating and showing work.
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
        .where(clientScope(ctx, input.id));
      await deactivateClientTasks(db, input.id);
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

  // Lead Pipeline Stats — SHARED: all staff see firm-wide stats
  pipelineStats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userRole = ctx.user.role;

    const allClients = userRole === "client"
      ? await db.select().from(clients).where(eq(clients.userId, ctx.user.id))
      : await db.select().from(clients);

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
