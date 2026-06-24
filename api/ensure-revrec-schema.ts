/**
 * REVENUE RECOGNITION (WIP) SCHEMA GUARD — idempotent, runs on boot.
 * Creates the rr_* tables on the live persistent-volume DB so the module works
 * with zero manual migration. Per-client POC revenue recognition; nothing here
 * touches QBO. Mirrors ensure-personal-schema.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureRevRecSchema(): Promise<void> {
  const db = getDb();
  const statements: { name: string; sql: string }[] = [
    {
      name: "rr_projects",
      sql: `CREATE TABLE IF NOT EXISTS rr_projects (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        name text NOT NULL,
        customerJob text,
        contractValue real DEFAULT 0 NOT NULL,
        openingPct real DEFAULT 0,
        openingInvoiced real DEFAULT 0,
        startDate integer,
        expectedEndDate integer,
        status text DEFAULT 'active' NOT NULL,
        notes text,
        createdAt integer,
        updatedAt integer
      )`,
    },
    {
      name: "rr_progress",
      sql: `CREATE TABLE IF NOT EXISTS rr_progress (
        id integer PRIMARY KEY AUTOINCREMENT,
        projectId integer NOT NULL,
        clientId integer NOT NULL,
        periodKey text NOT NULL,
        pctComplete real DEFAULT 0 NOT NULL,
        invoicedToDate real,
        note text,
        enteredBy text,
        createdAt integer,
        updatedAt integer
      )`,
    },
    {
      name: "rr_je",
      sql: `CREATE TABLE IF NOT EXISTS rr_je (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        projectId integer NOT NULL,
        periodKey text NOT NULL,
        kind text NOT NULL,
        jeDate text NOT NULL,
        status text DEFAULT 'draft' NOT NULL,
        totalDebit real DEFAULT 0,
        totalCredit real DEFAULT 0,
        qboTxnId text,
        postedAt integer,
        postedBy integer,
        approvedAt integer,
        approvedBy integer,
        createdAt integer,
        updatedAt integer
      )`,
    },
    {
      name: "rr_je_lines",
      sql: `CREATE TABLE IF NOT EXISTS rr_je_lines (
        id integer PRIMARY KEY AUTOINCREMENT,
        jeId integer NOT NULL,
        accountKey text NOT NULL,
        qboAccountId text,
        debit real DEFAULT 0,
        credit real DEFAULT 0,
        customerJob text,
        memo text
      )`,
    },
    {
      name: "rr_account_map",
      sql: `CREATE TABLE IF NOT EXISTS rr_account_map (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        accountKey text NOT NULL,
        qboAccountId text,
        qboAccountName text,
        updatedAt integer
      )`,
    },
    {
      name: "rr_client_config",
      sql: `CREATE TABLE IF NOT EXISTS rr_client_config (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        enabled integer DEFAULT 1,
        fiscalYearStartMonth integer DEFAULT 1,
        depositsBookedToRevenue integer DEFAULT 0,
        pctSource text,
        pctEnteredByRole text,
        notes text,
        updatedAt integer
      )`,
    },
    {
      name: "rr_share_links",
      sql: `CREATE TABLE IF NOT EXISTS rr_share_links (
        id integer PRIMARY KEY AUTOINCREMENT,
        clientId integer NOT NULL,
        token text NOT NULL,
        label text,
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
      console.error(`[revrec] ensure ${s.name} failed:`, e instanceof Error ? e.message : e);
    }
  }
}
