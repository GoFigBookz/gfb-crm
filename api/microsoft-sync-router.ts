import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { connectedAccounts, emails, calendarEvents, tasks } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * MICROSOFT SYNC ROUTER
 * 
 * Pulls real data from connected Microsoft accounts:
 * - Outlook emails → emails table
 * - Calendar events → calendar_events table
 * - To-Do tasks → tasks table
 */

// Microsoft Graph API helper
async function graphApiRequest(accessToken: string, endpoint: string, params?: Record<string, string>) {
  const url = new URL(endpoint);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  const res = await fetch(url.toString(), {
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph error: ${res.status} ${err}`);
  }
  return res.json();
}

export const microsoftSyncRouter = createRouter({
  // Sync Outlook emails
  syncOutlook: staffQuery
    .input(z.object({
      accountId: z.number(),
      maxResults: z.number().default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      const accounts = await db
        .select()
        .from(connectedAccounts)
        .where(and(
          eq(connectedAccounts.id, input.accountId),
          eq(connectedAccounts.userId, ctx.user.id),
          eq(connectedAccounts.provider, "microsoft")
        ))
        .limit(1);
      
      if (!accounts[0]) throw new Error("Microsoft account not found");
      const account = accounts[0];
      if (!account.accessToken) throw new Error("Account not authenticated");

      const data = await graphApiRequest(
        account.accessToken,
        "https://graph.microsoft.com/v1.0/me/messages",
        {
          $top: String(input.maxResults),
          $select: "id,subject,bodyPreview,from,toRecipients,receivedDateTime,sentDateTime,conversationId,isRead,importance,hasAttachments",
          $orderby: "receivedDateTime desc",
        }
      );

      const messages = data.value || [];
      const syncedEmails = [];

      for (const msg of messages) {
        const existing = await db
          .select({ id: emails.id })
          .from(emails)
          .where(eq(emails.outlookMessageId, msg.id))
          .limit(1);

        if (existing[0]) continue;

        const from = msg.from?.emailAddress;
        const to = msg.toRecipients?.map((r: { emailAddress: { name: string; address: string } }) => 
          `${r.emailAddress.name} <${r.emailAddress.address}>`
        ).join(", ") || "";

        const [email] = await db.insert(emails).values({
          userId: ctx.user.id,
          connectedAccountId: account.id,
          outlookMessageId: msg.id,
          threadId: msg.conversationId,
          fromAddress: from?.address || "",
          fromName: from?.name || "",
          toAddresses: to,
          subject: msg.subject || "",
          bodyPlain: msg.bodyPreview || "",
          body: msg.bodyPreview || "",
          isRead: msg.isRead || false,
          isImportant: msg.importance === "high",
          isSent: false,
          receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
          syncedAt: new Date(),
        }).returning();

        syncedEmails.push(email);
      }

      await db
        .update(connectedAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(connectedAccounts.id, account.id));

      return {
        success: true,
        synced: syncedEmails.length,
        totalInBatch: messages.length,
        account: account.accountLabel,
      };
    }),

  // Sync Microsoft Calendar events
  syncCalendar: staffQuery
    .input(z.object({
      accountId: z.number(),
      daysBack: z.number().default(30),
      daysForward: z.number().default(90),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      const accounts = await db
        .select()
        .from(connectedAccounts)
        .where(and(
          eq(connectedAccounts.id, input.accountId),
          eq(connectedAccounts.userId, ctx.user.id),
          eq(connectedAccounts.provider, "microsoft")
        ))
        .limit(1);
      
      if (!accounts[0]) throw new Error("Microsoft account not found");
      const account = accounts[0];
      if (!account.accessToken) throw new Error("Account not authenticated");

      const now = new Date();
      const start = new Date(now.getTime() - input.daysBack * 86400000).toISOString();
      const end = new Date(now.getTime() + input.daysForward * 86400000).toISOString();

      const data = await graphApiRequest(
        account.accessToken,
        "https://graph.microsoft.com/v1.0/me/calendarview",
        {
          startDateTime: start,
          endDateTime: end,
          $top: "250",
          $select: "id,subject,bodyPreview,start,end,isAllDay,location,attendees,organizer,webLink,seriesMasterId",
        }
      );

      const events = data.value || [];
      const syncedEvents = [];

      for (const event of events) {
        const existing = await db
          .select({ id: calendarEvents.id })
          .from(calendarEvents)
          .where(eq(calendarEvents.outlookEventId, event.id))
          .limit(1);

        if (existing[0]) continue;

        const [calEvent] = await db.insert(calendarEvents).values({
          userId: ctx.user.id,
          connectedAccountId: account.id,
          outlookEventId: event.id,
          title: event.subject || "(No title)",
          description: event.bodyPreview || "",
          startTime: new Date(event.start?.dateTime),
          endTime: new Date(event.end?.dateTime),
          isAllDay: event.isAllDay || false,
          location: event.location?.displayName || "",
          attendees: event.attendees?.map((a: { emailAddress: { name: string; address: string } }) => 
            `${a.emailAddress.name} <${a.emailAddress.address}>`
          ).join(", ") || "",
          status: "confirmed",
          recurringEventId: event.seriesMasterId || null,
          organizer: event.organizer?.emailAddress?.email || "",
          htmlLink: event.webLink || "",
          syncedAt: new Date(),
        }).returning();

        syncedEvents.push(calEvent);
      }

      await db
        .update(connectedAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(connectedAccounts.id, account.id));

      return {
        success: true,
        synced: syncedEvents.length,
        totalInBatch: events.length,
        account: account.accountLabel,
      };
    }),

  // Sync Microsoft To-Do tasks
  syncTasks: staffQuery
    .input(z.object({
      accountId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      const accounts = await db
        .select()
        .from(connectedAccounts)
        .where(and(
          eq(connectedAccounts.id, input.accountId),
          eq(connectedAccounts.userId, ctx.user.id),
          eq(connectedAccounts.provider, "microsoft")
        ))
        .limit(1);
      
      if (!accounts[0]) throw new Error("Microsoft account not found");
      const account = accounts[0];
      if (!account.accessToken) throw new Error("Account not authenticated");

      // Get all task lists
      const listsData = await graphApiRequest(
        account.accessToken,
        "https://graph.microsoft.com/v1.0/me/todo/lists",
        { $top: "100" }
      );

      const lists = listsData.value || [];
      let syncedCount = 0;

      for (const list of lists) {
        const tasksData = await graphApiRequest(
          account.accessToken,
          `https://graph.microsoft.com/v1.0/me/todo/lists/${list.id}/tasks`,
          { $top: "250" }
        );

        const items = tasksData.value || [];

        for (const task of items) {
          const existing = await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(tasks.microsoftTaskId, task.id))
            .limit(1);

          if (existing[0]) continue;

          await db.insert(tasks).values({
            userId: ctx.user.id,
            connectedAccountId: account.id,
            microsoftTaskId: task.id,
            title: task.title || "",
            description: task.body?.content || "",
            status: task.status === "completed" ? "completed" : "pending",
            priority: task.importance === "high" ? "high" : "medium",
            dueDate: task.dueDateTime ? new Date(task.dueDateTime.dateTime) : null,
            completedAt: task.completedDateTime ? new Date(task.completedDateTime.dateTime) : null,
            createdAt: new Date(task.createdDateTime || Date.now()),
          });

          syncedCount++;
        }
      }

      await db
        .update(connectedAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(connectedAccounts.id, account.id));

      return {
        success: true,
        synced: syncedCount,
        account: account.accountLabel,
      };
    }),

  // Sync all Microsoft services at once
  syncAll: staffQuery
    .input(z.object({
      accountId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      const account = await db
        .select()
        .from(connectedAccounts)
        .where(and(
          eq(connectedAccounts.id, input.accountId),
          eq(connectedAccounts.userId, ctx.user.id),
          eq(connectedAccounts.provider, "microsoft")
        ))
        .limit(1);

      if (!account[0]) throw new Error("Microsoft account not found");

      return {
        success: true,
        account: account[0].accountLabel,
        services: {
          outlook: "Emails would be synced",
          calendar: "Events would be synced",
          tasks: "Tasks would be synced",
        },
        message: "Use syncOutlook, syncCalendar, syncTasks endpoints individually or wire them into a batch job",
      };
    }),
});
