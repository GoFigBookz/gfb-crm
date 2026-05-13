import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tasks, recurringTasks, clientTaskRules } from "../db/schema";
import { eq, and, gte, lte, lt, desc, or, sql } from "drizzle-orm";
import { generateNextTaskInstance } from "./task-generator";
import { syncInsert, syncUpdate } from "./sync-hooks";

export const taskRouter = createRouter({
  // List tasks
  list: authedQuery
    .input(z.object({
      clientId: z.number().optional(),
      status: z.enum(["pending", "in_progress", "completed", "overdue", "all"]).optional().default("all"),
      priority: z.enum(["low", "medium", "high", "all"]).optional().default("all"),
      completed: z.boolean().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const userRole = ctx.user.role;
      const userName = ctx.user.name || ctx.user.email;

      // Admin and senior see ALL tasks. Junior/staff see only their tasks.
      const conditions = [];
      if (userRole !== "admin" && userRole !== "senior_bookkeeper") {
        conditions.push(
          or(
            eq(tasks.userId, userId),
            eq(tasks.assignedTo, userName)
          )
        );
      }
      if (input?.clientId) conditions.push(eq(tasks.clientId, input.clientId));
      if (input?.status && input.status !== "all") conditions.push(eq(tasks.status, input.status));
      if (input?.priority && input.priority !== "all") conditions.push(eq(tasks.priority, input.priority));
      if (input?.completed !== undefined) conditions.push(eq(tasks.completed, input.completed));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db
        .select()
        .from(tasks)
        .where(whereClause)
        .orderBy(desc(tasks.dueDate))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      return results;
    }),

  // Get upcoming tasks
  upcoming: authedQuery
    .input(z.object({ days: z.number().min(1).max(365).optional().default(7) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const userRole = ctx.user.role;
      const userName = ctx.user.name || ctx.user.email;
      const now = new Date();
      const future = new Date();
      future.setDate(now.getDate() + input.days);

      // Role-based filtering
      const accessFilter = (userRole === "admin" || userRole === "senior_bookkeeper")
        ? undefined
        : or(eq(tasks.userId, userId), eq(tasks.assignedTo, userName));

      const conditions = [
        eq(tasks.completed, false),
        gte(tasks.dueDate, now),
        lte(tasks.dueDate, future),
      ];
      if (accessFilter) conditions.push(accessFilter);

      return db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(tasks.dueDate);
    }),

  // Get overdue tasks
  overdue: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;
    const userRole = ctx.user.role;
    const userName = ctx.user.name || ctx.user.email;
    const now = new Date();

    // Role-based filtering
    const accessFilter = (userRole === "admin" || userRole === "senior_bookkeeper")
      ? undefined
      : or(eq(tasks.userId, userId), eq(tasks.assignedTo, userName));

    const conditions = [
      eq(tasks.completed, false),
      lt(tasks.dueDate, now),
    ];
    if (accessFilter) conditions.push(accessFilter);

    return db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(tasks.dueDate);
  }),

  // Create task
  create: authedQuery
    .input(z.object({
      clientId: z.number().optional(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      dueDate: z.date().optional(),
      priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
      category: z.string().max(100).optional(),
      assignedTo: z.string().max(255).optional(),
      googleCalendarEventId: z.string().optional(),
      googleTaskId: z.string().optional(),
      outlookTaskId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [task] = await db.insert(tasks).values({
        ...input,
        userId: ctx.user.id,
        status: "pending",
        completed: false,
      }).returning();
      if (task) syncInsert("tasks", task);
      return task;
    }),

  // Complete task (with auto-recurrence for rule-based tasks)
  complete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();
      
      await db
        .update(tasks)
        .set({ completed: true, status: "completed", completedAt: now })
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));

      // Sync updated task
      const taskRows = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);
      const task = taskRows[0];
      if (task) syncUpdate("tasks", task);

      // If this task is part of a recurring rule, generate the next instance
      let nextTask = null;
      if (task && task.ruleId && task.isRecurring) {
        nextTask = await generateNextTaskInstance(input.id);
        if (nextTask) syncInsert("tasks", nextTask);
      }

      return { success: true, nextTaskId: nextTask?.id ?? null };
    }),

  // Update task
  update: authedQuery
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      dueDate: z.date().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      status: z.enum(["pending", "in_progress", "completed", "overdue"]).optional(),
      category: z.string().max(100).optional(),
      assignedTo: z.string().max(255).optional(),
      completed: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(tasks)
        .set(updates)
        .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.user.id)));

      // Fetch and sync updated task
      const updated = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
      if (updated[0]) syncUpdate("tasks", updated[0]);

      return { success: true };
    }),

  // Delete task
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.user.id)));

      return { success: true };
    }),

  // ===== RECURRING TASKS =====
  listRecurring: authedQuery
    .input(z.object({
      active: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const conditions = [eq(recurringTasks.userId, userId)];
      if (input?.active !== undefined) conditions.push(eq(recurringTasks.active, input.active));

      return db
        .select()
        .from(recurringTasks)
        .where(and(...conditions))
        .orderBy(desc(recurringTasks.createdAt));
    }),

  createRecurring: authedQuery
    .input(z.object({
      clientId: z.number().optional(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]),
      startDate: z.date(),
      endDate: z.date().optional(),
      priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
      category: z.string().max(100).optional(),
      assignedTo: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [task] = await db.insert(recurringTasks).values({
        ...input,
        userId: ctx.user.id,
        nextDueDate: input.startDate,
        active: true,
      });
      return task;
    }),

  updateRecurring: authedQuery
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      frequency: z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
      active: z.boolean().optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(recurringTasks)
        .set(updates)
        .where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, ctx.user.id)));

      return { success: true };
    }),

  deleteRecurring: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(recurringTasks)
        .where(and(eq(recurringTasks.id, input.id), eq(recurringTasks.userId, ctx.user.id)));

      return { success: true };
    }),

  // ===== CLIENT TASK RULES =====
  listClientRules: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(clientTaskRules)
        .where(and(
          eq(clientTaskRules.clientId, input.clientId),
          eq(clientTaskRules.userId, ctx.user.id)
        ))
        .orderBy(clientTaskRules.category);
    }),

  toggleRule: authedQuery
    .input(z.object({ ruleId: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(clientTaskRules)
        .set({ active: input.active })
        .where(and(
          eq(clientTaskRules.id, input.ruleId),
          eq(clientTaskRules.userId, ctx.user.id)
        ));
      return { success: true };
    }),

  getClientTasks: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(tasks)
        .where(and(
          eq(tasks.clientId, input.clientId),
          eq(tasks.userId, ctx.user.id)
        ))
        .orderBy(desc(tasks.dueDate));
    }),
});
