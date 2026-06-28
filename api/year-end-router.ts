/**
 * YEAR-END REVIEW ROUTER — the close-out + accountant-package flow.
 * =============================================================================
 * Start review → work the checklist → Close (gated on the required items) →
 * build the accountant Package. Per-client, per-fiscal-year. Read-mostly; the
 * only writes are the review row + checklist progress + notes. The Package step
 * pulls TB/GL/BS/P&L from QBO READ-ONLY and best-effort — if a report can't be
 * fetched, the manifest says "pull manually" rather than faking it (honest by
 * design). NOTHING posts to QBO. Isolation via getConnectionForClient.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { yearEndReviews, yearEndItems, clientReconAccounts, clients } from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  YEAR_END_CHECKLIST, summarizeYearEnd, buildPackageManifest, fiscalYearEndDate, fiscalYearLabel,
  type YearEndItemState,
} from "./year-end-core";
import { summarizeRecon, accountStatus, type ReconAccount } from "./recon-tracker-core";

/** Pull this client's recon rollup for the year-end period (best-effort; null if none). */
async function reconForPeriod(clientId: number, periodEnd: string) {
  const db = getDb();
  const rows = await db.select().from(clientReconAccounts)
    .where(and(eq(clientReconAccounts.clientId, clientId), eq(clientReconAccounts.active, true)));
  if (!rows.length) return null;
  const roll = summarizeRecon(rows as any[], periodEnd);
  const reconciledThrough = (rows as any[]).filter((r) => accountStatus(r as ReconAccount, periodEnd).current).length;
  return { totalAccounts: roll.total, reconciledThrough, behind: roll.behind };
}

function itemStates(items: any[]): YearEndItemState[] {
  return items.map((i) => ({ key: i.itemKey, done: !!i.done, na: !!i.na, note: i.note }));
}

