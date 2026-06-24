import { z } from "zod";
import { createRouter, authedQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, clientDashboardSnapshots, timesheets, clientOnboarding, qboCustomers, qboInvoices, qboPayments } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const clientDashboardRouter = createRouter({
  // Get all dashboard data for a client
  getByClient: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId } = input;

      // Client tasks
      const clientTasks = await db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.clientId, clientId),
          eq(tasks.userId, ctx.user.id)
        ))
        .orderBy(desc(tasks.dueDate));

      // Dashboard snapshot (latest). NOT filtered by user — a client's books are
      // firm-wide, and the scheduled QBO sync writes under the firm user, so any
      // staff viewing the client must see the same financials.
      const snapshots = await db
        .select()
        .from(clientDashboardSnapshots)
        .where(eq(clientDashboardSnapshots.clientId, clientId))
        .orderBy(desc(clientDashboardSnapshots.createdAt))
        .limit(1);

      // Timesheets
      const clientTimesheets = await db
        .select()
        .from(timesheets)
        .where(eq(timesheets.clientId, clientId))
        .orderBy(desc(timesheets.payPeriodEnd));

      // Onboarding data for CRA/WSIB numbers
      const onboardingData = await db
        .select()
        .from(clientOnboarding)
        .where(eq(clientOnboarding.clientId, clientId))
        .orderBy(desc(clientOnboarding.createdAt))
        .limit(1);

      return {
        tasks: clientTasks,
        snapshot: snapshots[0] || null,
        timesheets: clientTimesheets,
        onboarding: onboardingData[0] || null,
      };
    }),

  // Save a manual snapshot
  saveSnapshot: staffQuery
    .input(z.object({
      clientId: z.number(),
      revenue: z.number().optional(),
      expenses: z.number().optional(),
      netIncome: z.number().optional(),
      assets: z.number().optional(),
      liabilities: z.number().optional(),
      equity: z.number().optional(),
      periodStart: z.date().optional(),
      periodEnd: z.date().optional(),
      source: z.enum(["qbo", "manual", "import"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId, ...data } = input;
      const [snapshot] = await db.insert(clientDashboardSnapshots).values({
        clientId,
        userId: ctx.user.id,
        ...data,
      }).returning();
      return snapshot;
    }),

  // Add/update timesheet
  saveTimesheet: staffQuery
    .input(z.object({
      id: z.number().optional(),
      clientId: z.number(),
      employeeId: z.number(),
      payPeriodStart: z.date(),
      payPeriodEnd: z.date(),
      regularHours: z.number().default(0),
      overtimeHours: z.number().default(0),
      vacationHours: z.number().default(0),
      sickHours: z.number().default(0),
      statHolidayHours: z.number().default(0),
      hourlyRate: z.number().optional(),
      overtimeRate: z.number().optional(),
      status: z.enum(["draft", "submitted", "approved", "paid"]).default("draft"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;

      if (id) {
        await db.update(timesheets)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(timesheets.id, id));
        const rows = await db.select().from(timesheets).where(eq(timesheets.id, id)).limit(1);
        return rows[0];
      } else {
        const [ts] = await db.insert(timesheets).values({
          ...data,
          approvedBy: data.status === "approved" ? ctx.user.id : undefined,
          approvedAt: data.status === "approved" ? new Date() : undefined,
        }).returning();
        return ts;
      }
    }),

  // QBO Billing verification per client
  getQboBilling: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      // Find the client's QBO customer link
      const qboCustomerRows = await db
        .select()
        .from(qboCustomers)
        .where(eq(qboCustomers.qboCustomerId, String(input.clientId)))
        .limit(1);

      // If no direct match, we can't sync - return empty
      // In real implementation, you'd link via clients.qboCustomerId
      // For now, get all invoices and payments for demo
      const allInvoices = await db
        .select()
        .from(qboInvoices)
        .orderBy(desc(qboInvoices.transactionDate))
        .limit(50);

      const allPayments = await db
        .select()
        .from(qboPayments)
        .orderBy(desc(qboPayments.transactionDate))
        .limit(50);

      // Calculate totals
      const totalInvoiced = allInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const totalPaid = allPayments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
      const outstanding = allInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

      return {
        invoices: allInvoices,
        payments: allPayments,
        summary: {
          totalInvoiced,
          totalPaid,
          outstanding,
          invoiceCount: allInvoices.length,
          paymentCount: allPayments.length,
        },
      };
    }),

  // Get all timesheets for a client grouped by pay period
  getTimesheetsByPeriod: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(timesheets)
        .where(eq(timesheets.clientId, input.clientId))
        .orderBy(desc(timesheets.payPeriodEnd));

      // Group by pay period
      const periods = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = `${row.payPeriodStart?.toISOString()}-${row.payPeriodEnd?.toISOString()}`;
        if (!periods.has(key)) periods.set(key, []);
        periods.get(key)!.push(row);
      }

      return Array.from(periods.entries()).map(([key, entries]) => ({
        periodKey: key,
        payPeriodStart: entries[0].payPeriodStart,
        payPeriodEnd: entries[0].payPeriodEnd,
        entries,
        totalRegularHours: entries.reduce((s, e) => s + (e.regularHours || 0), 0),
        totalOvertimeHours: entries.reduce((s, e) => s + (e.overtimeHours || 0), 0),
        totalVacationHours: entries.reduce((s, e) => s + (e.vacationHours || 0), 0),
      }));
    }),
});
