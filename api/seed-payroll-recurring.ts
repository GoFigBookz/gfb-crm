/**
 * RECURRING PAYROLL REMINDERS — Markie 2026-06-24.
 * One source of truth per payroll run: a high-priority TASK (shows in the daily
 * agenda + dashboard) plus ONE 4-hour morning calendar block per payroll Wednesday
 * (shows on the calendar, pushed to Google so it can't be missed). No separate
 * thing to babysit — tick the task done, the next occurrence is already on the
 * calendar.
 *
 *  - Clark OS, Clark CW, Auld/Old Spot, Sher-E-Punjab = BIWEEKLY, every 2nd
 *    Wednesday, anchored to today (2026-06-24).
 *  - West York = WEEKLY, every Wednesday.
 *  - 4-hour block 8:00 AM – 12:00 PM (America/Toronto, DST-correct).
 *
 * SAFE / IDEMPOTENT: materialises occurrences in a rolling 8-week window; re-running
 * (boot + daily) only adds what's missing, never duplicates. Per-client isolation:
 * each task carries its own clientId.
 */
import { getDb } from "./queries/connection";
import { users, clients, tasks, calendarEvents } from "../db/schema";
import { eq, and, gte } from "drizzle-orm";

const OWNER_EMAIL = "markie.antle@gmail.com";
const TZ = "America/Toronto";
const WINDOW_DAYS = 56;            // ~8 weeks of occurrences kept materialised ahead
const BLOCK_START = "08:00:00";    // 4-hour morning block
const BLOCK_END = "12:00:00";

/** The UTC instant whose Toronto wall-clock time is dateStr + timeStr (DST-aware). */
function wallToUtc(dateStr: string, timeStr: string): Date {
  const guess = new Date(`${dateStr}T${timeStr}Z`);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(guess)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(guess.getTime() - (asUTC - guess.getTime()));
}

const ymdInTz = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const weekdayInTz = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);

export async function ensurePayrollReminders(): Promise<{ tasksAdded: number; eventsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    // Owner (Markie) — by email, else the first user.
    const owner = (await db.select().from(users).where(eq(users.email, OWNER_EMAIL)).limit(1))[0]
      || (await db.select().from(users).limit(1))[0];
    if (!owner) return { tasksAdded: 0, eventsAdded: 0, skipped: "no user" };
    const userId = (owner as any).id;

    // Resolve the payroll clients by name (per-client isolation kept — each gets its
    // own clientId). Missing clients are just skipped.
    const cs = (await db.select().from(clients)) as any[];
    const find = (pred: (n: string) => boolean) => cs.find((c) => pred((c.name || "").toLowerCase()));
    const clarkCw = find((n) => /colling/.test(n));
    const clarkOs = find((n) => /clark/.test(n) && /(owen|sound)/.test(n));
    const auldSpot = find((n) => /spot/.test(n));
    const sherPunjab = find((n) => /sher|punjab/.test(n));
    const westYork = find((n) => /west\s*york/.test(n));

    const BIWEEKLY = [clarkCw, clarkOs, auldSpot, sherPunjab].filter(Boolean);
    const WEEKLY = [westYork].filter(Boolean);

    // "Today" in Toronto = the biweekly anchor (Markie confirmed today is a payroll Wed).
    const todayStr = ymdInTz(new Date());
    const base = new Date(`${todayStr}T12:00:00Z`); // noon UTC → stable calendar day in TZ

    // Existing payroll tasks + payroll blocks (this user) so we never duplicate.
    const sinceCutoff = new Date(base.getTime() - 2 * 86400000);
    const existingTasks = (await db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.category, "Payroll"), gte(tasks.dueDate, sinceCutoff)))) as any[];
    const haveTask = new Set(existingTasks.map((t) => `${t.clientId}|${ymdInTz(new Date(t.dueDate))}`));
    const existingEvents = (await db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, userId), gte(calendarEvents.startDate, sinceCutoff)))) as any[];
    const haveEvent = new Set(existingEvents.filter((e) => /^Payroll run/.test(e.title || "")).map((e) => ymdInTz(new Date(e.startDate))));

    let tasksAdded = 0, eventsAdded = 0;
    const { pushEventToGoogle } = await import("./google-push");

    for (let i = 0; i <= WINDOW_DAYS; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      if (weekdayInTz(d) !== "Wed") continue;
      const dateStr = ymdInTz(d);
      const dayDiff = Math.round((d.getTime() - base.getTime()) / 86400000);
      const isBiweekly = dayDiff % 14 === 0; // anchored to today

      const due: any[] = [...WEEKLY, ...(isBiweekly ? BIWEEKLY : [])];
      if (!due.length) continue;

      // One 4-hour morning block for the day (lists who's due).
      if (!haveEvent.has(dateStr)) {
        const names = due.map((c) => c.name).join(", ");
        const [ev] = await db.insert(calendarEvents).values({
          userId, title: "Payroll run", description: `Run payroll: ${names}`,
          startDate: wallToUtc(dateStr, BLOCK_START), endDate: wallToUtc(dateStr, BLOCK_END),
          isAllDay: false, color: "#16a34a", status: "confirmed", isRecurring: true,
        } as any).returning();
        eventsAdded++;
        haveEvent.add(dateStr);
        if (ev?.id) { try { await pushEventToGoogle(ev.id); } catch { /* best-effort */ } }
      }

      // One high-priority task per client due that day.
      const dueAt = wallToUtc(dateStr, BLOCK_END); // due by end of the block (noon)
      for (const c of due) {
        const k = `${c.id}|${dateStr}`;
        if (haveTask.has(k)) continue;
        await db.insert(tasks).values({
          userId, clientId: c.id, title: `Run payroll — ${c.name}`,
          description: "Recurring payroll run.", dueDate: dueAt,
          priority: "high", status: "pending", category: "Payroll", isRecurring: true,
        } as any);
        tasksAdded++;
        haveTask.add(k);
      }
    }

    if (tasksAdded || eventsAdded) console.log(`[payroll-reminders] +${tasksAdded} tasks, +${eventsAdded} calendar blocks`);
    return { tasksAdded, eventsAdded, skipped: "" };
  } catch (err) {
    console.error("[payroll-reminders] failed:", err instanceof Error ? err.message : err);
  }
}
