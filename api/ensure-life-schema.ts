/**
 * MY LIFE HUB SCHEMA GUARD — idempotent, runs on boot.
 * Creates life_entries (Liv's walled-off life-OS). No clientId by design —
 * personal life data NEVER mixes with client/firm data.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureLifeSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS life_entries (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      section text NOT NULL,
      type text,
      title text NOT NULL,
      subtitle text,
      amount real,
      currency text DEFAULT 'CAD',
      date integer,
      status text,
      notes text,
      meta text,
      pinned integer DEFAULT 0,
      archived integer DEFAULT 0,
      sortOrder integer DEFAULT 0,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[life] ensure life_entries table failed:", e instanceof Error ? e.message : e);
  }
}
