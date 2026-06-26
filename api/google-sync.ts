/**
 * GOOGLE SYNC SERVICE
 * Syncs Gmail, Calendar, and Tasks from connected Google accounts
 */

import { getDb } from "./queries/connection";
import { connectedAccounts, emails, calendarEvents, tasks, clients, clientEmails } from "../db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { extractEmail, matchClientId, buildClientDomainMap, matchClientByDomain } from "./email-core";

/**
 * Build the address→clientId + domain→clientId maps used to sort incoming mail
 * into clients. Source of truth = each client's primary `email` PLUS every row
 * in `clientEmails` (billing/payroll/etc.). Domain map is unambiguous-only and
 * skips generic providers (see email-core) so we NEVER mis-file mail to a guess.
 */
async function buildClientAddrMaps(userId: number): Promise<{ byAddr: Map<string, number>; byDomain: Map<string, number> }> {
  const db = getDb();
  const byAddr = new Map<string, number>();
  const pairs: Array<{ clientId: number; address: string }> = [];

  const clientRows = await db.select({ id: clients.id, email: clients.email }).from(clients).where(eq(clients.userId, userId));
  for (const c of clientRows) {
    const a = (c.email || "").toLowerCase().trim();
    if (a) { byAddr.set(a, c.id); pairs.push({ clientId: c.id, address: a }); }
  }

  const extraRows = await db.select({ clientId: clientEmails.clientId, email: clientEmails.email }).from(clientEmails);
  for (const e of extraRows) {
    const a = (e.email || "").toLowerCase().trim();
    if (a) { if (!byAddr.has(a)) byAddr.set(a, e.clientId); pairs.push({ clientId: e.clientId, address: a }); }
  }

  return { byAddr, byDomain: buildClientDomainMap(pairs) };
}

interface SyncResult {
  emailsAdded: number;
  eventsAdded: number;
  tasksAdded: number;
  errors: string[];
}

/**
 * Refresh Google access token using refresh token
 */
async function refreshGoogleToken(accountId: number, refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();
    if (data.access_token) {
      // Update in database
      const db = getDb();
      await db
        .update(connectedAccounts)
        .set({
          accessToken: data.access_token,
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
          lastSyncedAt: new Date(),
        })
        .where(eq(connectedAccounts.id, accountId));
      return data.access_token;
    }
  } catch (err) {
    console.error("[Google Sync] Token refresh failed:", err);
  }
  return null;
}

/**
 * Sync Gmail messages
 */
async function syncGmail(accessToken: string, userId: number, accountId: number): Promise<number> {
  try {
    // Get recent messages
    const response = await fetch(
      "https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=INBOX",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await response.json();
    if (!data.messages) return 0;

    const db = getDb();
    let added = 0;

    // Build the client-matching maps ONCE per sync so each inbound email gets
    // sorted into its client (exact address → unambiguous domain → null).
    const { byAddr, byDomain } = await buildClientAddrMaps(userId);

    for (const msg of data.messages.slice(0, 10)) {
      // Get message details
      const detailResponse = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const detail = await detailResponse.json();

      const headers = detail.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === "Subject")?.value || "No Subject";
      const from = headers.find((h: any) => h.name === "From")?.value || "";
      const date = headers.find((h: any) => h.name === "Date")?.value;

      // Check if already exists
      const existing = await db
        .select()
        .from(emails)
        .where(eq(emails.gmailMessageId, msg.id))
        .limit(1);

      if (existing.length === 0) {
        // Sort into a client by sender: exact address first, then unambiguous
        // domain. No match → clientId stays null (shows as unsorted for review).
        const fromAddr = extractEmail(from);
        const clientId =
          matchClientId([fromAddr], byAddr) ?? matchClientByDomain([fromAddr], byDomain);

        await db.insert(emails).values({
          userId,
          clientId,
          connectedAccountId: accountId,
          gmailMessageId: msg.id,
          threadId: detail.threadId,
          subject,
          from,
          to: "",
          body: "", // Would need full fetch for body
          bodyHtml: "",
          folder: "inbox",
          isRead: detail.labelIds?.includes("UNREAD") ? false : true,
          isStarred: detail.labelIds?.includes("STARRED") || false,
          receivedAt: date ? new Date(date) : new Date(),
          sentAt: date ? new Date(date) : new Date(),
          hasAttachments: detail.payload?.parts?.some((p: any) => p.filename) || false,
          snippet: detail.snippet || "",
        });
        added++;
      }
    }

    // Backfill: sort any EXISTING unsorted emails (clientId null) for this user
    // now that we have the maps — fixes the historical backlog, not just new mail.
    await backfillEmailClientIds(userId, byAddr, byDomain);

    return added;
  } catch (err) {
    console.error("[Google Sync] Gmail sync failed:", err);
    return 0;
  }
}

/**
 * Assign clientId to already-stored emails that never got sorted. Read-only on
 * the maps; only fills NULLs (never reassigns a manually-set client).
 */
async function backfillEmailClientIds(
  userId: number,
  byAddr: Map<string, number>,
  byDomain: Map<string, number>,
): Promise<number> {
  const db = getDb();
  const unsorted = await db
    .select({ id: emails.id, from: emails.from })
    .from(emails)
    .where(and(eq(emails.userId, userId), isNull(emails.clientId)))
    .limit(500);

  let fixed = 0;
  for (const row of unsorted) {
    const fromAddr = extractEmail(row.from || "");
    if (!fromAddr) continue;
    const clientId = matchClientId([fromAddr], byAddr) ?? matchClientByDomain([fromAddr], byDomain);
    if (clientId) {
      await db.update(emails).set({ clientId }).where(eq(emails.id, row.id));
      fixed++;
    }
  }
  return fixed;
}

