/**
 * MONTH-END RECON TRACKER schema guard (idempotent — runs on boot).
 * One row per account in a client's month-end close. See clientReconAccounts.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureReconTrackerSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS client_recon_accounts (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      name text NOT NULL,
      kind text DEFAULT 'bank',
      institution text,
      last4 text,
      reconciledThrough text,
      needsStatements text,
      note text,
      source text DEFAULT 'manual',
      sortOrder integer DEFAULT 0,
      active integer DEFAULT 1,
      updatedAt integer
    )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS recon_accts_client ON client_recon_accounts (clientId)`);
  } catch (e) {
    console.error("[recon-tracker] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}
