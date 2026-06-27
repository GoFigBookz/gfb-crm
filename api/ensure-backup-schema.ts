/**
 * BACKUP schema guard — the table that stores point-in-time data snapshots.
 * Self-healing, idempotent (runs on boot). Payload is the full JSON snapshot of every
 * business table; summary is the per-table row counts for the UI.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureBackupSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS data_backups (
      id integer PRIMARY KEY AUTOINCREMENT,
      kind text NOT NULL DEFAULT 'auto',   -- auto | manual | pre_restore
      label text,
      app text,                            -- build tag at snapshot time
      tableCount integer DEFAULT 0,
      totalRows integer DEFAULT 0,
      summary text,                        -- JSON: per-table row counts
      payload text,                        -- JSON: { version, createdAt, app, tables:{name:[rows]} }
      createdBy integer,
      createdAt integer NOT NULL
    )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS data_backups_created ON data_backups (createdAt)`);
  } catch (e) {
    console.error("[backup] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}
