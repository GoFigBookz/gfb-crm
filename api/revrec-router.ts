/**
 * REVENUE RECOGNITION (WIP) ROUTER
 * =============================================================================
 * Per-client percentage-of-completion revenue recognition. Phase 1 (live):
 * projects, period %/billings entry, computed schedule, full-year revenue
 * calendar, per-client config + account mapping, branded read-only client share
 * link. Phase 2 (built, review-gated): generate DRAFT journal entries — they are
 * NEVER posted to QBO from here; posting is a separate, explicitly-mapped step.
 *
 * Guardrails baked in:
 *  - Everything scoped by clientId (per-client isolation).
 *  - Account mapping is explicit per client — we never guess a QBO account id.
 *  - JE generation produces DRAFTS only; validateForPosting gates any future post.
 *  - The public share view is read-only and revocable by token.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, rrProjects, rrProgress, rrJe, rrJeLines, rrAccountMap, rrClientConfig, rrShareLinks } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  buildProjectSchedule,
  buildRevenueCalendar,
  fiscalYearMonths,
  generateJeForPeriod,
  validateForPosting,
  rollupProject,
  tagJeWithJob,
  type ProjectInput,
  type ProgressInput,
  type AccountMapResolved,
} from "./revrec-core";

const ACCOUNT_KEYS = ["contract_asset", "revenue", "deferred_revenue"] as const;

// ---- helpers ---------------------------------------------------------------

async function loadProjectInputs(clientId: number): Promise<{ project: ProjectInput; progress: ProgressInput[]; raw: any }[]> {
  const db = getDb();
  const projs = await db.select().from(rrProjects).where(eq(rrProjects.clientId, clientId));
  const out: { project: ProjectInput; progress: ProgressInput[]; raw: any }[] = [];
  for (const p of projs as any[]) {
    const prog = await db.select().from(rrProgress).where(eq(rrProgress.projectId, p.id));
    out.push({
      raw: p,
      project: {
        projectId: p.id,
        name: p.name,
        customerJob: p.customerJob,
        contractValue: p.contractValue ?? 0,
        openingPct: p.openingPct ?? 0,
        openingInvoiced: p.openingInvoiced ?? 0,
        holdbackPct: p.holdbackPct ?? 0,
      },
      progress: (prog as any[]).map((r) => ({
        periodKey: r.periodKey,
        pctComplete: r.pctComplete ?? 0,
        invoicedToDate: r.invoicedToDate,
      })),
    });
  }
  return out;
}

async function getConfig(clientId: number): Promise<{ enabled: boolean; fiscalYearStartMonth: number; depositsBookedToRevenue: boolean; pctSource: string | null; pctEnteredByRole: string | null; notes: string | null; jobCostingByProject: boolean; defaultHoldbackPct: number }> {
  const db = getDb();
  const row = (await db.select().from(rrClientConfig).where(eq(rrClientConfig.clientId, clientId)).limit(1))[0] as any;
  return {
    enabled: row?.enabled ?? true,
    fiscalYearStartMonth: row?.fiscalYearStartMonth ?? 1,
    depositsBookedToRevenue: row?.depositsBookedToRevenue ?? false,
    pctSource: row?.pctSource ?? null,
    pctEnteredByRole: row?.pctEnteredByRole ?? null,
    notes: row?.notes ?? null,
    jobCostingByProject: row?.jobCostingByProject ?? false,
    defaultHoldbackPct: row?.defaultHoldbackPct ?? 0,
  };
}

async function getAccountMap(clientId: number): Promise<AccountMapResolved & { _rows: any[] }> {
  const db = getDb();
  const rows = await db.select().from(rrAccountMap).where(eq(rrAccountMap.clientId, clientId));
  const map: AccountMapResolved & { _rows: any[] } = { _rows: rows as any[] };
  for (const r of rows as any[]) (map as any)[r.accountKey] = r.qboAccountId ?? null;
  return map;
}

/** Build the client-facing schedule payload (used by both internal + public views). */
async function buildClientView(clientId: number, fyStartKey?: string) {
  const cfg = await getConfig(clientId);
  const inputs = await loadProjectInputs(clientId);
  const active = inputs.filter((i) => i.raw.status !== "archived");

  const projects = active.map((i) => {
    const schedule = buildProjectSchedule(i.project, i.progress);
    const rollup = rollupProject(i.project, schedule);
    return { id: i.raw.id, status: i.raw.status, schedule, rollup, customerJob: i.project.customerJob ?? null };
  });

  // Default the fiscal year to the calendar year of the most recent progress, or current FY.
  const allPeriods = active.flatMap((i) => i.progress.map((p) => p.periodKey)).sort();
  const latestPeriod = allPeriods.length ? allPeriods[allPeriods.length - 1] : null;
  const fyYear = latestPeriod ? parseInt(latestPeriod.slice(0, 4), 10) : new Date().getUTCFullYear();
  const startKey = fyStartKey ?? `${cfg.fiscalYearStartMonth <= ((latestPeriod ? parseInt(latestPeriod.slice(5), 10) : 12)) ? fyYear : fyYear}-${String(cfg.fiscalYearStartMonth).padStart(2, "0")}`;
  const months = fiscalYearMonths(startKey);
  const calendar = buildRevenueCalendar(
    months,
    projects.map((p) => ({ projectId: p.id, name: p.rollup.name, schedule: p.schedule })),
  );

  const totals = projects.reduce(
    (acc, p) => {
      acc.contractValue += p.rollup.contractValue;
      acc.earnedToDate += p.rollup.earnedToDate;
      acc.invoicedToDate += p.rollup.invoicedToDate;
      acc.contractAsset += p.rollup.contractAsset;
      acc.deferredRevenue += p.rollup.deferredRevenue;
      acc.remainingToEarn += p.rollup.remainingToEarn;
      acc.holdbackReceivable += p.rollup.holdbackReceivable;
      return acc;
    },
    { contractValue: 0, earnedToDate: 0, invoicedToDate: 0, contractAsset: 0, deferredRevenue: 0, remainingToEarn: 0, holdbackReceivable: 0 },
  );

  return { config: cfg, projects, calendar, totals };
}

