/**
 * LAUNCHPAD SCHEMA GUARD — idempotent, runs on boot.
 * Markie's new + launched business opportunities (his own ventures pipeline),
 * scoped to the owner like Phoenix Rising. Raw SQL → Postgres-portable.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureLaunchpadSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS launchpad_opportunities (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      name text NOT NULL,
      stage text NOT NULL DEFAULT 'idea',
      category text,
      notes text,
      nextStep text,
      potentialValue text,
      link text,
      pinned integer NOT NULL DEFAULT 0,
      archived integer NOT NULL DEFAULT 0,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[launchpad] ensure table failed:", e instanceof Error ? e.message : e);
  }
}
