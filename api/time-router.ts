import { z } from "zod";
import { createRouter, staffQuery, seniorQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { timeEntries, clients, tasks, users } from "../db/schema";
import { eq, and, desc, gte, lte, sql, sum, count } from "drizzle-orm";
import { syncInsert, syncUpdate } from "./sync-hooks";

export const timeRouter = createRouter({
  // List time entries with filters
  list: staffQuery
    .input(
      z
        .object({
          clientId: z.number().optional(),
          userId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          category: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [];

      if (input?.clientId) conditions.push(eq(timeEntries.clientId, input.clientId));
      if (input?.userId) conditions.push(eq(timeEntries.userId, input.userId));
      if (input?.startDate) conditions.push(gte(timeEntries.date, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(timeEntries.date, new Date(input.endDate)));
      if (input?.category) conditions.push(eq(timeEntries.category, input.category));

      if (conditions.length > 0) {
        return db
          .select()
          .from(timeEntries)
          .where(and(...conditions))
          .orderBy(desc(timeEntries.date));
      }
      return db.select().from(timeEntries).orderBy(desc(timeEntries.date));
    }),

  // Create a time entry
  create: staffQuery
    .input(
      z.object({
        clientId: z.number(),
        taskId: z.number().optional(),
        date: z.string(),
        description: z.string().min(1),
        hours: z.number().min(0.1),
        isBillable: z.boolean().default(true),
        hourlyRate: z.number().optional(),
        category: z.enum(["bookkeeping", "payroll", "tax_prep", "cleanup", "advisory", "admin", "other"]).default("bookkeeping"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [entry] = await db
        .insert(timeEntries)
        .values({
          clientId: input.clientId,
          userId: ctx.user.id,
          taskId: input.taskId,
          date: new Date(input.date),
          description: input.description,
          hours: input.hours,
          isBillable: input.isBillable,
          hourlyRate: input.hourlyRate,
          category: input.category,
        })
        .returning();
      if (entry) syncInsert("time_entries", entry);
      return entry;
    }),

  // Update a time entry
  update: staffQuery
    .input(
      z.object({
        id: z.number(),
        date: z.string().optional(),
        description: z.string().optional(),
        hours: z.number().min(0.1).optional(),
        isBillable: z.boolean().optional(),
        hourlyRate: z.number().optional(),
        category: z.enum(["bookkeeping", "payroll", "tax_prep", "cleanup", "advisory", "admin", "other"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const db = getDb();
      await db
        .update(timeEntries)
        .set({
          ...data,
          date: data.date ? new Date(data.date) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(timeEntries.id, id));
      // Sync updated entry
      const updated = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).limit(1);
      if (updated[0]) syncUpdate("time_entries", updated[0]);
      return { success: true };
    }),

  // Delete a time entry
  delete: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(timeEntries).where(eq(timeEntries.id, input.id));
      return { success: true };
    }),

  // Get monthly summary for a client
  getClientMonthlySummary: staffQuery
    .input(
      z.object({
        clientId: z.number(),
        year: z.number().optional(),
        month: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();

      const now = new Date();
      const targetYear = input.year ?? now.getFullYear();
      const targetMonth = input.month ?? now.getMonth() + 1;

      const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
      const endOfMonth = new Date(targetYear, targetMonth, 0);

      // Get all entries for the month
      const entries = await db
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.clientId, input.clientId),
            gte(timeEntries.date, startOfMonth),
            lte(timeEntries.date, endOfMonth)
          )
        )
        .orderBy(desc(timeEntries.date));

      // Calculate totals
      const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
      const billableHours = entries.filter((e) => e.isBillable).reduce((sum, e) => sum + (e.hours || 0), 0);
      const nonBillableHours = totalHours - billableHours;

      // Get client fee info
      const clientRows = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      const client = clientRows[0];
      const monthlyFee = client?.monthlyFee || 0;

      // Calculate effective hourly rate
      const effectiveHourlyRate = totalHours > 0 ? monthlyFee / totalHours : 0;

      // Hours by category
      const categoryBreakdown: Record<string, number> = {};
      entries.forEach((e) => {
        categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + (e.hours || 0);
      });

      return {
        entries,
        totalHours,
        billableHours,
        nonBillableHours,
        monthlyFee,
        effectiveHourlyRate,
        categoryBreakdown,
        entryCount: entries.length,
      };
    }),

  // Get firm-wide time summary (for Practice Health)
  getFirmSummary: seniorQuery
    .input(
      z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = getDb();

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const startDate = input?.startDate ? new Date(input.startDate) : startOfMonth;
      const endDate = input?.endDate ? new Date(input.endDate) : endOfMonth;

      // Get all entries in range
      const entries = await db
        .select()
        .from(timeEntries)
        .where(and(gte(timeEntries.date, startDate), lte(timeEntries.date, endDate)))
        .orderBy(desc(timeEntries.date));

      // Aggregate by client
      const clientHours: Record<number, { hours: number; billableHours: number; entries: number }> = {};
      entries.forEach((e) => {
        if (!clientHours[e.clientId]) {
          clientHours[e.clientId] = { hours: 0, billableHours: 0, entries: 0 };
        }
        clientHours[e.clientId].hours += e.hours || 0;
        if (e.isBillable) clientHours[e.clientId].billableHours += e.hours || 0;
        clientHours[e.clientId].entries += 1;
      });

      // Get client names and fees
      const clientIds = Object.keys(clientHours).map(Number);
      const clientData: Record<number, { name: string; monthlyFee: number }> = {};
      for (const cid of clientIds) {
        const rows = await db.select().from(clients).where(eq(clients.id, cid)).limit(1);
        if (rows[0]) {
          clientData[cid] = { name: rows[0].name, monthlyFee: rows[0].monthlyFee || 0 };
        }
      }

      // Build per-client profitability
      const clientProfitability = Object.entries(clientHours).map(([cid, data]) => {
        const id = Number(cid);
        const fee = clientData[id]?.monthlyFee || 0;
        return {
          clientId: id,
          clientName: clientData[id]?.name || "Unknown",
          totalHours: data.hours,
          billableHours: data.billableHours,
          monthlyFee: fee,
          effectiveHourlyRate: data.hours > 0 ? fee / data.hours : 0,
          entryCount: data.entries,
        };
      });

      // Staff utilization
      const staffHours: Record<number, { name: string; hours: number }> = {};
      for (const e of entries) {
        if (!staffHours[e.userId]) {
          const userRows = await db.select().from(users).where(eq(users.id, e.userId)).limit(1);
          staffHours[e.userId] = { name: userRows[0]?.name || "Unknown", hours: 0 };
        }
        staffHours[e.userId].hours += e.hours || 0;
      }

      const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
      const totalBillableHours = entries.filter((e) => e.isBillable).reduce((sum, e) => sum + (e.hours || 0), 0);

      return {
        totalHours,
        totalBillableHours,
        totalEntries: entries.length,
        clientProfitability,
        staffUtilization: Object.entries(staffHours).map(([uid, data]) => ({
          userId: Number(uid),
          name: data.name,
          hours: data.hours,
        })),
      };
    }),

  // Get today's entries for the logged-in user (quick clock-in/out view)
  getTodayEntries: staffQuery.query(async ({ ctx }) => {
    const db = getDb();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    return db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, ctx.user.id),
          gte(timeEntries.date, startOfDay),
          lte(timeEntries.date, endOfDay)
        )
      )
      .orderBy(desc(timeEntries.date));
  }),

  // Get weekly hours for a user
  getWeeklySummary: staffQuery
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = input?.userId || ctx.user.id;

      const now = new Date();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6, 23, 59, 59);

      const entries = await db
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.userId, userId),
            gte(timeEntries.date, startOfWeek),
            lte(timeEntries.date, endOfWeek)
          )
        );

      const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);

      return {
        totalHours,
        entryCount: entries.length,
        startOfWeek: startOfWeek.toISOString(),
        endOfWeek: endOfWeek.toISOString(),
      };
    }),
});
