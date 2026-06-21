import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, tasks, invoices, triageFindings, practiceSnapshots, clientSnapshots } from "../db/schema";
import { eq, and, ne, count, sql } from "drizzle-orm";
import { computePortfolio } from "./month-end-router";

/**
 * DASHBOARD TRENDS — daily practice snapshots.
 * A cheap nightly job records one row of practice-wide aggregates per day, so
 * the dashboard can draw REAL over-time trend lines (close health, task load,
 * outstanding $, review queue) rather than point-in-time bars. DB-only.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Capture today's snapshot (idempotent — overwrites today's row if re-run). */
export async function capturePracticeSnapshot(): Promise<void> {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const weekAhead = new Date(startToday.getTime() + 7 * DAY_MS);

    const allClients = await db.select().from(clients);
    const clientsActive = (allClients as any[]).filter((c) => c.status === "active").length;
    const leads = (allClients as any[]).filter((c) => ["new_lead", "discovery_call", "quote_sent", "quote_approved", "engagement_sent"].includes(c.workflowStatus));
    const pipelineValue = leads.reduce((s, c: any) => s + (c.estimatedMonthlyValue || 0), 0);

    const openTasks = await db.select().from(tasks).where(ne(tasks.status, "completed"));
    let tasksOverdue = 0, tasksUpcoming = 0;
    for (const t of openTasks as any[]) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      if (d < startToday) tasksOverdue++;
      else if (d < weekAhead) tasksUpcoming++;
    }

    const allInvoices = await db.select().from(invoices);
    const invoiceOutstanding = (allInvoices as any[]).filter((i) => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + (i.amount || 0), 0);
    const invoiceRevenue = (allInvoices as any[]).filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0);

    const reviewRows = await db.select({ n: count() }).from(triageFindings).where(eq(triageFindings.status, "new"));
    const toReviewTotal = Number(reviewRows[0]?.n ?? 0);

    // Reuse the exact close-status logic from the portfolio board.
    const port = await computePortfolio(new Date());

    const row = {
      date: today,
      clientsActive, clientsTotal: allClients.length,
      closeRed: port.summary.red, closeYellow: port.summary.yellow, closeGreen: port.summary.green,
      toReviewTotal,
      tasksOverdue, tasksUpcoming, tasksPending: openTasks.length,
      invoiceOutstanding, invoiceRevenue,
      pipelineValue, pipelineLeads: leads.length,
    };

    const existing = await db.select().from(practiceSnapshots).where(eq(practiceSnapshots.date, today)).limit(1);
    if (existing[0]) await db.update(practiceSnapshots).set(row).where(eq(practiceSnapshots.date, today));
    else await db.insert(practiceSnapshots).values(row);

    // Per-client rows (to-post backlog + close health over time) for the cockpit sparkline.
    const openByClient = new Map<number, number>();
    for (const t of openTasks as any[]) if (t.clientId != null) openByClient.set(t.clientId, (openByClient.get(t.clientId) ?? 0) + 1);
    for (const c of port.clients as any[]) {
      const crow = { clientId: c.clientId, date: today, toReview: c.toReview ?? 0, closeStatus: c.status as string, openTasks: openByClient.get(c.clientId) ?? 0 };
      const ex = await db.select().from(clientSnapshots).where(and(eq(clientSnapshots.clientId, c.clientId), eq(clientSnapshots.date, today))).limit(1);
      if (ex[0]) await db.update(clientSnapshots).set(crow).where(eq(clientSnapshots.id, ex[0].id));
      else await db.insert(clientSnapshots).values(crow);
    }
    console.log(`[snapshot] practice + ${port.clients.length} client snapshots captured for ${today}`);
  } catch (e) {
    console.error("[snapshot] capture failed:", e instanceof Error ? e.message : e);
  }
}

export const dashboardRouter = createRouter({
  // Daily snapshots for the trend lines (oldest → newest), last N days.
  trends: authedQuery
    .input(z.object({ days: z.number().min(2).max(365).default(30) }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(practiceSnapshots).orderBy(sql`date asc`);
      const days = input?.days ?? 30;
      return (rows as any[]).slice(-days);
    }),

  // Per-client trend (to-post backlog + close health over time) for the cockpit.
  clientTrend: authedQuery
    .input(z.object({ clientId: z.number(), days: z.number().min(2).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(clientSnapshots).where(eq(clientSnapshots.clientId, input.clientId)).orderBy(sql`date asc`);
      return (rows as any[]).slice(-input.days);
    }),
});
