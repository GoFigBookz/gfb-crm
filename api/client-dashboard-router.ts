import { z } from "zod";
import { createRouter, authedQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, clientDashboardSnapshots, clientCashSnapshots, clients, timesheets, clientOnboarding, qboCustomers, qboInvoices, qboPayments } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

/** Parse a stored cash snapshot row's JSON fields + derive a risk flag. */
function shapeCashSnapshot(s: any) {
  if (!s) return null;
  const bankAccounts = (() => { try { return s.bankAccounts ? JSON.parse(s.bankAccounts) : []; } catch { return []; } })();
  const staleAccounts = (() => { try { return s.staleAccounts ? JSON.parse(s.staleAccounts) : []; } catch { return []; } })();
  // Risk: red = can't cover payroll; amber = stale feed or negative cash; else green.
  let risk: "red" | "amber" | "green" = "green";
  const reasons: string[] = [];
  if (s.coversPayroll === false) { risk = "red"; reasons.push(`Cash $${Math.round(s.cashCad || 0).toLocaleString()} < payroll $${Math.round(s.upcomingPayrollAmount || 0).toLocaleString()} (transfer $${Math.round(s.payrollShortfall || 0).toLocaleString()})`); }
  if ((s.cashCad || 0) < 0) { if (risk !== "red") risk = "amber"; reasons.push("Negative CAD cash"); }
  if (staleAccounts.length || (s.staleFeedDays != null && s.staleFeedDays >= 14)) { if (risk !== "red") risk = "amber"; reasons.push(staleAccounts.length ? `Stale feed: ${staleAccounts.join(", ")}` : `No bank activity in ${s.staleFeedDays}d`); }
  if ((s.uncategorizedCount || 0) > 0) { reasons.push(`${s.uncategorizedCount} uncategorized to post`); }
  return { ...s, bankAccounts, staleAccounts, risk, reasons };
}

export const clientDashboardRouter = createRouter({
  /** LIVE high-level QBO numbers for the client card (read-only; no posting). Cash,
   *  credit-card owed, A/R, A/P, uncategorized, and fiscal-YTD revenue/expense/net.
   *  NOT all transactions — just the cockpit glance (Markie 2026-06-27). */
  qboOverview: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const { getConnectionForClient } = await import("./qbo-vendor-brain");
      const { qboRequest } = await import("./qbo-router");
      const { bankBreakdownFromAccounts } = await import("./qbo-cashflow");
      const { profitAndLossFromReport } = await import("./qbo-snapshot");
      const cr = await getConnectionForClient(input.clientId);
      if ("error" in cr) return { ok: false as const, error: cr.error };
      const conn = cr.conn;
      const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
      try {
        const data: any = await qboRequest(conn, `/query?query=${encodeURIComponent("SELECT * FROM Account MAXRESULTS 1000")}`);
        const accounts: any[] = data?.QueryResponse?.Account ?? [];
        const rows = accounts.map((a) => ({ name: a.Name, accountType: a.AccountType, currentBalance: num(a.CurrentBalance), currencyRef: a.CurrencyRef?.value, active: a.Active }));
        const bank = bankBreakdownFromAccounts(rows);
        const ar = accounts.filter((a) => /receivable/i.test(a.AccountType || "")).reduce((s, a) => s + num(a.CurrentBalance), 0);
        const ap = accounts.filter((a) => /payable/i.test(a.AccountType || "")).reduce((s, a) => s + Math.abs(num(a.CurrentBalance)), 0);
        // Fiscal-YTD P&L (calendar-year-to-date is fine for the glance).
        const today = new Date().toISOString().slice(0, 10);
        const yStart = `${today.slice(0, 4)}-01-01`;
        let pnl: { revenue: number | null; expenses: number | null; netIncome: number | null } = { revenue: null, expenses: null, netIncome: null };
        try { pnl = profitAndLossFromReport(await qboRequest(conn, `/reports/ProfitAndLoss?start_date=${yStart}&end_date=${today}`)); } catch { /* P&L best-effort */ }
        const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
        return {
          ok: true as const,
          companyName: (conn as any).companyName || "",
          transport: (conn as any).transport || "native",
          cashTotal: r2(bank.cashTotal), cashCad: r2(bank.cashCad), cashUsd: r2(bank.cashUsd),
          creditCardOwed: r2(bank.creditCardOwed), uncategorized: r2(bank.uncategorizedBalance), uncategorizedCount: bank.uncategorizedCount,
          ar: r2(ar), ap: r2(ap),
          revenue: pnl.revenue, expenses: pnl.expenses, netIncome: pnl.netIncome,
          bankAccounts: bank.bankAccounts, periodFrom: yStart, periodTo: today,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/async ack|non-JSON|Make bridge/i.test(msg)) return { ok: false as const, error: "bridge_not_returning_data" };
        return { ok: false as const, error: msg };
      }
    }),

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

  // Latest cash-flow snapshot for one client (parsed + risk-flagged).
  getCashFlow: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(clientCashSnapshots)
        .where(eq(clientCashSnapshots.clientId, input.clientId))
        .orderBy(desc(clientCashSnapshots.date), desc(clientCashSnapshots.id)).limit(1);
      return shapeCashSnapshot(rows[0]);
    }),

  // Portfolio "Cash Watch": every client's latest cash snapshot, worst first.
  cashWatch: authedQuery.query(async () => {
    const db = getDb();
    const snaps = await db.select().from(clientCashSnapshots).orderBy(desc(clientCashSnapshots.date), desc(clientCashSnapshots.id));
    const latestByClient = new Map<number, any>();
    for (const s of snaps as any[]) if (!latestByClient.has(s.clientId)) latestByClient.set(s.clientId, s);
    const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);
    const nameById = new Map((clientRows as any[]).map((c) => [c.id, c.name]));
    const order = { red: 0, amber: 1, green: 2 } as const;
    const list = Array.from(latestByClient.values())
      .map((s) => ({ ...shapeCashSnapshot(s), clientName: nameById.get(s.clientId) || `Client ${s.clientId}` }))
      .sort((a, b) => (order[a.risk] - order[b.risk]) || ((b.payrollShortfall || 0) - (a.payrollShortfall || 0)));
    return {
      clients: list,
      summary: {
        total: list.length,
        cantCoverPayroll: list.filter((c) => c.coversPayroll === false).length,
        staleFeeds: list.filter((c) => c.staleAccounts?.length || (c.staleFeedDays != null && c.staleFeedDays >= 14)).length,
        totalCadCash: list.reduce((s, c) => s + (c.cashCad || 0), 0),
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
