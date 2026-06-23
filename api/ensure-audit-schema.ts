/**
 * AGENT AUDIT LOG SCHEMA GUARD — idempotent, runs on boot.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureAuditSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS agent_audit_log (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      agentScope text DEFAULT 'all' NOT NULL,
      action text NOT NULL,
      summary text,
      amount real,
      decision text DEFAULT 'done' NOT NULL,
      clientId integer,
      createdAt integer
    )`);
  } catch (e) {
    console.error("[audit] ensure agent_audit_log failed:", e instanceof Error ? e.message : e);
  }
}
