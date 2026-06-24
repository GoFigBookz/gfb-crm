/**
 * BANKED HOURS SCHEMA GUARD — idempotent, runs on boot.
 * Creates banked_hour_entries + banked_hour_share_links on the live
 * persistent-volume DB so the banked-hours ledger works with zero manual
 * migration. Mirrors ensure-personal-schema.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureBankedHoursSchema(): Promise<void> {
  const db = getDb();
  const statements: { name: string; sql: string }[] = [
    {
      name: "banked_hour_entries",
      sql: `CREATE TABLE IF NOT EXISTS banked_hour_entries (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        employeeId integer NOT NULL,
        entryDate integer NOT NULL,
        hours real NOT NULL,
        kind text DEFAULT 'accrue' NOT NULL,
        note text,
        source text DEFAULT 'manual',
        payRunId integer,
        enteredBy text,
        createdAt integer,
        updatedAt integer
      )`,
    },
    {
      name: "banked_hour_share_links",
      sql: `CREATE TABLE IF NOT EXISTS banked_hour_share_links (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        token text NOT NULL,
        label text,
        allowEdit integer DEFAULT 1 NOT NULL,
        active integer DEFAULT 1 NOT NULL,
        createdBy integer,
        createdAt integer,
        revokedAt integer
      )`,
    },
  ];
  for (const s of statements) {
    try {
      await db.run(sql.raw(s.sql));
    } catch (e) {
      console.error(`[banked-hours] ensure ${s.name} failed:`, e instanceof Error ? e.message : e);
    }
  }
}
