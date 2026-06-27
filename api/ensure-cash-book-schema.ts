/**
 * CASH BOOK schema guard (self-healing, idempotent — runs on boot).
 * =============================================================================
 * Purpose:  Tables for the per-client cash book (micro-clients / holding cos that
 *           don't warrant a full QBO file). One account per bank/cash source; one
 *           row per money-in / money-out transaction.
 * Privacy:  Scoped by clientId at every query (per-client isolation, same as the
 *           rest of the CRM).
 * Outputs:  cash_book_accounts, cash_book_entries.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureCashBookSchema(): Promise<void> {
  const db = getDb();
  const guard = async (name: string, ddl: any) => {
    try { await db.run(ddl); } catch (e) { console.error(`[cashbook] ensure ${name} failed:`, e instanceof Error ? e.message : e); }
  };

  // One bank/cash account per row (a micro-client may have an operating + a holdco account).
  await guard("cash_book_accounts", sql`CREATE TABLE IF NOT EXISTS cash_book_accounts (
    id integer PRIMARY KEY AUTOINCREMENT,
    clientId integer NOT NULL,
    name text NOT NULL,                 -- "Operating chequing", "Holdco bank", "Petty cash"
    institution text,                   -- bank name (optional)
    openingBalance real NOT NULL DEFAULT 0,
    openingDate text,                   -- yyyy-mm-dd the opening balance is as of
    currency text DEFAULT 'CAD',
    fiscalYearEnd text,                 -- mm-dd, for the year-end summary (optional)
    statementBalance real,              -- latest bank-statement closing balance (for the rec)
    statementDate text,                 -- yyyy-mm-dd of that statement
    notes text,
    active integer NOT NULL DEFAULT 1,
    createdAt integer,
    updatedAt integer
  )`);

  // One transaction per row. amount is a POSITIVE magnitude; direction gives the sign.
  await guard("cash_book_entries", sql`CREATE TABLE IF NOT EXISTS cash_book_entries (
    id integer PRIMARY KEY AUTOINCREMENT,
    clientId integer NOT NULL,
    accountId integer NOT NULL,
    entryDate text NOT NULL,            -- yyyy-mm-dd
    direction text NOT NULL,            -- 'in' (deposit/receipt) | 'out' (payment)
    amount real NOT NULL,               -- positive magnitude
    category text,
    description text,
    reference text,                     -- cheque #, transfer id
    hst real,                           -- HST/GST portion of amount (optional)
    cleared integer NOT NULL DEFAULT 0, -- has it cleared the bank statement?
    source text DEFAULT 'manual',       -- manual | import
    createdAt integer,
    updatedAt integer
  )`);
  await guard("cash_book_entries_idx", sql`CREATE INDEX IF NOT EXISTS cash_book_entries_acct ON cash_book_entries (accountId, entryDate)`);
}
