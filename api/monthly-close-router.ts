/**
 * MONTHLY CLOSE CHECKLIST — now CLIENT-AWARE. Only shows the steps relevant to a
 * given client (no payroll → no payroll/source-deduction steps; no HST → no HST
 * step; no credit card → no credit-card reconcile), and the completion % is over
 * the RELEVANT items only. Less manual, less noise, tailored per client.
 * Relevance is driven by client flags (config, not hard-coded client logic).
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { monthlyCloseChecklist, clients, appSettings, users } from "../db/schema";
import { eq, and } from "drizzle-orm";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 1-based month number for a client's fiscal year-end; default December (12). */
function yearEndMonthNum(client: any): number {
  const i = MONTH_ABBR.indexOf(String(client?.yearEndMonth || ""));
  if (i >= 0) return i + 1;
  const fy = Number(client?.fiscalYearEndMonth);
  return Number.isFinite(fy) && fy >= 1 && fy <= 12 ? fy : 12;
}

type Need = "payroll" | "hst" | "creditCard";
const CHECKLIST_ITEMS: { field: string; label: string; needs?: Need }[] = [
  { field: "bankStatementsReconciled", label: "Bank statements reconciled (all accounts)" },
  { field: "creditCardStatementsReconciled", label: "Credit card statements reconciled", needs: "creditCard" },
  { field: "allReceiptsProcessed", label: "All receipts processed and posted" },
  { field: "apReviewed", label: "A/P reviewed and current" },
  { field: "arReviewed", label: "A/R reviewed and followed up" },
  { field: "payrollJournalVerified", label: "Payroll journal verified", needs: "payroll" },
  { field: "sourceDeductionsConfirmed", label: "Source deductions confirmed", needs: "payroll" },
  { field: "hstGstTracked", label: "HST/GST tracked correctly", needs: "hst" },
  { field: "ownerTransactionsSeparated", label: "Owner transactions separated" },
  { field: "adjustingEntriesPosted", label: "Adjusting entries posted" },
  { field: "plReviewed", label: "P&L reviewed for variances" },
  { field: "balanceSheetReviewed", label: "Balance Sheet reviewed" },
  { field: "bankRecMatchesBalanceSheet", label: "Bank rec = Balance Sheet" },
  { field: "financialsUploaded", label: "Financials uploaded to portal" },
  { field: "clientNotified", label: "Client notified" },
  { field: "sourceDocsFiled", label: "Source docs filed in Drive" },
];

/** Is a checklist item relevant to THIS client (by its flags)? */
function applies(item: { needs?: Need }, client: any): boolean {
  if (!item.needs) return true;
  if (item.needs === "payroll") return !!(client?.hasPayroll || client?.hasEmployees);
  if (item.needs === "hst") return !!client?.hasHST;
  if (item.needs === "creditCard") return client?.hasCreditCard !== false; // default ON; opt out per client
  return true;
}

/** The full library of close steps (for the per-client "customize / trim" picker). */
export const ALL_CHECKLIST_ITEMS = CHECKLIST_ITEMS;

/** Parse a client's explicit close-step selection (JSON array of field names), if set. */
function explicitCloseSteps(client: any): string[] | null {
  try {
    const raw = (client as any)?.closeSteps;
    if (!raw) return null;
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) && arr.length ? arr.map(String) : null;
  } catch { return null; }
}

/** The relevant checklist items for a client. If the client has an EXPLICIT step
 *  selection (trimmed at intake), use exactly that; otherwise fall back to the
 *  flag-driven default set. */
export function applicableItems(client: any): typeof CHECKLIST_ITEMS {
  const explicit = explicitCloseSteps(client);
  if (explicit) {
    const set = new Set(explicit);
    return CHECKLIST_ITEMS.filter((i) => set.has(i.field));
  }
  return CHECKLIST_ITEMS.filter((i) => applies(i, client));
}

async function loadClient(clientId: number) {
  const rows = await getDb().select().from(clients).where(eq(clients.id, clientId)).limit(1);
  return rows[0] || {};
}

