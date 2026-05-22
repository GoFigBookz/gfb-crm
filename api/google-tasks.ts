/**
 * GOOGLE TASKS SYNC
 * Two-way sync between CRM tasks and Google Tasks
 */

import { getDb } from "./queries/connection";
import { tasks, connectedAccounts } from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get user's Google access token from connected accounts
 */
async function getGoogleToken(userId: number): Promise<string | null> {
  const db = getDb();
  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.userId, userId),
        eq(connectedAccounts.provider, "google"),
        eq(connectedAccounts.isActive, true)
      )
    )
    .limit(1);

  const account = accounts[0];
  if (!account?.accessToken) return null;

  // Check if token is expired and refresh if needed
  if (account.expiresAt && account.expiresAt < Date.now()) {
    if (account.refreshToken) {
      const newToken = await refreshGoogleToken(account.refreshToken);
      if (newToken) {
        await db
          .update(connectedAccounts)
          .set({
            accessToken: newToken.access_token,
            expiresAt: Date.now() + (newToken.expires_in || 3600) * 1000,
          })
          .where(eq(connectedAccounts.id, account.id));
        return newToken.access_token;
      }
    }
    return null;
  }

  return account.accessToken;
}

/**
 * Refresh Google OAuth token
 */
async function refreshGoogleToken(refreshToken: string): Promise<any> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Create a Google Task from a CRM task
 */
export async function createGoogleTask(crmTask: {
  id: number;
  userId: number;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  completed: boolean;
}): Promise<string | null> {
  const token = await getGoogleToken(crmTask.userId);
  if (!token) return null;

  const taskListId = "@default"; // Use default task list

  const body: any = {
    title: crmTask.title,
    notes: crmTask.description || "",
  };

  if (crmTask.dueDate) {
    body.due = crmTask.dueDate.toISOString();
  }

  if (crmTask.completed) {
    body.status = "completed";
  }

  const response = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    console.error("[Google Tasks] Create failed:", response.status);
    return null;
  }

  const data = await response.json();
  return data.id; // Google Task ID
}

/**
 * Update a Google Task
 */
export async function updateGoogleTask(
  googleTaskId: string,
  updates: {
    userId: number;
    title?: string;
    description?: string;
    dueDate?: Date;
    completed?: boolean;
  }
): Promise<boolean> {
  const token = await getGoogleToken(updates.userId);
  if (!token) return false;

  const taskListId = "@default";

  const body: any = {};
  if (updates.title) body.title = updates.title;
  if (updates.description !== undefined) body.notes = updates.description;
  if (updates.dueDate) body.due = updates.dueDate.toISOString();
  if (updates.completed !== undefined) body.status = updates.completed ? "completed" : "needsAction";

  const response = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${googleTaskId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  return response.ok;
}

/**
 * Delete a Google Task
 */
export async function deleteGoogleTask(
  googleTaskId: string,
  userId: number
): Promise<boolean> {
  const token = await getGoogleToken(userId);
  if (!token) return false;

  const taskListId = "@default";

  const response = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks/${googleTaskId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return response.ok;
}

/**
 * Fetch all Google Tasks for a user
 */
export async function listGoogleTasks(userId: number): Promise<any[]> {
  const token = await getGoogleToken(userId);
  if (!token) return [];

  const taskListId = "@default";

  const response = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${taskListId}/tasks`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) return [];

  const data = await response.json();
  return data.items || [];
}

/**
 * Sync CRM tasks to Google Tasks (one-way: CRM → Google)
 */
export async function syncTasksToGoogle(userId: number): Promise<{
  created: number;
  updated: number;
  errors: number;
}> {
  const db = getDb();
  const results = { created: 0, updated: 0, errors: 0 };

  // Get all pending CRM tasks without a Google Task ID
  const pendingTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.completed, false)
      )
    );

  for (const task of pendingTasks) {
    try {
      if (task.googleTaskId) {
        // Update existing Google Task
        await updateGoogleTask(task.googleTaskId, {
          userId,
          title: task.title,
          description: task.description || "",
          dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        });
        results.updated++;
      } else {
        // Create new Google Task
        const googleTaskId = await createGoogleTask({
          id: task.id,
          userId,
          title: task.title,
          description: task.description,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          completed: task.completed,
        });

        if (googleTaskId) {
          await db
            .update(tasks)
            .set({ googleTaskId })
            .where(eq(tasks.id, task.id));
          results.created++;
        }
      }
    } catch (err) {
      console.error("[Google Tasks] Sync error:", err);
      results.errors++;
    }
  }

  return results;
}

/**
 * Sync Google Tasks to CRM (one-way: Google → CRM)
 * Pulls tasks from Google and creates them in CRM if they don't exist
 */
export async function syncGoogleToCRM(userId: number): Promise<{
  imported: number;
  errors: number;
}> {
  const db = getDb();
  const results = { imported: 0, errors: 0 };

  const googleTasks = await listGoogleTasks(userId);

  for (const gt of googleTasks) {
    try {
      // Skip if already synced (we'd need to store google task IDs)
      // For now, import all non-completed tasks
      if (gt.status === "completed") continue;

      // Check if task with this Google ID already exists
      const existing = await db
        .select()
        .from(tasks)
        .where(eq(tasks.googleTaskId, gt.id))
        .limit(1);

      if (existing.length > 0) continue;

      // Create CRM task
      await db.insert(tasks).values({
        userId,
        title: gt.title,
        description: gt.notes || "",
        dueDate: gt.due ? new Date(gt.due) : null,
        completed: gt.status === "completed",
        priority: "medium",
        status: "pending",
        googleTaskId: gt.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      results.imported++;
    } catch (err) {
      console.error("[Google Tasks] Import error:", err);
      results.errors++;
    }
  }

  return results;
}

/**
 * Full two-way sync
 */
export async function syncGoogleTasks(userId: number): Promise<{
  toGoogle: { created: number; updated: number; errors: number };
  toCRM: { imported: number; errors: number };
}> {
  const toGoogle = await syncTasksToGoogle(userId);
  const toCRM = await syncGoogleToCRM(userId);

  return { toGoogle, toCRM };
}
