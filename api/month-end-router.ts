/**
 * FIGGY JR — MONTH-END CLOSE STATUS (tRPC)
 * =============================================================================
 * Gathers the cheap, reliable signals for a client and runs them through the
 * pure core (`month-end-core.ts`) to answer "where is this client in their
 * month-end close": transactions awaiting review, HST due/filed, year-end,
 * checklist %. Per-client AND a portfolio rollup (the "who's behind" board) —
 * both off the SAME core. DB-only (no live-QBO fan-out) so the board is cheap
 * and never threatens the Make ops cap.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, triageFindings, monthlyCloseChecklist, qboCustomers, tasks } from "../db/schema";
import { eq, and, count, ne } from "drizzle-orm";
import {
  computeHstStatus, computeYearEndStatus, rollUpCloseStatus,
  isOperationalClient, isRelevantForPeriod,
  type HstPeriod, type MonthAbbr,
} from "./month-end-core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Count Triage findings still awaiting review for a client (the "to post" queue). */
async function countToReview(db: any, clientId: number): Promise<number> {
  const rows = await db.select({ n: count() }).from(triageFindings)
    .where(and(eq(triageFindings.clientId, clientId), eq(triageFindings.status, "new")));
  return Number(rows[0]?.n ?? 0);
}

/** Count a client's still-open (active, not completed) tasks — cheap DB count.
 *  Used to keep annual clients on the board until their year-end work is done. */
async function countOpenTasks(db: any, clientId: number): Promise<number> {
  const rows = await db.select({ n: count() }).from(tasks)
    .where(and(eq(tasks.clientId, clientId), ne(tasks.status, "completed")));
  return Number(rows[0]?.n ?? 0);
}

/** Latest close-checklist % for the current month, or null if none started. */
async function currentChecklistPercent(db: any, clientId: number, asOf: Date): Promise<number | null> {
  const rows = await db.select().from(monthlyCloseChecklist)
    .where(and(
      eq(monthlyCloseChecklist.clientId, clientId),
      eq(monthlyCloseChecklist.year, asOf.getUTCFullYear()),
      eq(monthlyCloseChecklist.month, asOf.getUTCMonth() + 1),
    )).limit(1);
  return rows[0] ? Number(rows[0].completionPercent ?? 0) : null;
}

/** Best-effort scorecard signals (last HST filed / last reconciled) if we have a
 *  qboCustomers row for the client. Honest: absent => unknown (never false green). */
async function scorecard(db: any, clientId: number): Promise<{ lastHstFiled: Date | null; lastReconciled: Date | null }> {
  try {
    const rows = await db.select().from(qboCustomers).where(eq(qboCustomers.clientId, clientId)).limit(1);
    const r = rows[0];
    return { lastHstFiled: r?.lastHstFiled ?? null, lastReconciled: r?.lastReconciledDate ?? null };
  } catch { return { lastHstFiled: null, lastReconciled: null }; }
}

function fiscalYearEndMonthNum(yearEndMonth: string | null | undefined): number | null {
  if (!yearEndMonth) return null;
  const i = MONTHS.indexOf(yearEndMonth);
  return i < 0 ? null : i + 1;
}

/** Assemble one client's full close status. */
async function statusForClient(db: any, client: typeof clients.$inferSelect, asOf: Date) {
  const [toReview, checklistPercent, sc] = await Promise.all([
    countToReview(db, client.id),
    currentChecklistPercent(db, client.id, asOf),
    scorecard(db, client.id),
  ]);
  const hst = computeHstStatus({
    hasHST: Boolean(client.hasHST),
    period: (client.hstPeriod as HstPeriod | null) ?? null,
    asOf,
    lastFiled: sc.lastHstFiled,
    fiscalYearEndMonth: fiscalYearEndMonthNum(client.yearEndMonth),
  });
  const yearEnd = computeYearEndStatus({ yearEndMonth: (client.yearEndMonth as MonthAbbr | null) ?? null, asOf });
  const roll = rollUpCloseStatus({ toReview, checklistPercent, hst, yearEnd });

  // Missing required setup info (CRA BN is the urgent one).
  const missing: string[] = [];
  if (!client.taxId) missing.push("CRA #");
  if (client.hasHST && !client.hstNumber) missing.push("HST #");
  if (client.hasPayroll && !(client as any).payrollRpNumber) missing.push("Payroll #");
  if (client.hasWSIB && !client.wsibAccountNumber) missing.push("WSIB #");

  return {
    clientId: client.id,
    clientName: client.name,
    company: client.company ?? null,
    lastReconciled: sc.lastReconciled ? sc.lastReconciled.toISOString().slice(0, 10) : null,
    missing,
    ...roll,
  };
}

export const monthEndRouter = createRouter({
  // Deep per-client status for the client page cockpit.
  getClientStatus: authedQuery
    .input(z.object({ clientId: z.number(), asOf: z.string().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const asOf = input.asOf ? new Date(input.asOf) : new Date();
      const rows = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!rows[0]) return null;
      return statusForClient(db, rows[0], asOf);
    }),

  // Portfolio "who's behind" board — every active client, cheap (DB only).
  // Sorted worst-first so the clients needing attention float to the top.
  getPortfolio: authedQuery
    .input(z.object({ asOf: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const asOf = input?.asOf ? new Date(input.asOf) : new Date();
      const active = await db.select().from(clients).where(eq(clients.status, "active"));
      // Wholesale (flow-through) clients aren't bookkeeping engagements — keep
      // them off the close board entirely.
      const operational = active.filter((c) => isOperationalClient((c as any).clientType));
      const out = [];
      for (const c of operational) {
        const row = await statusForClient(db, c, asOf);
        // Annual clients stay on the board until their year-end work is done —
        // gauge "open work" from open tasks + backlog + a non-green close.
        let openWork: boolean | undefined;
        if (((c as any).clientType) === "annual") {
          const openTasks = await countOpenTasks(db, c.id);
          openWork = openTasks > 0 || row.toReview > 0 || row.status !== "green";
        }
        out.push({
          ...row,
          clientType: ((c as any).clientType || "monthly") as string,
          relevantThisPeriod: isRelevantForPeriod({ ...(c as any), openWork }, asOf),
        });
      }
      const rank = { red: 0, yellow: 1, green: 2 } as const;
      out.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.toReview - a.toReview));
      const relevant = out.filter((o) => o.relevantThisPeriod);
      const summary = {
        total: out.length,
        relevant: relevant.length,
        offCadence: out.length - relevant.length,
        red: relevant.filter((o) => o.status === "red").length,
        yellow: relevant.filter((o) => o.status === "yellow").length,
        green: relevant.filter((o) => o.status === "green").length,
        toReviewTotal: relevant.reduce((s, o) => s + o.toReview, 0),
      };
      return { clients: out, summary };
    }),
});