/**
 * Mark the month-end close 100% COMPLETE for every relevant client for all months
 * of `year` up to and INCLUDING that client's fiscal year-end month — because once a
 * client's year-end is filed, every month in that closed fiscal year is done. Used
 * both by the UI button and the one-time boot seed. Idempotent (re-running just
 * re-affirms 100%). Skips wholesale/inactive clients (never on the close board).
 * Returns the number of (client, month) rows marked.
 */
export async function markFiscalYearClosedForAll(userId: number, year: number): Promise<{ clients: number; periods: number }> {
  const db = getDb();
  const all = await db.select().from(clients);
  const eligible = all.filter((c: any) => c.status !== "inactive" && c.clientType !== "wholesale");
  let periods = 0;
  for (const client of eligible) {
    const items = applicableItems(client);
    const lastMonth = yearEndMonthNum(client);
    for (let month = 1; month <= lastMonth; month++) {
      const setData: Record<string, any> = { completionPercent: 100, completedAt: new Date() };
      for (const it of items) setData[it.field] = 1;
      const existing = await db.select().from(monthlyCloseChecklist)
        .where(and(eq(monthlyCloseChecklist.clientId, client.id), eq(monthlyCloseChecklist.year, year), eq(monthlyCloseChecklist.month, month)))
        .limit(1);
      if (existing[0]) {
        await db.update(monthlyCloseChecklist).set(setData).where(eq(monthlyCloseChecklist.id, (existing[0] as any).id));
      } else {
        await db.insert(monthlyCloseChecklist).values({ clientId: client.id, userId, year, month, ...setData } as any);
      }
      periods++;
    }
  }
  return { clients: eligible.length, periods };
}

/** One-time boot seed: mark FY2025 closed for everyone (guarded so it runs once and
 *  never clobbers a manual change after the first deploy). */
export async function seedClose2025Complete(): Promise<void> {
  const db = getDb();
  try {
    const KEY = "close_seed_fy2025_done";
    const flag = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
    if (flag[0]?.value === "1") return;
    const owner = await db.select().from(clients).limit(1); // any row proves DB is up
    if (!owner.length) return;
    // userId for any inserted rows — first admin, else first user, else 1.
    const admins = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
    let uid = (admins[0] as any)?.id as number | undefined;
    if (!uid) { const anyUser = await db.select().from(users).limit(1); uid = (anyUser[0] as any)?.id ?? 1; }
    const res = await markFiscalYearClosedForAll(uid!, 2025);
    await db.insert(appSettings).values({ key: KEY, value: "1" } as any).onConflictDoUpdate({ target: appSettings.key, set: { value: "1" } });
    console.log(`[close-seed] FY2025 marked closed: ${res.clients} clients, ${res.periods} periods.`);
  } catch (e) {
    console.error("[close-seed] seedClose2025Complete failed:", e instanceof Error ? e.message : e);
  }
}

