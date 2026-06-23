import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { calendarEvents } from "../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export const calendarRouter = createRouter({
  // List events
  list: authedQuery
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      clientId: z.number().optional(),
      connectedAccountId: z.number().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const conditions = [eq(calendarEvents.userId, userId)];
      if (input?.startDate) conditions.push(gte(calendarEvents.startDate, input.startDate));
      if (input?.endDate) conditions.push(lte(calendarEvents.endDate, input.endDate));
      if (input?.clientId) conditions.push(eq(calendarEvents.clientId, input.clientId));
      if (input?.connectedAccountId) conditions.push(eq(calendarEvents.connectedAccountId, input.connectedAccountId));

      return db
        .select()
        .from(calendarEvents)
        .where(and(...conditions))
        .orderBy(calendarEvents.startDate)
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
    }),

  // Get single event
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.id, input.id), eq(calendarEvents.userId, ctx.user.id)))
        .limit(1);

      return result[0] ?? null;
    }),

  // Create event
  create: authedQuery
    .input(z.object({
      clientId: z.number().optional(),
      connectedAccountId: z.number().optional(),
      taskId: z.number().optional(),
      googleEventId: z.string().optional(),
      outlookEventId: z.string().optional(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      location: z.string().max(255).optional(),
      startDate: z.date(),
      endDate: z.date(),
      isAllDay: z.boolean().optional().default(false),
      attendees: z.array(z.object({
        email: z.string(),
        name: z.string().default(""),
        responseStatus: z.string().default("needsAction"),
      })).optional(),
      recurrence: z.string().optional(),
      color: z.string().optional(),
      meetingLink: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [event] = await db.insert(calendarEvents).values({
        ...input,
        userId: ctx.user.id,
        status: "confirmed",
      }).returning();
      // Two-way: mirror a CRM-created event to Google (skip ones pulled FROM Google).
      if (event && !input.googleEventId) {
        import("./google-push").then((m) => m.pushEventToGoogle(event.id)).catch(() => {});
      }
      return event;
    }),

  // Update event
  update: authedQuery
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      location: z.string().max(255).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      isAllDay: z.boolean().optional(),
      attendees: z.array(z.object({
        email: z.string(),
        name: z.string().default(""),
        responseStatus: z.string().default("needsAction"),
      })).optional(),
      color: z.string().optional(),
      status: z.enum(["confirmed", "tentative", "cancelled"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(calendarEvents)
        .set(updates)
        .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, ctx.user.id)));

      import("./google-push").then((m) => m.pushEventToGoogle(id)).catch(() => {}); // two-way: mirror edit to Google
      return { success: true };
    }),

  // Delete event
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = (await db.select().from(calendarEvents).where(eq(calendarEvents.id, input.id)).limit(1))[0] as any;
      await db
        .delete(calendarEvents)
        .where(and(eq(calendarEvents.id, input.id), eq(calendarEvents.userId, ctx.user.id)));
      if (existing?.googleEventId) {
        import("./google-push").then((m) => m.deleteGoogleEvent(existing.googleEventId)).catch(() => {}); // two-way: remove from Google
      }

      return { success: true };
    }),
});
