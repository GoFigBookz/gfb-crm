/**
 * RECURRING PAYROLL REMINDERS — Markie 2026-06-24, hardened 2026-06-25.
 * One source of truth per payroll run: a high-priority TASK (shows in the daily
 * agenda + dashboard) plus ONE 4-hour morning calendar block per payroll Wednesday
 * (shows on the calendar, pushed to Google so it can't be missed). No separate
 * thing to babysit — tick the task done, the next occurrence is already on the
 * calendar.
 *
 *  - Clark OS, Clark CW, Auld/Old Spot, Sher-E-Punjab = BIWEEKLY, every 2nd
 *    Wednesday.
 *  - West York = WEEKLY, every Wednesday.
 *  - 4-hour block 8:00 AM – 12:00 PM (America/Toronto, DST-correct).
 *
 * THE BUG WE FIXED (money-risk): the old version anchored the biweekly cadence to
 * "today" at boot — assuming boot always runs on a payroll Wednesday. It doesn't.
 * When boot ran on, say, a Thursday (2026-06-25), the `% 14` math was measured from
 * a non-Wednesday, so every-other-week tasks drifted OFF Wednesday entirely (Markie
 * saw "run payroll … on the 25th", a Thursday). Now the biweekly cadence is anchored
 * to a FIXED, Markie-CONFIRMED payroll Wednesday (BIWEEKLY_ANCHOR) so it can never
 * drift with boot day, and EVERY task is guaranteed to land on a Wednesday.
 *
 * STAT HOLIDAYS: if a payroll Wednesday is an Ontario stat holiday (banks closed),
 * the run is moved EARLIER to the prior business day and the task/event carry a ⚠
 * notice so Markie runs it in time (per "account for stat holidays").
 *
 * CLEANUP: any stray future payroll task for these clients that ISN'T on its correct
 * scheduled day is deleted before we regenerate — so the bad "25th" tasks disappear.
 *
 * SAFE / IDEMPOTENT: materialises occurrences in a rolling 8-week window; re-running
 * (boot + daily) only adds what's missing, never duplicates. Per-client isolation:
 * each task carries its own clientId.
 */
import { getDb } from "./queries/connection";
import { users, clients, tasks, calendarEvents } from "../db/schema";
import { eq, and, gte } from "drizzle-orm";
import { ontarioStatHolidays } from "./stat-holidays";
import { computeReminderRuns } from "./payroll-reminder-core";

const OWNER_EMAIL = "markie.antle@gmail.com";
const TZ = "America/Toronto";
const WINDOW_DAYS = 56;            // ~8 weeks of occurrences kept materialised ahead
const BLOCK_START = "08:00:00";    // 4-hour morning block
const BLOCK_END = "12:00:00";

/** A CONFIRMED biweekly payroll Wednesday for Clark OS/CW, Auld Spot, Sher-E-Punjab
 *  (Markie, 2026-06-24). FIXED on purpose: the every-other-Wednesday cadence is
 *  measured from this date, so it stays on Wednesdays no matter what day boot runs. */
const BIWEEKLY_ANCHOR = "2026-06-24";

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

/** Set of Ontario stat-holiday YYYY-MM-DD strings spanning the years we touch. */
function statSet(years: number[]): Set<string> {
  const s = new Set<string>();
  for (const y of years) for (const h of ontarioStatHolidays(y)) s.add(h.date);
  return s;
}

