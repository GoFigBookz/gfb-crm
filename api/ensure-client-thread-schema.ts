/**
 * CLIENT TEAM THREAD schema guard (idempotent — runs on boot).
 * Per-client internal staff conversation. See clientThreadNotes.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureClientThreadSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS client_thread_notes (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      userId integer,
      authorName text,
      body text NOT NULL,
      isQuestion integer DEFAULT 0,
      resolved integer DEFAULT 0,
      createdAt integer
    )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS client_thread_client ON client_thread_notes (clientId, createdAt)`);
  } catch (e) {
    console.error("[client-thread] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}
