/**
 * EMPLOYEE RATE-HISTORY SCHEMA GUARD — idempotent, runs on boot.
 * Creates employee_rate_history (raises tracked by effective date) so drizzle's
 * all-columns insert never throws on a drifted live table.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureRateHistorySchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS employee_rate_history (
      id integer PRIMARY KEY AUTOINCREMENT,
      employeeId integer NOT NULL,
      effectiveDate integer NOT NULL
    )`);
  } catch (e) {
    console.error("[rate-history] ensure table failed:", e instanceof Error ? e.message : e);
  }
  try {
    const have = new Set<string>();
    const res: any = await db.run(sql`PRAGMA table_info(employee_rate_history)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    const cols: [string, string][] = [
      ["clientId", "integer"],
      ["payType", "text"],
      ["hourlyRate", "real"],
      ["annualSalary", "real"],
      ["note", "text"],
      ["source", "text"],
      ["createdAt", "integer"],
    ];
    for (const [name, type] of cols) {
      if (have.has(name)) continue;
      try { await db.run(sql.raw(`ALTER TABLE employee_rate_history ADD COLUMN "${name}" ${type}`)); console.log(`[rate-history] added column: ${name}`); }
      catch (e) { console.error(`[rate-history] add column ${name} failed:`, e instanceof Error ? e.message : e); }
    }
  } catch (e) {
    console.error("[rate-history] ensure columns failed:", e instanceof Error ? e.message : e);
  }
}