/**
 * Sync Google Calendar events
 */
async function syncCalendar(accessToken: string, userId: number, accountId: number): Promise<number> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      `timeMin=${thirtyDaysAgo.toISOString()}&` +
      `timeMax=${thirtyDaysAhead.toISOString()}&` +
      `singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await response.json();
    if (!data.items) return 0;

    const db = getDb();
    let added = 0;

    for (const event of data.items) {
      // Check if already exists
      const existing = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.googleEventId, event.id))
        .limit(1);

      if (existing.length === 0) {
        // All-day events are "YYYY-MM-DD" — parse as LOCAL noon so they don't
        // drift a day (UTC midnight shows on the wrong weekday in Eastern).
        const gDate = (part: any): Date | null => {
          if (part?.dateTime) return new Date(part.dateTime);
          if (!part?.date) return null;
          const [y, m, d] = String(part.date).split("-").map(Number);
          return new Date(y, m - 1, d, 12, 0, 0);
        };
        const allDay = !event.start?.dateTime;
        const startDate = gDate(event.start) || new Date();
        let endDate = gDate(event.end) || startDate;
        if (allDay && endDate.getTime() > startDate.getTime()) endDate = new Date(endDate.getTime() - 86400000); // Google all-day end is exclusive
        if (endDate.getTime() < startDate.getTime()) endDate = startDate;

        await db.insert(calendarEvents).values({
          userId,
          connectedAccountId: accountId,
          googleEventId: event.id,
          title: event.summary || "Untitled Event",
          description: event.description || "",
          location: event.location || "",
          startDate,
          endDate,
          isAllDay: allDay,
          attendees: JSON.stringify(event.attendees || []),
          status: event.status === "cancelled" ? "cancelled" : "confirmed",
          color: event.colorId || "",
        });
        added++;
      }
    }

    return added;
  } catch (err) {
    console.error("[Google Sync] Calendar sync failed:", err);
    return 0;
  }
}

/**
 * Sync Google Tasks
 */
async function syncTasks(accessToken: string, userId: number, accountId: number): Promise<number> {
  try {
    // Get task lists
    const listsResponse = await fetch(
      "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listsData = await listsResponse.json();
    if (!listsData.items) return 0;

    const db = getDb();
    let added = 0;

    for (const list of listsData.items) {
      // Get tasks in list
      const tasksResponse = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const tasksData = await tasksResponse.json();
      if (!tasksData.items) continue;

      for (const task of tasksData.items) {
        // Dedup by googleTaskId (NOT title) and STORE it, so the two-way push
        // never creates a duplicate copy back in Google Tasks.
        const existing = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(eq(tasks.googleTaskId, task.id))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(tasks).values({
            userId,
            clientId: null,
            googleTaskId: task.id,
            title: task.title || "Untitled Task",
            description: task.notes || "",
            status: task.status === "completed" ? "completed" : "pending",
            priority: "medium",
            category: "General",
            dueDate: task.due ? new Date(task.due) : null,
            completedAt: task.completed ? new Date(task.completed) : null,
            isRecurring: false,
            source: "google-tasks",
          });
          added++;
        }
      }
    }

    return added;
  } catch (err) {
    console.error("[Google Sync] Tasks sync failed:", err);
    return 0;
  }
}

/**
 * Sync all Google data for a connected account
 */
export async function syncGoogleAccount(accountId: number): Promise<SyncResult> {
  const result: SyncResult = { emailsAdded: 0, eventsAdded: 0, tasksAdded: 0, errors: [] };

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId))
      .limit(1);

    const account = rows[0];
    if (!account || !account.isActive) {
      result.errors.push("Account not found or inactive");
      return result;
    }

    let accessToken = account.accessToken;

    // Refresh token if needed
    if (account.refreshToken && (!account.expiresAt || new Date(account.expiresAt) < new Date())) {
      const newToken = await refreshGoogleToken(accountId, account.refreshToken);
      if (newToken) {
        accessToken = newToken;
      } else {
        result.errors.push("Token refresh failed");
        return result;
      }
    }

    const syncEnabled = account.syncEnabled ? JSON.parse(account.syncEnabled) : {};
    const userId = account.userId;

    if (syncEnabled.email !== false) {
      result.emailsAdded = await syncGmail(accessToken, userId, accountId);
    }

    if (syncEnabled.calendar !== false) {
      result.eventsAdded = await syncCalendar(accessToken, userId, accountId);
    }

    if (syncEnabled.tasks !== false) {
      result.tasksAdded = await syncTasks(accessToken, userId, accountId);
    }

    // Update last synced
    await db
      .update(connectedAccounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(connectedAccounts.id, accountId));

  } catch (err) {
    result.errors.push(String(err));
    console.error("[Google Sync] Account sync failed:", err);
  }

  return result;
}

/**
 * Sync all active Google accounts
 */
export async function syncAllGoogleAccounts(): Promise<{ accountId: number; result: SyncResult }[]> {
  const db = getDb();
  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.provider, "google"));

  const results = [];
  for (const account of accounts) {
    if (account.isActive) {
      const result = await syncGoogleAccount(account.id);
      results.push({ accountId: account.id, result });
    }
  }

  return results;
}
