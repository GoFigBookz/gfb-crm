/**
 * PERSONAL SPACE SCHEMA GUARD — idempotent, runs on boot.
 * Creates personal_items (Liv's walled-off personal space) on the live
 * persistent-volume DB. Mirrors ensure-rbac-schema. No clientId by design —
 * personal data NEVER mixes with client data.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensurePersonalSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS personal_items (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      kind text DEFAULT 'task' NOT NULL,
      title text NOT NULL,
      body text,
      dueDate integer,
      priority text DEFAULT 'medium' NOT NULL,
      done integer DEFAULT 0 NOT NULL,
      doneAt integer,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[personal] ensure personal_items table failed:", e instanceof Error ? e.message : e);
  }
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS personal_facts (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      category text DEFAULT 'misc' NOT NULL,
      fact text NOT NULL,
      tags text,
      pinned integer DEFAULT 0 NOT NULL,
      source text DEFAULT 'markie',
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[personal] ensure personal_facts table failed:", e instanceof Error ? e.message : e);
  }
}
