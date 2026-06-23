/**
 * AGENT LEARNINGS SCHEMA GUARD — idempotent, runs on boot.
 * Creates agent_learnings (the shared learning loop) on the live volume DB.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureLearningSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS agent_learnings (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      clientId integer,
      scope text DEFAULT 'all' NOT NULL,
      lesson text NOT NULL,
      tags text,
      source text DEFAULT 'markie',
      createdAt integer
    )`);
  } catch (e) {
    console.error("[learning] ensure agent_learnings failed:", e instanceof Error ? e.message : e);
  }
}
