import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { userSettings, notifications } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const settingsRouter = createRouter({
  // Get user settings
  get: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const result = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id))
      .limit(1);

    if (!result[0]) {
      // Create default settings
      const [settings] = await db.insert(userSettings).values({
        userId: ctx.user.id,
      });
      return settings;
    }

    return result[0];
  }),

  // Update settings
  update: authedQuery
    .input(z.object({
      notifyTaskDue: z.boolean().optional(),
      notifyTaskOverdue: z.boolean().optional(),
      notifyInvoiceOverdue: z.boolean().optional(),
      notifyNewEmail: z.boolean().optional(),
      notifyCalendarEvent: z.boolean().optional(),
      notifyClientActivity: z.boolean().optional(),
      notifyAIAgent: z.boolean().optional(),
      dashboardWidgets: z.array(z.string()).optional(),
      defaultView: z.enum(["dashboard", "clients", "tasks", "emails", "calendar", "files", "invoices"]).optional(),
      theme: z.enum(["light", "dark", "system"]).optional(),
      timezone: z.string().max(100).optional(),
      dateFormat: z.string().max(20).optional(),
      currency: z.string().max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      await db
        .update(userSettings)
        .set(input)
        .where(eq(userSettings.userId, ctx.user.id));

      return { success: true };
    }),

  // ===== NOTIFICATIONS =====
  listNotifications: authedQuery
    .input(z.object({
      isRead: z.boolean().optional(),
      type: z.enum([
        "task_due",
        "task_overdue",
        "invoice_overdue",
        "email_received",
        "calendar_event",
        "client_activity",
        "ai_agent_alert",
        "system",
      ]).optional(),
      limit: z.number().min(1).max(100).optional().default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const conditions = [eq(notifications.userId, userId)];
      if (input?.isRead !== undefined) conditions.push(eq(notifications.isRead, input.isRead));
      if (input?.type) conditions.push(eq(notifications.type, input.type));

      return db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input?.limit ?? 50);
    }),

  // Create notification
  createNotification: authedQuery
    .input(z.object({
      type: z.enum([
        "task_due",
        "task_overdue",
        "invoice_overdue",
        "email_received",
        "calendar_event",
        "client_activity",
        "ai_agent_alert",
        "system",
      ]),
      title: z.string().min(1).max(255),
      message: z.string().optional(),
      relatedId: z.number().optional(),
      relatedType: z.string().max(50).optional(),
      sentVia: z.enum(["in_app", "email", "sms", "push"]).optional().default("in_app"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [notification] = await db.insert(notifications).values({
        ...input,
        userId: ctx.user.id,
        isRead: false,
      });
      return notification;
    }),

  // Mark notification as read
  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));

      return { success: true };
    }),

  // Mark all as read
  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, ctx.user.id));

    return { success: true };
  }),

  // Delete notification
  deleteNotification: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(notifications)
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));

      return { success: true };
    }),
});
