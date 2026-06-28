/**
 * FAX schema guard (self-healing, idempotent — runs on boot).
 * =============================================================================
 * Purpose:  Outbound fax log for the Send-a-Fax tool (CRA still requires faxes).
 *           One row per fax sent — auditable record of who/what/when, no file bytes.
 * Outputs:  faxes.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureFaxSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS faxes (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      clientId integer,
      toNumber text NOT NULL,
      toName text,
      subject text,
      fileName text,
      pages integer,
      provider text DEFAULT 'srfax',
      providerReference text,
      status text DEFAULT 'queued',
      errorMessage text,
      createdAt integer,
      sentAt integer
    )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS faxes_user_idx ON faxes (userId, createdAt)`);
  } catch (e) {
    console.error("[fax] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}
