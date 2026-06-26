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
import { monthlyCloseChecklist, clients } from "../db/schema";
import { eq, and } from "drizzle-orm";

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

/** The relevant checklist items for a client (pure-ish; the only data dep is the client row). */
export function applicableItems(client: any): typeof CHECKLIST_ITEMS {
  return CHECKLIST_ITEMS.filter((i) => applies(i, client));
}

async function loadClient(clientId: number) {
  const rows = await getDb().select().from(clients).where(eq(clients.id, clientId)).limit(1);
  return rows[0] || {};
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

  /** Toggle whether a client has credit cards (drives the credit-card step). */
  setHasCreditCard: staffQuery
    .input(z.object({ clientId: z.number(), value: z.boolean() }))
    .mutation(async ({ input }) => {
      await getDb().update(clients).set({ hasCreditCard: input.value } as any).where(eq(clients.id, input.clientId));
      return { success: true };
    }),

  /** Does this client have credit cards? (for the inline toggle default) */
  clientFlags: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const c = await loadClient(input.clientId);
      return { hasCreditCard: (c as any).hasCreditCard !== false, hasPayroll: !!(c as any).hasPayroll || !!(c as any).hasEmployees, hasHST: !!(c as any).hasHST };
    }),
});
