/**
 * LOAN TRACKER SCHEMA GUARD — idempotent, runs on boot.
 * Creates loan_accounts + loan_entries + loan_share_links on the live
 * persistent-volume DB so the loan ledger works with zero manual migration.
 * Mirrors ensure-banked-hours-schema.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureLoanSchema(): Promise<void> {
  const db = getDb();
  const statements: { name: string; sql: string }[] = [
    {
      name: "loan_accounts",
      sql: `CREATE TABLE IF NOT EXISTS loan_accounts (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        name text NOT NULL,
        counterparty text,
        annualRatePct real,
        status text DEFAULT 'active' NOT NULL,
        note text,
        createdBy integer,
        createdAt integer,
        updatedAt integer
      )`,
    },
    {
      name: "loan_entries",
      sql: `CREATE TABLE IF NOT EXISTS loan_entries (
        id integer PRIMARY KEY AUTOINCREMENT,
        loanId integer NOT NULL,
        clientId integer NOT NULL,
        entryDate integer NOT NULL,
        amount real NOT NULL,
        kind text DEFAULT 'advance' NOT NULL,
        note text,
        source text DEFAULT 'manual',
        enteredBy text,
        createdAt integer,
        updatedAt integer
      )`,
    },
    {
      name: "loan_share_links",
      sql: `CREATE TABLE IF NOT EXISTS loan_share_links (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        token text NOT NULL,
        label text,
        allowEdit integer DEFAULT 0 NOT NULL,
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
      console.error(`[loan-tracker] ensure ${s.name} failed:`, e instanceof Error ? e.message : e);
    }
  }
}
