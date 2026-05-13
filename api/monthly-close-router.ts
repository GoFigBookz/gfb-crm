import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { monthlyCloseChecklist } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

const CHECKLIST_ITEMS = [
  { field: "bankStatementsReconciled", label: "Bank statements reconciled (all accounts)" },
  { field: "creditCardStatementsReconciled", label: "Credit card statements reconciled" },
  { field: "allReceiptsProcessed", label: "All receipts processed and posted" },
  { field: "apReviewed", label: "A/P reviewed and current" },
  { field: "arReviewed", label: "A/R reviewed and followed up" },
  { field: "payrollJournalVerified", label: "Payroll journal verified" },
  { field: "sourceDeductionsConfirmed", label: "Source deductions confirmed" },
  { field: "hstGstTracked", label: "HST/GST tracked correctly" },
  { field: "ownerTransactionsSeparated", label: "Owner transactions separated" },
  { field: "adjustingEntriesPosted", label: "Adjusting entries posted" },
  { field: "plReviewed", label: "P&L reviewed for variances" },
  { field: "balanceSheetReviewed", label: "Balance Sheet reviewed" },
  { field: "bankRecMatchesBalanceSheet", label: "Bank rec = Balance Sheet" },
  { field: "financialsUploaded", label: "Financials uploaded to portal" },
  { field: "clientNotified", label: "Client notified" },
  { field: "sourceDocsFiled", label: "Source docs filed in Drive" },
];

export const monthlyCloseRouter = createRouter({
  getOrCreate: staffQuery
    .input(z.object({ clientId: z.number(), year: z.number(), month: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db
        .select()
        .from(monthlyCloseChecklist)
        .where(
          and(
            eq(monthlyCloseChecklist.clientId, input.clientId),
            eq(monthlyCloseChecklist.year, input.year),
            eq(monthlyCloseChecklist.month, input.month)
          )
        )
        .limit(1);

      if (existing[0]) return existing[0];

      const [checklist] = await db
        .insert(monthlyCloseChecklist)
        .values({
          clientId: input.clientId,
          userId: ctx.user.id,
          year: input.year,
          month: input.month,
          completionPercent: 0,
        })
        .returning();

      return checklist;
    }),

  toggleItem: staffQuery
    .input(
      z.object({
        id: z.number(),
        field: z.string(),
        checked: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, field, checked } = input;

      // Get current record
      const rows = await db
        .select()
        .from(monthlyCloseChecklist)
        .where(eq(monthlyCloseChecklist.id, id))
        .limit(1);

      if (!rows[0]) throw new Error("Checklist not found");

      // Build update object
      const updateData: Record<string, any> = { [field]: checked ? 1 : 0 };

      // Calculate new completion percent
      let completed = 0;
      for (const item of CHECKLIST_ITEMS) {
        if (item.field === field) {
          if (checked) completed++;
        } else if ((rows[0] as any)[item.field]) {
          completed++;
        }
      }
      updateData.completionPercent = Math.round((completed / CHECKLIST_ITEMS.length) * 100);

      if (completed === CHECKLIST_ITEMS.length) {
        updateData.completedAt = new Date();
      } else {
        updateData.completedAt = null;
      }

      await db.update(monthlyCloseChecklist).set(updateData).where(eq(monthlyCloseChecklist.id, id));

      return { success: true, completionPercent: updateData.completionPercent };
    }),

  updateNotes: staffQuery
    .input(z.object({ id: z.number(), notes: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(monthlyCloseChecklist)
        .set({ notes: input.notes })
        .where(eq(monthlyCloseChecklist.id, input.id));
      return { success: true };
    }),

  getChecklistDefinition: staffQuery.query(() => {
    return CHECKLIST_ITEMS;
  }),
});