// ---- router ----------------------------------------------------------------

export const revRecRouter = createRouter({
  // ===== PROJECTS =====
  projectsList: authedQuery
    .input(z.object({ clientId: z.number(), includeArchived: z.boolean().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const conds = [eq(rrProjects.clientId, input.clientId)];
      if (!input.includeArchived) conds.push(eq(rrProjects.status, "active"));
      return db.select().from(rrProjects).where(and(...conds)).orderBy(desc(rrProjects.createdAt));
    }),

  projectCreate: authedQuery
    .input(z.object({
      clientId: z.number(),
      name: z.string().min(1).max(200),
      customerJob: z.string().max(200).nullable().optional(),
      contractValue: z.number().min(0).default(0),
      openingPct: z.number().min(0).max(1).nullable().optional(),
      openingInvoiced: z.number().min(0).nullable().optional(),
      holdbackPct: z.number().min(0).max(1).nullable().optional(),
      startDate: z.date().nullable().optional(),
      expectedEndDate: z.date().nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const res = await db.insert(rrProjects).values({
        clientId: input.clientId,
        name: input.name,
        customerJob: input.customerJob ?? null,
        contractValue: input.contractValue,
        openingPct: input.openingPct ?? 0,
        openingInvoiced: input.openingInvoiced ?? 0,
        holdbackPct: input.holdbackPct ?? 0,
        startDate: input.startDate ?? null,
        expectedEndDate: input.expectedEndDate ?? null,
        notes: input.notes ?? null,
        status: "active",
      } as any);
      return { ok: true, id: Number(res.lastInsertRowid) };
    }),

  projectUpdate: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(200).optional(),
      customerJob: z.string().max(200).nullable().optional(),
      contractValue: z.number().min(0).optional(),
      openingPct: z.number().min(0).max(1).nullable().optional(),
      openingInvoiced: z.number().min(0).nullable().optional(),
      holdbackPct: z.number().min(0).max(1).nullable().optional(),
      startDate: z.date().nullable().optional(),
      expectedEndDate: z.date().nullable().optional(),
      status: z.enum(["active", "complete", "archived"]).optional(),
      notes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...rest } = input;
      await db.update(rrProjects).set({ ...rest, updatedAt: new Date() } as any).where(eq(rrProjects.id, id));
      return { ok: true };
    }),

  projectArchive: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(rrProjects).set({ status: "archived", updatedAt: new Date() }).where(eq(rrProjects.id, input.id));
      return { ok: true };
    }),

  // ===== PROGRESS (period % + billings) =====
  progressUpsert: authedQuery
    .input(z.object({
      projectId: z.number(),
      clientId: z.number(),
      periodKey: z.string().regex(/^\d{4}-\d{2}$/),
      pctComplete: z.number().min(0).max(1),
      invoicedToDate: z.number().min(0).nullable().optional(),
      note: z.string().max(1000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = (await db.select().from(rrProgress)
        .where(and(eq(rrProgress.projectId, input.projectId), eq(rrProgress.periodKey, input.periodKey))).limit(1))[0] as any;
      if (existing) {
        await db.update(rrProgress).set({
          pctComplete: input.pctComplete,
          invoicedToDate: input.invoicedToDate ?? null,
          note: input.note ?? null,
          enteredBy: ctx.user.email ?? String(ctx.user.id),
          updatedAt: new Date(),
        } as any).where(eq(rrProgress.id, existing.id));
      } else {
        await db.insert(rrProgress).values({
          projectId: input.projectId,
          clientId: input.clientId,
          periodKey: input.periodKey,
          pctComplete: input.pctComplete,
          invoicedToDate: input.invoicedToDate ?? null,
          note: input.note ?? null,
          enteredBy: ctx.user.email ?? String(ctx.user.id),
        } as any);
      }
      return { ok: true };
    }),

  progressList: authedQuery
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(rrProgress).where(eq(rrProgress.projectId, input.projectId)).orderBy(rrProgress.periodKey);
    }),

  progressDelete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(rrProgress).where(eq(rrProgress.id, input.id));
      return { ok: true };
    }),

  // ===== SCHEDULE + CALENDAR (computed) =====
  schedule: authedQuery
    .input(z.object({ clientId: z.number(), fyStartKey: z.string().regex(/^\d{4}-\d{2}$/).optional() }))
    .query(async ({ input }) => {
      return buildClientView(input.clientId, input.fyStartKey);
    }),

  // ===== CONFIG =====
  configGet: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => getConfig(input.clientId)),

  configSet: authedQuery
    .input(z.object({
      clientId: z.number(),
      enabled: z.boolean().optional(),
      fiscalYearStartMonth: z.number().min(1).max(12).optional(),
      depositsBookedToRevenue: z.boolean().optional(),
      pctSource: z.string().max(100).nullable().optional(),
      pctEnteredByRole: z.string().max(100).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      jobCostingByProject: z.boolean().optional(),
      defaultHoldbackPct: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { clientId, ...rest } = input;
      const existing = (await db.select().from(rrClientConfig).where(eq(rrClientConfig.clientId, clientId)).limit(1))[0] as any;
      if (existing) {
        await db.update(rrClientConfig).set({ ...rest, updatedAt: new Date() } as any).where(eq(rrClientConfig.id, existing.id));
      } else {
        await db.insert(rrClientConfig).values({ clientId, ...rest } as any);
      }
      return { ok: true };
    }),

  // ===== ACCOUNT MAPPING (per client, explicit — never guessed) =====
  accountMapGet: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(rrAccountMap).where(eq(rrAccountMap.clientId, input.clientId));
      const byKey: Record<string, any> = {};
      for (const r of rows as any[]) byKey[r.accountKey] = r;
      return ACCOUNT_KEYS.map((key) => ({
        accountKey: key,
        qboAccountId: byKey[key]?.qboAccountId ?? null,
        qboAccountName: byKey[key]?.qboAccountName ?? null,
      }));
    }),

  accountMapSet: authedQuery
    .input(z.object({
      clientId: z.number(),
      accountKey: z.enum(ACCOUNT_KEYS),
      qboAccountId: z.string().max(50).nullable(),
      qboAccountName: z.string().max(200).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = (await db.select().from(rrAccountMap)
        .where(and(eq(rrAccountMap.clientId, input.clientId), eq(rrAccountMap.accountKey, input.accountKey))).limit(1))[0] as any;
      if (existing) {
        await db.update(rrAccountMap).set({ qboAccountId: input.qboAccountId, qboAccountName: input.qboAccountName ?? null, updatedAt: new Date() }).where(eq(rrAccountMap.id, existing.id));
      } else {
        await db.insert(rrAccountMap).values({ clientId: input.clientId, accountKey: input.accountKey, qboAccountId: input.qboAccountId, qboAccountName: input.qboAccountName ?? null } as any);
      }
      return { ok: true };
    }),

  // ===== JOURNAL ENTRIES (Phase 2 — DRAFT only, never auto-posts) =====
  jeGenerate: authedQuery
    .input(z.object({ clientId: z.number(), projectId: z.number(), periodKey: z.string().regex(/^\d{4}-\d{2}$/) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const proj = (await db.select().from(rrProjects).where(eq(rrProjects.id, input.projectId)).limit(1))[0] as any;
      if (!proj || proj.clientId !== input.clientId) throw new Error("Project not found for this client.");
      const prog = await db.select().from(rrProgress).where(eq(rrProgress.projectId, input.projectId));
      const schedule = buildProjectSchedule(
        { projectId: proj.id, name: proj.name, customerJob: proj.customerJob, contractValue: proj.contractValue ?? 0, openingPct: proj.openingPct ?? 0, openingInvoiced: proj.openingInvoiced ?? 0 },
        (prog as any[]).map((r) => ({ periodKey: r.periodKey, pctComplete: r.pctComplete ?? 0, invoicedToDate: r.invoicedToDate })),
      );
      const period = schedule.find((s) => s.periodKey === input.periodKey);
      if (!period) throw new Error(`No progress recorded for ${input.periodKey}.`);
      const cfg = await getConfig(input.clientId);
      const gen = generateJeForPeriod(period, { depositsBookedToRevenue: cfg.depositsBookedToRevenue });
      if (!gen) return { ok: true, generated: 0, note: "Nothing to accrue for this period (fully billed)." };

      const accrual = tagJeWithJob(gen.accrual, proj.customerJob);
      const reversal = tagJeWithJob(gen.reversal, proj.customerJob);
      const map = await getAccountMap(input.clientId);
      const validation = validateForPosting(accrual, map);

      // Persist as drafts (replace any existing drafts for this project+period).
      const stale = await db.select().from(rrJe).where(and(eq(rrJe.projectId, input.projectId), eq(rrJe.periodKey, input.periodKey)));
      for (const s of stale as any[]) {
        if (s.status === "draft") {
          await db.delete(rrJeLines).where(eq(rrJeLines.jeId, s.id));
          await db.delete(rrJe).where(eq(rrJe.id, s.id));
        }
      }
      for (const je of [accrual, reversal]) {
        const res = await db.insert(rrJe).values({
          clientId: input.clientId, projectId: input.projectId, periodKey: input.periodKey,
          kind: je.kind, jeDate: je.date, status: "draft", totalDebit: je.totalDebit, totalCredit: je.totalCredit,
        } as any);
        const jeId = Number(res.lastInsertRowid);
        for (const l of je.lines) {
          await db.insert(rrJeLines).values({
            jeId, accountKey: l.accountKey, qboAccountId: (map as any)[l.accountKey] ?? null,
            debit: l.debit, credit: l.credit, customerJob: l.customerJob ?? null, memo: l.memo,
          } as any);
        }
      }
      return { ok: true, generated: 2, validation, accrual, reversal };
    }),

  jeList: authedQuery
    .input(z.object({ clientId: z.number(), projectId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const conds = [eq(rrJe.clientId, input.clientId)];
      if (input.projectId) conds.push(eq(rrJe.projectId, input.projectId));
      const jes = await db.select().from(rrJe).where(and(...conds)).orderBy(desc(rrJe.periodKey), rrJe.kind);
      const out: any[] = [];
      for (const je of jes as any[]) {
        const lines = await db.select().from(rrJeLines).where(eq(rrJeLines.jeId, je.id));
        out.push({ ...je, lines });
      }
      return out;
    }),

  // ===== CLIENT SHARE LINKS =====
  shareList: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(rrShareLinks).where(eq(rrShareLinks.clientId, input.clientId)).orderBy(desc(rrShareLinks.createdAt));
    }),

  shareCreate: authedQuery
    .input(z.object({ clientId: z.number(), label: z.string().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const token = `rr_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(rrShareLinks).values({ clientId: input.clientId, token, label: input.label ?? null, active: true, createdBy: ctx.user.id } as any);
      return { ok: true, token };
    }),

  shareRevoke: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(rrShareLinks).set({ active: false, revokedAt: new Date() }).where(eq(rrShareLinks.id, input.id));
      return { ok: true };
    }),

  // ===== PUBLIC (token-gated, read-only) =====
  publicView: publicQuery
    .input(z.object({ token: z.string().min(6) }))
    .query(async ({ input }) => {
      const db = getDb();
      const link = (await db.select().from(rrShareLinks).where(eq(rrShareLinks.token, input.token)).limit(1))[0] as any;
      if (!link || !link.active) return null;
      const client = (await db.select().from(clients).where(eq(clients.id, link.clientId)).limit(1))[0] as any;
      const view = await buildClientView(link.clientId);
      // Strip the bookkeeper-only JE detail; clients see the schedule, not the GL postings.
      return {
        clientName: client?.name ?? "Your projects",
        label: link.label ?? null,
        generatedAt: new Date().toISOString(),
        totals: view.totals,
        calendar: view.calendar,
        projects: view.projects.map((p) => ({
          name: p.rollup.name,
          customerJob: p.customerJob,
          contractValue: p.rollup.contractValue,
          pctComplete: p.rollup.pctComplete,
          earnedToDate: p.rollup.earnedToDate,
          invoicedToDate: p.rollup.invoicedToDate,
          remainingToEarn: p.rollup.remainingToEarn,
        })),
      };
    }),
});
