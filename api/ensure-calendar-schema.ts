/**
 * CALENDAR SCHEMA GUARD — idempotent, runs on boot.
 * The live calendar_events table predates several columns the current schema
 * inserts (taskId, outlookEventId, recurrence, color, meeting_link, isRecurring,
 * connectedAccountId, …). Drizzle's insert always lists ALL schema columns, so a
 * single missing column makes EVERY insert throw "no such column" — which is why
 * Google Calendar sync stored 0 events. This adds any missing columns.
 * Mirrors ensure-connectors-schema.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureCalendarSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS calendar_events (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      title text NOT NULL,
      startDate integer NOT NULL,
      endDate integer NOT NULL
    )`);
  } catch (e) {
    console.error("[calendar] ensure table failed:", e instanceof Error ? e.message : e);
  }
  try {
    const have = new Set<string>();
    const res: any = await db.run(sql`PRAGMA table_info(calendar_events)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    const cols: [string, string][] = [
      ["clientId", "integer"],
      ["connectedAccountId", "integer"],
      ["taskId", "integer"],
      ["googleEventId", "text"],
      ["outlookEventId", "text"],
      ["description", "text"],
      ["location", "text"],
      ["isAllDay", "integer DEFAULT 0 NOT NULL"],
      ["attendees", "text"],
      ["recurrence", "text"],
      ["color", "text"],
      ["meeting_link", "text"],
      ["isRecurring", "integer DEFAULT 0 NOT NULL"],
      ["status", "text DEFAULT 'confirmed' NOT NULL"],
      ["createdAt", "integer"],
      ["updatedAt", "integer"],
    ];
    for (const [name, type] of cols) {
      if (have.has(name)) continue;
      try { await db.run(sql.raw(`ALTER TABLE calendar_events ADD COLUMN "${name}" ${type}`)); console.log(`[calendar] added column: ${name}`); }
      catch (e) { console.error(`[calendar] add column ${name} failed:`, e instanceof Error ? e.message : e); }
    }
  } catch (e) {
    console.error("[calendar] ensure columns failed:", e instanceof Error ? e.message : e);
  }
}
