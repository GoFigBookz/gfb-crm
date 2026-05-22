import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, calendarEvents } from "../db/schema";
import { eq, and, gte, lte, lt, desc, or, sql } from "drizzle-orm";

export const dailyBriefRouter = createRouter({
  // Get daily brief — today's tasks + calendar + overdue
  get: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const now = new Date();
    
    // Start/end of today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    // Start/end of tomorrow
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(todayEnd);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

    // Overdue tasks (past due, not completed)
    const overdue = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.completed, false),
        lt(tasks.dueDate, todayStart)
      ))
      .orderBy(tasks.dueDate);

    // Today's tasks (due today, not completed)
    const todayTasks = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.completed, false),
        gte(tasks.dueDate, todayStart),
        lte(tasks.dueDate, todayEnd)
      ))
      .orderBy(tasks.priority, tasks.dueDate);

    // Tomorrow's tasks
    const tomorrowTasks = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.completed, false),
        gte(tasks.dueDate, tomorrowStart),
        lte(tasks.dueDate, tomorrowEnd)
      ))
      .orderBy(tasks.priority);

    // This week's upcoming tasks (next 7 days excluding today/tomorrow)
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    const upcoming = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.completed, false),
        gte(tasks.dueDate, tomorrowEnd),
        lte(tasks.dueDate, weekEnd)
      ))
      .orderBy(tasks.dueDate)
      .limit(10);

    // Today's calendar events
    const calendar = await db
      .select()
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.userId, userId),
        gte(calendarEvents.startDate, todayStart),
        lte(calendarEvents.startDate, todayEnd),
        eq(calendarEvents.status, "confirmed")
      ))
      .orderBy(calendarEvents.startDate);

    // Total counts
    const totalPending = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.completed, false)));

    return {
      date: now.toISOString(),
      greeting: getGreeting(now),
      overdue,
      today: todayTasks,
      tomorrow: tomorrowTasks,
      upcoming,
      calendar,
      stats: {
        overdueCount: overdue.length,
        todayCount: todayTasks.length,
        tomorrowCount: tomorrowTasks.length,
        upcomingCount: upcoming.length,
        calendarCount: calendar.length,
        totalPending: totalPending[0]?.count ?? 0,
      }
    };
  }),

  // Mark top 3 priorities for the day
  setPriorities: authedQuery
    .input(z.object({
      taskIds: z.array(z.number()).max(5)
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Clear previous priorities
      await db
        .update(tasks)
        .set({ category: sql`CASE WHEN category = 'priority' THEN NULL ELSE category END` })
        .where(eq(tasks.userId, ctx.user.id));
      
      // Set new priorities
      for (const taskId of input.taskIds) {
        await db
          .update(tasks)
          .set({ category: "priority" })
          .where(and(eq(tasks.id, taskId), eq(tasks.userId, ctx.user.id)));
      }
      
      return { success: true, prioritized: input.taskIds.length };
    }),
});

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