export async function ensurePayrollReminders(): Promise<{ tasksAdded: number; eventsAdded: number; tasksRemoved: number; skipped: string } | void> {
  const db = getDb();
  try {
    // Owner (Markie) — by email, else the first user.
    const owner = (await db.select().from(users).where(eq(users.email, OWNER_EMAIL)).limit(1))[0]
      || (await db.select().from(users).limit(1))[0];
    if (!owner) return { tasksAdded: 0, eventsAdded: 0, tasksRemoved: 0, skipped: "no user" };
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
    const ALL_PAYROLL_IDS = new Set([...BIWEEKLY, ...WEEKLY].map((c) => c.id));

    const todayStr = ymdInTz(new Date());
    const base = new Date(`${todayStr}T12:00:00Z`); // noon UTC → stable calendar day in TZ
    const holidays = statSet([base.getUTCFullYear(), base.getUTCFullYear() + 1]);

    // --- Build the CORRECT schedule for the rolling window (pure, tested core). ---
    // A "correct" date is the payroll Wednesday, shifted earlier off a stat holiday.
    const runs = computeReminderRuns(todayStr, BIWEEKLY_ANCHOR, holidays, WINDOW_DAYS);
    const scheduled = new Map<string, { client: any; dateStr: string; statShift: boolean }[]>(); // runDate -> entries
    const correctKeys = new Set<string>(); // `${clientId}|${runDate}`
    for (const run of runs) {
      const dueClients: any[] = [...WEEKLY, ...(run.isBiweekly ? BIWEEKLY : [])];
      if (!dueClients.length) continue;
      for (const c of dueClients) {
        correctKeys.add(`${c.id}|${run.runISO}`);
        const arr = scheduled.get(run.runISO) || [];
        arr.push({ client: c, dateStr: run.runISO, statShift: run.statShifted });
        scheduled.set(run.runISO, arr);
      }
    }

    // --- Cleanup: delete future payroll tasks for these clients that AREN'T on a
    // correct scheduled day (the stray wrong-dated "25th" tasks). Only touch
    // open/auto-generated ones; never delete a completed task. ---
    let tasksRemoved = 0;
    const since = new Date(base.getTime() - 2 * 86400000);
    const allPayrollTasks = (await db.select().from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.category, "Payroll"), gte(tasks.dueDate, since)))) as any[];
    for (const t of allPayrollTasks) {
      if (!t.clientId || !ALL_PAYROLL_IDS.has(t.clientId)) continue;
      if (t.status === "completed" || t.completed) continue;
      const due = t.dueDate ? ymdInTz(new Date(t.dueDate)) : "";
      if (!correctKeys.has(`${t.clientId}|${due}`)) {
        await db.delete(tasks).where(eq(tasks.id, t.id));
        tasksRemoved++;
      }
    }

    // Re-read remaining tasks/events so we never duplicate.
    const existingTasks = (await db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.category, "Payroll"), gte(tasks.dueDate, since)))) as any[];
    const haveTask = new Set(existingTasks.map((t) => `${t.clientId}|${ymdInTz(new Date(t.dueDate))}`));
    const existingEvents = (await db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, userId), gte(calendarEvents.startDate, since)))) as any[];
    const haveEvent = new Set(existingEvents.filter((e) => /^Payroll run/.test(e.title || "")).map((e) => ymdInTz(new Date(e.startDate))));

    let tasksAdded = 0, eventsAdded = 0;
    const { pushEventToGoogle } = await import("./google-push");

    for (const [runDate, entries] of [...scheduled.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const statShift = entries.some((e) => e.statShift);
      const statNote = statShift ? " ⚠ moved earlier — the usual Wednesday is a stat holiday (banks closed); run it this day." : "";

      // One 4-hour morning block for the day (lists who's due).
      if (!haveEvent.has(runDate)) {
        const names = entries.map((e) => e.client.name).join(", ");
        const [ev] = await db.insert(calendarEvents).values({
          userId, title: "Payroll run", description: `Run payroll: ${names}.${statNote}`,
          startDate: wallToUtc(runDate, BLOCK_START), endDate: wallToUtc(runDate, BLOCK_END),
          isAllDay: false, color: "#16a34a", status: "confirmed", isRecurring: true,
        } as any).returning();
        eventsAdded++;
        haveEvent.add(runDate);
        if (ev?.id) { try { await pushEventToGoogle(ev.id); } catch { /* best-effort */ } }
      }

      // One high-priority task per client due that day.
      const dueAt = wallToUtc(runDate, BLOCK_END); // due by end of the block (noon)
      for (const e of entries) {
        const k = `${e.client.id}|${runDate}`;
        if (haveTask.has(k)) continue;
        await db.insert(tasks).values({
          userId, clientId: e.client.id, title: `Run payroll — ${e.client.name}`,
          description: `Recurring payroll run.${statNote}`, dueDate: dueAt,
          priority: "high", status: "pending", category: "Payroll", isRecurring: true,
        } as any);
        tasksAdded++;
        haveTask.add(k);
      }
    }

    if (tasksAdded || eventsAdded || tasksRemoved) console.log(`[payroll-reminders] +${tasksAdded} tasks, +${eventsAdded} calendar blocks, -${tasksRemoved} stray tasks`);
    return { tasksAdded, eventsAdded, tasksRemoved, skipped: "" };
  } catch (err) {
    console.error("[payroll-reminders] failed:", err instanceof Error ? err.message : err);
  }
}
