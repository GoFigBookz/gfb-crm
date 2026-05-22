import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, clients } from "../db/schema";
import { eq, and, desc, gte, lte, lt } from "drizzle-orm";

/**
 * AGENT ROUTER
 * Natural language endpoints for voice/AI assistants
 * - Create tasks from voice commands
 * - Get morning briefing
 * - Get daily priority list
 */

export const agentRouter = createRouter({
  // Natural language task creation
  // POST /api/trpc/agent.createTask
  // Body: { text: "Call John about QBO tomorrow at 2pm" }
  createTask: authedQuery
    .input(z.object({
      text: z.string().min(1).max(500),
      clientId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const text = input.text.toLowerCase();
      
      // Simple NLP parsing
      let title = input.text;
      let dueDate: Date | undefined = undefined;
      let priority: "low" | "medium" | "high" = "medium";
      
      // Extract date mentions
      const tomorrowMatch = text.match(/tomorrow|next day/);
      const todayMatch = text.match(/today|this afternoon|tonight/);
      const nextWeekMatch = text.match(/next week|monday|tuesday|wednesday|thursday|friday/);
      const urgentMatch = text.match(/urgent|asap|important|critical/);
      
      if (urgentMatch) priority = "high";
      
      const now = new Date();
      if (tomorrowMatch) {
        dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        // Remove date words from title for cleaner display
        title = title.replace(/tomorrow|next day/gi, "").trim();
      } else if (todayMatch) {
        dueDate = now;
        title = title.replace(/today|this afternoon|tonight/gi, "").trim();
      } else if (nextWeekMatch) {
        dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        title = title.replace(/next week|monday|tuesday|wednesday|thursday|friday/gi, "").trim();
      }
      
      // Clean up title
      title = title.replace(/^add\s+/i, "").replace(/^create\s+/i, "").replace(/^task\s+/i, "").trim();
      if (title.endsWith(".")) title = title.slice(0, -1);
      
      // If no title after cleaning, use original
      if (!title) title = input.text;
      
      const [task] = await db.insert(tasks).values({
        userId: ctx.user.id,
        title,
        description: `Added via voice: ${input.text}`,
        dueDate,
        priority,
        status: "pending",
        completed: false,
        clientId: input.clientId || null,
      }).returning();
      
      return {
        success: true,
        task,
        parsed: { title, dueDate, priority },
      };
    }),

  // Get morning briefing
  // GET /api/trpc/agent.morningBriefing
  morningBriefing: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const userName = ctx.user.name || ctx.user.email;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    
    // Today's tasks
    const todayTasks = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.completed, false),
        gte(tasks.dueDate, today),
        lt(tasks.dueDate, tomorrow),
        or(eq(tasks.userId, userId), eq(tasks.assignedTo, userName))
      ))
      .orderBy(tasks.priority);
    
    // Overdue tasks
    const overdueTasks = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.completed, false),
        lt(tasks.dueDate, today),
        or(eq(tasks.userId, userId), eq(tasks.assignedTo, userName))
      ))
      .orderBy(tasks.dueDate)
      .limit(10);
    
    // Upcoming tasks (next 7 days)
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingTasks = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.completed, false),
        gte(tasks.dueDate, tomorrow),
        lte(tasks.dueDate, nextWeek),
        or(eq(tasks.userId, userId), eq(tasks.assignedTo, userName))
      ))
      .orderBy(tasks.dueDate)
      .limit(10);
    
    // High priority tasks (any date)
    const highPriorityTasks = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.completed, false),
        eq(tasks.priority, "high"),
        or(eq(tasks.userId, userId), eq(tasks.assignedTo, userName))
      ))
      .orderBy(desc(tasks.dueDate))
      .limit(5);
    
    // Calculate stats
    const totalOverdue = overdueTasks.length;
    const totalToday = todayTasks.length;
    const totalUpcoming = upcomingTasks.length;
    const totalHighPriority = highPriorityTasks.length;
    
    // Build priority list
    const priorities = [];
    
    if (totalOverdue > 0) {
      priorities.push({
        level: "critical",
        message: `You have ${totalOverdue} overdue task${totalOverdue > 1 ? "s" : ""} that need${totalOverdue === 1 ? "s" : ""} immediate attention.`,
        tasks: overdueTasks.slice(0, 3).map(t => ({ id: t.id, title: t.title })),
      });
    }
    
    if (totalHighPriority > 0) {
      priorities.push({
        level: "high",
        message: `You have ${totalHighPriority} high-priority task${totalHighPriority > 1 ? "s" : ""}.`,
        tasks: highPriorityTasks.map(t => ({ id: t.id, title: t.title })),
      });
    }
    
    if (totalToday > 0) {
      priorities.push({
        level: "today",
        message: `You have ${totalToday} task${totalToday > 1 ? "s" : ""} due today.`,
        tasks: todayTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority })),
      });
    }
    
    if (priorities.length === 0) {
      priorities.push({
        level: "clear",
        message: "You're all caught up! No urgent tasks today.",
        tasks: [],
      });
    }
    
    return {
      date: now.toISOString(),
      greeting: now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening",
      summary: {
        overdue: totalOverdue,
        today: totalToday,
        upcoming: totalUpcoming,
        highPriority: totalHighPriority,
      },
      priorities,
      allTasks: {
        overdue: overdueTasks,
        today: todayTasks,
        upcoming: upcomingTasks,
        highPriority: highPriorityTasks,
      },
    };
  }),

  // Quick daily summary (lighter weight)
  dailySummary: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const userName = ctx.user.name || ctx.user.email;
    const now = new Date();
    
    const counts = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.completed, false),
        or(eq(tasks.userId, userId), eq(tasks.assignedTo, userName))
      ));
    
    const overdue = counts.filter(t => t.dueDate && new Date(t.dueDate) < now).length;
    const dueToday = counts.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const highPriority = counts.filter(t => t.priority === "high").length;
    
    return {
      overdue,
      dueToday,
      highPriority,
      totalOpen: counts.length,
    };
  }),
});
