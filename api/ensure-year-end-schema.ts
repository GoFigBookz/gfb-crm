/**
 * YEAR-END REVIEW schema guard (idempotent — runs on boot).
 * Per-client year-end close + accountant package. See yearEndReviews / yearEndItems.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureYearEndSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS year_end_reviews (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      fiscalYear integer NOT NULL,
      fiscalYearEnd text,
      status text NOT NULL DEFAULT 'in_progress',
      accountantName text,
      accountantEmail text,
      notes text,
      startedAt integer,
      closedAt integer,
      packagedAt integer,
      createdAt integer,
      updatedAt integer
    )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS year_end_reviews_client ON year_end_reviews (clientId, fiscalYear)`);
    await db.run(sql`CREATE TABLE IF NOT EXISTS year_end_items (
      id integer PRIMARY KEY AUTOINCREMENT,
      reviewId integer NOT NULL,
      itemKey text NOT NULL,
      label text NOT NULL,
      phase text NOT NULL,
      done integer DEFAULT 0,
      na integer DEFAULT 0,
      note text,
      sortOrder integer DEFAULT 0,
      updatedAt integer
    )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS year_end_items_review ON year_end_items (reviewId, sortOrder)`);
  } catch (e) {
    console.error("[year-end] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}