export const monthlyCloseRouter = createRouter({
  getOrCreate: staffQuery
    .input(z.object({ clientId: z.number(), year: z.number(), month: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db
        .select().from(monthlyCloseChecklist)
        .where(and(eq(monthlyCloseChecklist.clientId, input.clientId), eq(monthlyCloseChecklist.year, input.year), eq(monthlyCloseChecklist.month, input.month)))
        .limit(1);
      if (existing[0]) return existing[0];
      const [checklist] = await db.insert(monthlyCloseChecklist).values({
        clientId: input.clientId, userId: ctx.user.id, year: input.year, month: input.month, completionPercent: 0,
      }).returning();
      return checklist;
    }),

  /** The RELEVANT checklist items for one client. */
  getChecklistDefinition: staffQuery
    .input(z.object({ clientId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      if (!input?.clientId) return CHECKLIST_ITEMS;
      const client = await loadClient(input.clientId);
      return applicableItems(client);
    }),

  toggleItem: staffQuery
    .input(z.object({ id: z.number(), field: z.string(), checked: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, field, checked } = input;
      const rows = await db.select().from(monthlyCloseChecklist).where(eq(monthlyCloseChecklist.id, id)).limit(1);
      if (!rows[0]) throw new Error("Checklist not found");
      const client = await loadClient((rows[0] as any).clientId);
      const items = applicableItems(client);                  // % over RELEVANT items only

      const updateData: Record<string, any> = { [field]: checked ? 1 : 0 };
      let completed = 0;
      for (const item of items) {
        if (item.field === field) { if (checked) completed++; }
        else if ((rows[0] as any)[item.field]) completed++;
      }
      updateData.completionPercent = items.length ? Math.round((completed / items.length) * 100) : 0;
      updateData.completedAt = (items.length && completed === items.length) ? new Date() : null;
      await db.update(monthlyCloseChecklist).set(updateData).where(eq(monthlyCloseChecklist.id, id));
      return { success: true, completionPercent: updateData.completionPercent };
    }),

  updateNotes: staffQuery
    .input(z.object({ id: z.number(), notes: z.string() }))
    .mutation(async ({ input }) => {
      await getDb().update(monthlyCloseChecklist).set({ notes: input.notes }).where(eq(monthlyCloseChecklist.id, input.id));
      return { success: true };
    }),

  /** Mark ALL relevant items done (or clear) in one click — over the client's
   *  applicable items only, so it never re-introduces an irrelevant step. */
  markAll: staffQuery
    .input(z.object({ id: z.number(), done: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(monthlyCloseChecklist).where(eq(monthlyCloseChecklist.id, input.id)).limit(1);
      if (!rows[0]) throw new Error("Checklist not found");
      const client = await loadClient((rows[0] as any).clientId);
      const items = applicableItems(client);
      const updateData: Record<string, any> = {};
      for (const item of items) updateData[item.field] = input.done ? 1 : 0;
      updateData.completionPercent = input.done ? 100 : 0;
      updateData.completedAt = input.done ? new Date() : null;
      await db.update(monthlyCloseChecklist).set(updateData).where(eq(monthlyCloseChecklist.id, input.id));
      return { success: true, completionPercent: updateData.completionPercent };
    }),

  /** Mark a whole fiscal year's closes COMPLETE for every relevant client, up to each
   *  client's year-end month (their year-ends are filed → those months are done). */
  markFiscalYearClosed: staffQuery
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .mutation(async ({ ctx, input }) => {
      const res = await markFiscalYearClosedForAll(ctx.user.id, input.year);
      return { success: true, ...res };
    }),

  /** Toggle whether a client has credit cards (drives the credit-card step). */
  setHasCreditCard: staffQuery
    .input(z.object({ clientId: z.number(), value: z.boolean() }))
    .mutation(async ({ input }) => {
      await getDb().update(clients).set({ hasCreditCard: input.value } as any).where(eq(clients.id, input.clientId));
      return { success: true };
    }),

  /** The close-step picker for a client: the full library + which are enabled (the
   *  trimmed set). Defaults to the flag-driven set when nothing's been customized. */
  getStepConfig: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const client = await loadClient(input.clientId);
      const enabled = new Set(applicableItems(client).map((i) => i.field));
      return ALL_CHECKLIST_ITEMS.map((i) => ({ field: i.field, label: i.label, enabled: enabled.has(i.field) }));
    }),

  /** Save a client's trimmed close-step selection (the fields that apply). */
  setStepConfig: staffQuery
    .input(z.object({ clientId: z.number(), fields: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const valid = new Set(ALL_CHECKLIST_ITEMS.map((i) => i.field));
      const fields = input.fields.filter((f) => valid.has(f));
      await getDb().update(clients).set({ closeSteps: JSON.stringify(fields) } as any).where(eq(clients.id, input.clientId));
      return { success: true, count: fields.length };
    }),

  /** Does this client have credit cards? (for the inline toggle default) */
  clientFlags: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const c = await loadClient(input.clientId);
      return { hasCreditCard: (c as any).hasCreditCard !== false, hasPayroll: !!(c as any).hasPayroll || !!(c as any).hasEmployees, hasHST: !!(c as any).hasHST };
    }),
});
