import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, satisfactionScores, tasks, clientTaskRules } from "../db/schema";
import { eq, and, like, desc, ne, inArray, sql } from "drizzle-orm";
import { restrictedClientIds } from "./rbac";
import { syncInsert, syncUpdate } from "./sync-hooks";
import { ensureComplianceForClient, reconcileClientFromIntake } from "./task-generator";
import { figgyEmailFor } from "./seed-triage-emails";
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
  // Rules are the durable source; tasks are materialized instances. Pause the
  // rules and DELETE the open tasks (they regenerate from the rules on reconcile
  // if the client is reactivated). `tasks` has no `active` column, so a delete is
  // the correct way to make them stop showing everywhere.
  await db.update(clientTaskRules).set({ active: false }).where(eq(clientTaskRules.clientId, clientId));
  await db.delete(tasks).where(and(eq(tasks.clientId, clientId), ne(tasks.status, "completed")));
}

/** Re-enable a client's rules when made active again; the update mutation's
 *  reconcile then re-materializes the open tasks the current flags imply. */
async function reactivateClientTasks(db: any, clientId: number) {
  await db.update(clientTaskRules).set({ active: true }).where(eq(clientTaskRules.clientId, clientId));
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
      // Staff (junior+) sees ALL clients — UNLESS restricted to specific clients (RBAC).
      const allowed = await restrictedClientIds(ctx);
      if (allowed !== null) {
        // Empty grant set → see nothing (use -1 so the IN matches no rows).
        conditions.push(inArray(clients.id, allowed.length ? allowed : [-1]));
      }

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

  // Client counts for the dashboard KPI strip. This procedure was MISSING — the
  // dashboard called crmClient.stats but nothing answered, so "Clients" showed 0/0
  // (Markie 2026-06-25). active = status active; total = real engaged clients
  // (active + inactive), excluding leads/prospects/archived (those have their own
  // pipeline KPI). RBAC-aware: a restricted user counts only their granted clients.
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userRole = ctx.user.role;
    const conditions: any[] = [];
    if (userRole === "client") conditions.push(eq(clients.userId, ctx.user.id));
    const allowed = await restrictedClientIds(ctx);
    if (allowed !== null) conditions.push(inArray(clients.id, allowed.length ? allowed : [-1]));
    const where = conditions.length ? and(...conditions) : undefined;
    const rows = (await db.select().from(clients).where(where)) as any[];
    const active = rows.filter((c) => c.status === "active").length;
    const inactive = rows.filter((c) => c.status === "inactive").length;
    const leads = rows.filter((c) => c.status === "lead" || c.status === "prospect").length;
    return { active, inactive, leads, total: active + inactive, allRows: rows.length };
  }),

  // Get single client
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      // RBAC: a restricted user can't open a client they weren't granted.
      const allowed = await restrictedClientIds(ctx);
      if (allowed !== null && !allowed.includes(input.id)) return null;
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
      // Wholesale = flow-through (QBO resale only) → never payroll.
      const wholesale = (rest as any).clientType === "wholesale";
      const [client] = await db.insert(clients).values({
        ...rest,
        userId: ctx.user.id,
        hasHST,
        hstPeriod,
        hasWSIB,
        wsibQuarter,
        hasPayroll: wholesale ? false : hasPayroll,
        payrollFrequency: wholesale ? null : payrollFrequency,
        quoteAmount,
        quoteSentAt,
        quoteApprovedAt,
      }).returning();
      // Always assign a triage email on creation (so it's never missing).
      if (client && !client.figgyEmail) {
        const figgyEmail = figgyEmailFor(client.name || client.company || `client${client.id}`);
        await db.update(clients).set({ figgyEmail }).where(eq(clients.id, client.id));
        (client as any).figgyEmail = figgyEmail;
      }
      if (client) syncInsert("clients", client);

      // Auto-create recurring tasks if flags are set — but NOT for wholesale
      // (flow-through) clients: they have no books, no close, no compliance tasks.
      // Unified rule engine (one task system; idempotent + full compliance set).
      if (client && isOperationalClient(client.clientType)) {
        await ensureComplianceForClient(client.id, { userId: ctx.user.id, assignedTo: client.assignedTo });
      }

      // Best-effort: provision the standard Drive folder tree under the hardcoded
      // "GFB Clients" parent (no-ops if the Make Drive token isn't set; never blocks
      // creation). Wholesale flow-through clients don't need a working folder set.
      if (client && isOperationalClient(client.clientType)) {
        try {
          const { ensureClientDriveFolder } = await import("./client-drive-folders");
          const { driveConfigured } = await import("./drive-make-bridge");
          if (driveConfigured()) await ensureClientDriveFolder(client.id);
        } catch (e) { console.error("[drive] auto-create on client create failed (non-fatal):", e instanceof Error ? e.message : e); }
      }

      return client;
    }),

  // Manually provision (or repair) a client's Google Drive folder tree under the
  // hardcoded "GFB Clients" parent. Surfaced as the card's "Create Drive folder"
  // button when the link is missing.
  createDriveFolder: authedQuery
    .input(z.object({ clientId: z.number(), force: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const { ensureClientDriveFolder } = await import("./client-drive-folders");
      return ensureClientDriveFolder(input.clientId, { force: input.force });
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
      hasIntercoJournals: z.boolean().optional(),
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

      // Wholesale = flow-through (QBO resale only) → never payroll. If the client
      // is (or is being set) wholesale, force payroll OFF regardless of input.
      const wholesale = ((updates as any).clientType ?? currentClient?.clientType) === "wholesale";
      const effHasPayroll = wholesale ? false : hasPayroll;
      const effPayrollFreq = wholesale ? null : payrollFrequency;

      await db
        .update(clients)
        .set({
          ...updates,
          ...(hasHST !== undefined && { hasHST }),
          ...(hstPeriod !== undefined && { hstPeriod }),
          ...(hasWSIB !== undefined && { hasWSIB }),
          ...(wsibQuarter !== undefined && { wsibQuarter }),
          ...((effHasPayroll !== undefined || wholesale) && { hasPayroll: effHasPayroll }),
          ...((effPayrollFreq !== undefined || wholesale) && { payrollFrequency: effPayrollFreq }),
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

      // RECONCILE the task list to the client's current flags on every edit: adds
      // what's now enabled AND removes what's no longer enabled (turn HST off → its
      // tasks leave; switch to wholesale/inactive → everything leaves). One engine
      // → the card always matches the intake. Idempotent + best-effort.
      if (updated) {
        try { await reconcileClientFromIntake(updated.id, { userId: ctx.user.id, assignedTo: updated.assignedTo }); }
        catch (e) { console.error("[client.update] reconcile failed (non-fatal):", e instanceof Error ? e.message : e); }
        // touch the unused vars so the diff intent stays clear
        void wasHst; void wasWsib; void wasPayroll; void wasDividends;
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

  // Merge a DUPLICATE client into a keeper. Moves EVERY related record
  // (auto-discovers all tables with a clientId column, so nothing is orphaned now
  // or in future), fills any blank fields on the keeper from the duplicate, then
  // deletes the duplicate. keepId = the record to keep (the one with most info).
  merge: authedQuery
    .input(z.object({ keepId: z.number(), dupeId: z.number() }))
    .mutation(async ({ input }) => {
      const { keepId, dupeId } = input;
      if (keepId === dupeId) throw new Error("Pick two different clients to merge.");
      const db = getDb();
      const keep = (await db.select().from(clients).where(eq(clients.id, keepId)).limit(1))[0] as any;
      const dupe = (await db.select().from(clients).where(eq(clients.id, dupeId)).limit(1))[0] as any;
      if (!keep || !dupe) throw new Error("One of those clients no longer exists.");

      // 1) Re-point every table that references a client to the keeper.
      const moved: Record<string, number> = {};
      const tbls: any = await db.run(sql`SELECT name FROM sqlite_master WHERE type='table'`);
      for (const row of (tbls?.rows ?? tbls ?? [])) {
        const t = String((row as any).name ?? (row as any)[0] ?? "");
        if (!t || t === "clients" || t.startsWith("sqlite_")) continue;
        let cols: any;
        try { cols = await db.run(sql.raw(`PRAGMA table_info("${t}")`)); } catch { continue; }
        const names = new Set<string>();
        for (const c of (cols?.rows ?? cols ?? [])) names.add(String((c as any).name ?? (c as any)[1] ?? ""));
        if (!names.has("clientId")) continue;
        try {
          const res: any = await db.run(sql.raw(`UPDATE "${t}" SET "clientId" = ${keepId} WHERE "clientId" = ${dupeId}`));
          const n = res?.rowsAffected ?? res?.changes ?? 0;
          if (n) moved[t] = n;
        } catch (e) { console.error(`[merge] ${t} failed:`, e instanceof Error ? e.message : e); }
      }

      // 2) Fill blank keeper fields from the duplicate (don't overwrite real data).
      const fill: Record<string, any> = {};
      for (const [k, v] of Object.entries(dupe)) {
        if (k === "id") continue;
        const cur = keep[k];
        const curEmpty = cur === null || cur === undefined || cur === "" ;
        const dupHas = v !== null && v !== undefined && v !== "";
        if (curEmpty && dupHas) fill[k] = v;
      }
      if (Object.keys(fill).length) {
        try { await db.update(clients).set({ ...fill, updatedAt: new Date() }).where(eq(clients.id, keepId)); } catch (e) { console.error("[merge] fill keeper failed:", e); }
      }

      // 3) Remove the duplicate.
      await db.delete(clients).where(eq(clients.id, dupeId));
      return { success: true, keepId, dupeId, moved, filledFields: Object.keys(fill) };
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
