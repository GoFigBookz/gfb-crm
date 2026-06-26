/**
 * FIGGY AI BRAIN — schema guard (idempotent, runs on boot).
 * =============================================================================
 * Two raw-SQL tables (kept raw, not Drizzle dialect-specific, so the SQLite→
 * Postgres move is a near-copy of the CREATE TABLE, no schema rewrite):
 *   - brain_records   : the knowledge — truth / source / memory layers, each
 *                       scope-tagged (client/firm/personal) for hard isolation.
 *   - brain_questions : the missing-info queue — what the brain DIDN'T know and
 *                       asked Markie. His answer becomes a new truth record.
 * Additive only; cannot affect existing features.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureBrainSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS brain_records (
      id text PRIMARY KEY,
      layer text NOT NULL DEFAULT 'truth',
      scopeKind text NOT NULL DEFAULT 'firm',
      clientId integer,
      userId integer,
      label text NOT NULL,
      text text NOT NULL,
      status text NOT NULL DEFAULT 'approved',
      category text,
      sourceLabels text,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[brain] ensure brain_records failed:", e instanceof Error ? e.message : e);
  }
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS brain_questions (
      id integer PRIMARY KEY AUTOINCREMENT,
      scopeKind text NOT NULL DEFAULT 'firm',
      clientId integer,
      userId integer,
      question text NOT NULL,
      category text,
      status text NOT NULL DEFAULT 'open',
      answer text,
      askedBy text DEFAULT 'liv',
      createdAt integer,
      answeredAt integer
    )`);
  } catch (e) {
    console.error("[brain] ensure brain_questions failed:", e instanceof Error ? e.message : e);
  }
}
