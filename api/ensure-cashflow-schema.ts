/**
 * CASH-FLOW SNAPSHOT SCHEMA GUARD — idempotent, runs on boot.
 * Creates client_cash_snapshots (cash position / payroll coverage / to-post
 * hygiene per client per day) and back-fills any missing columns, so drizzle's
 * all-columns insert never throws on a drifted live table.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureCashflowSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS client_cash_snapshots (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      date text NOT NULL
    )`);
  } catch (e) {
    console.error("[cashflow] ensure table failed:", e instanceof Error ? e.message : e);
  }
  try {
    const have = new Set<string>();
    const res: any = await db.run(sql`PRAGMA table_info(client_cash_snapshots)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    const cols: [string, string][] = [
      ["connectionId", "integer"],
      ["cashTotal", "real DEFAULT 0"],
      ["cashCad", "real DEFAULT 0"],
      ["cashUsd", "real DEFAULT 0"],
      ["creditCardOwed", "real DEFAULT 0"],
      ["bankAccounts", "text"],
      ["arOutstanding", "real DEFAULT 0"],
      ["apOutstanding", "real DEFAULT 0"],
      ["uncategorizedBalance", "real DEFAULT 0"],
      ["uncategorizedCount", "integer DEFAULT 0"],
      ["staleFeedDays", "integer"],
      ["staleAccounts", "text"],
      ["upcomingPayrollAmount", "real"],
      ["upcomingPayrollDate", "integer"],
      ["coversPayroll", "integer"],
      ["payrollShortfall", "real"],
      ["createdAt", "integer"],
    ];
    for (const [name, type] of cols) {
      if (have.has(name)) continue;
      try { await db.run(sql.raw(`ALTER TABLE client_cash_snapshots ADD COLUMN "${name}" ${type}`)); console.log(`[cashflow] added column: ${name}`); }
      catch (e) { console.error(`[cashflow] add column ${name} failed:`, e instanceof Error ? e.message : e); }
    }
  } catch (e) {
    console.error("[cashflow] ensure columns failed:", e instanceof Error ? e.message : e);
  }
}
