import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { TRPCError } from "@trpc/server";

/**
 * Google Tasks API Integration Router
 * 
 * Provides endpoints to sync tasks between the CRM and Google Tasks.
 * Uses Google's OAuth2 tokens stored in the user's connected accounts.
 */

const GOOGLE_TASKS_API_BASE = "https://tasks.googleapis.com/tasks/v1";

interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  updated: string;
  parent?: string;
  position?: string;
  links?: Array<{ type: string; description: string; link: string }>;
}

interface GoogleTaskList {
  id: string;
  title: string;
  updated: string;
}

// Helper: Get user's Google OAuth token from connected accounts
async function getGoogleToken(userId: number, db: any): Promise<string | null> {
  // This would query the connectedAccounts table for a Google account
  // For now, return null — implementation depends on how tokens are stored
  const account = await db.query.connectedAccounts.findFirst({
    where: (a: any) => a.provider === "google" && a.userId === userId,
  });
  return account?.accessToken || null;
}

// Helper: Fetch from Google Tasks API
async function googleTasksRequest(token: string, path: string, method = "GET", body?: any) {
  const url = `${GOOGLE_TASKS_API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Google Tasks API error: ${res.status} ${err}`,
    });
  }

  return res.json();
}

export const googleTasksRouter = createRouter({
  // List all Google Task lists
  listTaskLists: authedQuery.query(async ({ ctx }) => {
    const token = await getGoogleToken(ctx.user.id, ctx.db);
    if (!token) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "No Google account connected. Connect Google in Integrations.",
      });
    }

    const data = await googleTasksRequest(token, "/users/@me/lists");
    return (data.items || []) as GoogleTaskList[];
  }),

  // List tasks in a specific task list
  listTasks: authedQuery
    .input(z.object({ taskListId: z.string(), showCompleted: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      const token = await getGoogleToken(ctx.user.id, ctx.db);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No Google account connected. Connect Google in Integrations.",
        });
      }

      const queryParams = new URLSearchParams();
      queryParams.set("showCompleted", input.showCompleted ? "true" : "false");
      queryParams.set("showHidden", "false");
      queryParams.set("maxResults", "100");

      const data = await googleTasksRequest(
        token,
        `/lists/${encodeURIComponent(input.taskListId)}/tasks?${queryParams.toString()}`
      );
      return (data.items || []) as GoogleTask[];
    }),

  // Create a new Google Task
  createTask: authedQuery
    .input(
      z.object({
        taskListId: z.string(),
        title: z.string().min(1),
        notes: z.string().optional(),
        due: z.string().optional(), // ISO 8601 date string
        parent: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getGoogleToken(ctx.user.id, ctx.db);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No Google account connected. Connect Google in Integrations.",
        });
      }

      const body: any = {
        title: input.title,
        notes: input.notes,
        status: "needsAction",
      };
      if (input.due) body.due = input.due;
      if (input.parent) body.parent = input.parent;

      const data = await googleTasksRequest(
        token,
        `/lists/${encodeURIComponent(input.taskListId)}/tasks`,
        "POST",
        body
      );
      return data as GoogleTask;
    }),

  // Update an existing Google Task
  updateTask: authedQuery
    .input(
      z.object({
        taskListId: z.string(),
        taskId: z.string(),
        title: z.string().optional(),
        notes: z.string().optional(),
        due: z.string().optional(),
        status: z.enum(["needsAction", "completed"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getGoogleToken(ctx.user.id, ctx.db);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No Google account connected. Connect Google in Integrations.",
        });
      }

      const body: any = {};
      if (input.title !== undefined) body.title = input.title;
      if (input.notes !== undefined) body.notes = input.notes;
      if (input.due !== undefined) body.due = input.due;
      if (input.status !== undefined) body.status = input.status;
      if (input.status === "completed") body.completed = new Date().toISOString();

      const data = await googleTasksRequest(
        token,
        `/lists/${encodeURIComponent(input.taskListId)}/tasks/${encodeURIComponent(input.taskId)}`,
        "PATCH",
        body
      );
      return data as GoogleTask;
    }),

  // Delete a Google Task
  deleteTask: authedQuery
    .input(z.object({ taskListId: z.string(), taskId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const token = await getGoogleToken(ctx.user.id, ctx.db);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No Google account connected. Connect Google in Integrations.",
        });
      }

      await googleTasksRequest(
        token,
        `/lists/${encodeURIComponent(input.taskListId)}/tasks/${encodeURIComponent(input.taskId)}`,
        "DELETE"
      );
      return { success: true };
    }),

  // Move a task to a different position or under a parent
  moveTask: authedQuery
    .input(
      z.object({
        taskListId: z.string(),
        taskId: z.string(),
        parent: z.string().optional(),
        previous: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = await getGoogleToken(ctx.user.id, ctx.db);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No Google account connected. Connect Google in Integrations.",
        });
      }

      const params = new URLSearchParams();
      if (input.parent) params.set("parent", input.parent);
      if (input.previous) params.set("previous", input.previous);

      const data = await googleTasksRequest(
        token,
        `/lists/${encodeURIComponent(input.taskListId)}/tasks/${encodeURIComponent(input.taskId)}/move?${params.toString()}`,
        "POST"
      );
      return data as GoogleTask;
    }),

  // Sync CRM tasks to Google Tasks (one-way push)
  syncToGoogle: authedQuery
    .input(
      z.object({
        taskListId: z.string(),
        clientId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./queries/connection");
      const { tasks } = await import("../db/schema");
      const { eq, and, isNull } = await import("drizzle-orm");
      const db = getDb();

      const token = await getGoogleToken(ctx.user.id, ctx.db);
      if (!token) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No Google account connected. Connect Google in Integrations.",
        });
      }

      // Fetch CRM tasks for this user (and optionally client)
      const where = input.clientId
        ? and(eq(tasks.userId, ctx.user.id), eq(tasks.clientId, input.clientId))
        : and(eq(tasks.userId, ctx.user.id), isNull(tasks.completedAt));

      const crmTasks = await db.select().from(tasks).where(where);

      const results = [];
      for (const task of crmTasks.slice(0, 50)) { // Batch limit
        try {
          const googleTask = await googleTasksRequest(
            token,
            `/lists/${encodeURIComponent(input.taskListId)}/tasks`,
            "POST",
            {
              title: task.title,
              notes: task.notes || `CRM Task ID: ${task.id}`,
              due: task.dueDate ? new Date(task.dueDate * 1000).toISOString() : undefined,
              status: task.completedAt ? "completed" : "needsAction",
            }
          );
          results.push({ crmId: task.id, googleId: googleTask.id, status: "created" });
        } catch (err) {
          results.push({ crmId: task.id, error: (err as Error).message });
        }
      }

      return { synced: results.length, results };
    }),
});
