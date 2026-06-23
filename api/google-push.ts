/**
 * GOOGLE PUSH — the WRITE-BACK half of two-way sync. When a task or calendar
 * event is created/changed in the CRM, mirror it into the user's REAL Google
 * Tasks / Google Calendar. Pull (google-sync-router) sets googleTaskId/
 * googleEventId, and push only CREATES when that id is missing, so the two halves
 * never loop or duplicate.
 *
 * Everything is best-effort and fire-and-forget: a Google hiccup must never break
 * a CRM save. Uses the firm-wide Google login.
 */
import { getDb } from "./queries/connection";
import { tasks, calendarEvents } from "../db/schema";
import { eq } from "drizzle-orm";
import { getFirmGoogleAccount, getValidGoogleAccessToken } from "./google-token";

async function token(): Promise<string | null> {
  const acct = await getFirmGoogleAccount();
  if (!acct?.refreshToken && !acct?.accessToken) return null;
  try { return await getValidGoogleAccessToken(acct as any); } catch { return null; }
}

async function gfetch(url: string, method: string, accessToken: string, body?: any): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`google ${method} ${url} → ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json().catch(() => ({}));
}

/** Push a CRM task to Google Tasks (create if new, else patch). Stores the id. */
export async function pushTaskToGoogle(taskId: number): Promise<void> {
  try {
    const db = getDb();
    const t = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0] as any;
    if (!t) return;
    const at = await token();
    if (!at) return;
    const payload: any = {
      title: t.title || "(untitled)",
      notes: t.description || undefined,
      status: t.status === "completed" ? "completed" : "needsAction",
    };
    if (t.dueDate) payload.due = new Date(t.dueDate).toISOString();
    if (t.completedAt) payload.completed = new Date(t.completedAt).toISOString();
    if (t.googleTaskId) {
      await gfetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${t.googleTaskId}`, "PATCH", at, payload);
    } else {
      const created = await gfetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", "POST", at, payload);
      if (created?.id) await db.update(tasks).set({ googleTaskId: created.id }).where(eq(tasks.id, taskId));
    }
  } catch (e) { console.error("[google-push] task failed:", e instanceof Error ? e.message : e); }
}

/** Push a CRM calendar event to Google Calendar (create if new, else patch). */
export async function pushEventToGoogle(eventId: number): Promise<void> {
  try {
    const db = getDb();
    const ev = (await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)).limit(1))[0] as any;
    if (!ev) return;
    const at = await token();
    if (!at) return;
    const payload: any = {
      summary: ev.title || "(untitled)",
      description: ev.description || undefined,
      location: ev.location || undefined,
    };
    if (ev.isAllDay) {
      // Google all-day uses date-only; end is EXCLUSIVE (next day).
      const ymd = (d: any) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }); // YYYY-MM-DD
      const startYmd = ymd(ev.startDate);
      const endD = new Date(new Date(ev.endDate || ev.startDate).getTime() + 86400000);
      payload.start = { date: startYmd };
      payload.end = { date: ymd(endD) };
    } else {
      payload.start = { dateTime: new Date(ev.startDate).toISOString() };
      payload.end = { dateTime: new Date(ev.endDate || ev.startDate).toISOString() };
    }
    if (ev.attendees) {
      const emails = String(ev.attendees).match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
      if (emails.length) payload.attendees = emails.map((email) => ({ email }));
    }
    if (ev.googleEventId) {
      await gfetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.googleEventId}`, "PATCH", at, payload);
    } else {
      const created = await gfetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", "POST", at, payload);
      if (created?.id) await db.update(calendarEvents).set({ googleEventId: created.id }).where(eq(calendarEvents.id, eventId));
    }
  } catch (e) { console.error("[google-push] event failed:", e instanceof Error ? e.message : e); }
}

/** Delete a Google Calendar event when its CRM event is deleted. */
export async function deleteGoogleEvent(googleEventId: string | null | undefined): Promise<void> {
  if (!googleEventId) return;
  try {
    const at = await token();
    if (!at) return;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${at}` },
    });
  } catch (e) { console.error("[google-push] delete event failed:", e instanceof Error ? e.message : e); }
}