export const yearEndRouter = createRouter({
  /** All year-end reviews for a client (newest first). */
  listForClient: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(yearEndReviews)
        .where(eq(yearEndReviews.clientId, input.clientId))
        .orderBy(desc(yearEndReviews.fiscalYear));
      return { reviews: rows };
    }),

  /** Start (or fetch) the review for a client + fiscal year, seeding the standard checklist. */
  start: authedQuery
    .input(z.object({ clientId: z.number(), fiscalYear: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
      const fyeMonth = (client as any)?.fiscalYearEndMonth ?? 12;
      // Default to the most recently COMPLETED fiscal year.
      const now = new Date();
      let fy = input.fiscalYear;
      if (!fy) {
        const thisYearEnd = new Date(fiscalYearEndDate(now.getUTCFullYear(), fyeMonth) + "T00:00:00Z");
        fy = thisYearEnd.getTime() <= now.getTime() ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      }
      const fiscalYearEnd = fiscalYearEndDate(fy, fyeMonth);

      const existing = await db.select().from(yearEndReviews)
        .where(and(eq(yearEndReviews.clientId, input.clientId), eq(yearEndReviews.fiscalYear, fy)));
      if (existing[0]) return { review: existing[0], created: false };

      const [review] = await db.insert(yearEndReviews).values({
        clientId: input.clientId, fiscalYear: fy, fiscalYearEnd, status: "in_progress",
        accountantName: (client as any)?.accountantName ?? null,
        accountantEmail: (client as any)?.accountantEmail ?? null,
        startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      }).returning();

      let order = 0;
      for (const def of YEAR_END_CHECKLIST) {
        await db.insert(yearEndItems).values({
          reviewId: (review as any).id, itemKey: def.key, label: def.label, phase: def.phase,
          done: false, na: false, sortOrder: order++, updatedAt: new Date(),
        });
      }
      return { review, created: true };
    }),

  /** Full review state: review + checklist items + recon rollup + package manifest. */
  get: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [review] = await db.select().from(yearEndReviews).where(eq(yearEndReviews.id, input.reviewId));
      if (!review) return { ok: false as const, error: "not_found" };
      const items = await db.select().from(yearEndItems)
        .where(eq(yearEndItems.reviewId, input.reviewId)).orderBy(asc(yearEndItems.sortOrder));
      const recon = await reconForPeriod((review as any).clientId, (review as any).fiscalYearEnd || fiscalYearEndDate((review as any).fiscalYear));
      const states = itemStates(items as any[]);
      const summary = summarizeYearEnd(states);
      const manifest = buildPackageManifest({
        recon, items: states,
        accountant: { name: (review as any).accountantName, email: (review as any).accountantEmail },
        notes: (review as any).notes,
      });
      return {
        ok: true as const,
        review, items,
        label: fiscalYearLabel((review as any).fiscalYear, (review as any).fiscalYearEnd),
        recon, summary, manifest,
      };
    }),

  /** Toggle / annotate one checklist item. */
  setItem: authedQuery
    .input(z.object({ id: z.number(), done: z.boolean().optional(), na: z.boolean().optional(), note: z.string().max(1000).nullable().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const patch: any = { updatedAt: new Date() };
      if (input.done !== undefined) patch.done = input.done;
      if (input.na !== undefined) patch.na = input.na;
      if (input.note !== undefined) patch.note = input.note;
      await db.update(yearEndItems).set(patch).where(eq(yearEndItems.id, input.id));
      return { ok: true };
    }),

  setAccountant: authedQuery
    .input(z.object({ reviewId: z.number(), accountantName: z.string().max(200).nullable().optional(), accountantEmail: z.string().max(200).nullable().optional() }))
    .mutation(async ({ input }) => {
      await getDb().update(yearEndReviews).set({
        accountantName: input.accountantName ?? null, accountantEmail: input.accountantEmail ?? null, updatedAt: new Date(),
      }).where(eq(yearEndReviews.id, input.reviewId));
      return { ok: true };
    }),

  updateNotes: authedQuery
    .input(z.object({ reviewId: z.number(), notes: z.string().max(20000) }))
    .mutation(async ({ input }) => {
      await getDb().update(yearEndReviews).set({ notes: input.notes, updatedAt: new Date() }).where(eq(yearEndReviews.id, input.reviewId));
      return { ok: true };
    }),

  /** Mark the year CLOSED — gated on every required checklist item being done/na. */
  close: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const items = await db.select().from(yearEndItems).where(eq(yearEndItems.reviewId, input.reviewId));
      const summary = summarizeYearEnd(itemStates(items as any[]));
      if (!summary.canClose) return { ok: false as const, error: "blocked", blockers: summary.blockers };
      await db.update(yearEndReviews).set({ status: "closed", closedAt: new Date(), updatedAt: new Date() }).where(eq(yearEndReviews.id, input.reviewId));
      return { ok: true as const };
    }),

  /** Reopen a closed/packaged review to keep working. */
  reopen: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().update(yearEndReviews).set({ status: "in_progress", closedAt: null, packagedAt: null, updatedAt: new Date() }).where(eq(yearEndReviews.id, input.reviewId));
      return { ok: true };
    }),

  /**
   * BUILD THE ACCOUNTANT PACKAGE. Pulls TB / GL / BS / P&L from QBO read-only and
   * best-effort; whatever can't be fetched is flagged "pull manually" in the manifest
   * (never faked). Marks the review packaged. Returns the manifest + per-report status.
   */
  buildPackage: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [review] = await db.select().from(yearEndReviews).where(eq(yearEndReviews.id, input.reviewId));
      if (!review) return { ok: false as const, error: "not_found" };
      const clientId = (review as any).clientId;
      const fye = (review as any).fiscalYearEnd || fiscalYearEndDate((review as any).fiscalYear);
      // Full-year report window: start_date = the day after the prior year-end.
      const yearStart = (() => {
        const d = new Date(fye + "T00:00:00Z");
        d.setUTCFullYear(d.getUTCFullYear() - 1);
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
      })();

      const reports: { trialBalance?: boolean; generalLedger?: boolean; balanceSheet?: boolean; profitAndLoss?: boolean } = {};
      const reportErrors: string[] = [];
      let qboConnected: boolean | undefined = undefined;

      try {
        const { getConnectionForClient } = await import("./qbo-vendor-brain");
        const { qboRequest } = await import("./qbo-router");
        const cr = await getConnectionForClient(clientId);
        if ("error" in cr) {
          qboConnected = false;
        } else {
          qboConnected = true;
          const conn = cr.conn;
          const tryReport = async (key: keyof typeof reports, path: string) => {
            try {
              const data = await qboRequest(conn, path);
              const hasRows = data && (data.Rows || data.Header || data.Columns);
              reports[key] = !!hasRows;
              if (!hasRows) reportErrors.push(`${key}: empty`);
            } catch (e) {
              reports[key] = false;
              reportErrors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
            }
          };
          await tryReport("trialBalance", `/reports/TrialBalance?start_date=${yearStart}&end_date=${fye}`);
          await tryReport("balanceSheet", `/reports/BalanceSheet?start_date=${yearStart}&end_date=${fye}`);
          await tryReport("profitAndLoss", `/reports/ProfitAndLoss?start_date=${yearStart}&end_date=${fye}`);
          await tryReport("generalLedger", `/reports/GeneralLedger?start_date=${yearStart}&end_date=${fye}&columns=tx_date,name,memo,account_name,debt_amt,credit_amt`);
        }
      } catch (e) {
        reportErrors.push(`connection: ${e instanceof Error ? e.message : String(e)}`);
      }

      const items = await db.select().from(yearEndItems).where(eq(yearEndItems.reviewId, input.reviewId)).orderBy(asc(yearEndItems.sortOrder));
      const recon = await reconForPeriod(clientId, fye);
      const states = itemStates(items as any[]);
      const manifest = buildPackageManifest({
        reports, qboConnected, recon, items: states,
        accountant: { name: (review as any).accountantName, email: (review as any).accountantEmail },
        notes: (review as any).notes,
      });

      await db.update(yearEndReviews).set({
        status: (review as any).status === "in_progress" ? "in_progress" : (review as any).status, // packaging doesn't force a close
        packagedAt: new Date(), updatedAt: new Date(),
      }).where(eq(yearEndReviews.id, input.reviewId));

      return { ok: true as const, manifest, reports, qboConnected: qboConnected ?? false, reportErrors, period: { start: yearStart, end: fye } };
    }),

  remove: authedQuery
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(yearEndItems).where(eq(yearEndItems.reviewId, input.reviewId));
      await db.delete(yearEndReviews).where(eq(yearEndReviews.id, input.reviewId));
      return { ok: true };
    }),
});
