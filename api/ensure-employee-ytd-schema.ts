/**
 * EMPLOYEE YTD CARRY-FORWARD SCHEMA GUARD — idempotent, runs on boot.
 * Adds the year-to-date carry-forward columns (CPP/EI/tax + as-of date + source)
 * to the employees table so drizzle's all-columns insert never throws on a
 * drifted live table. ytdGrossOpening already exists.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureEmployeeYtdColumns(): Promise<void> {
  const db = getDb();
  try {
    const have = new Set<string>();
    const res: any = await db.run(sql`PRAGMA table_info(employees)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    const cols: [string, string][] = [
      ["ytdCppOpening", "real"],
      ["ytdEiOpening", "real"],
      ["ytdTaxOpening", "real"],
      ["ytdAsOf", "integer"],
      ["ytdSource", "text"],
    ];
    for (const [name, type] of cols) {
      if (have.has(name)) continue;
      try { await db.run(sql.raw(`ALTER TABLE employees ADD COLUMN "${name}" ${type}`)); console.log(`[employee-ytd] added column: ${name}`); }
      catch (e) { console.error(`[employee-ytd] add column ${name} failed:`, e instanceof Error ? e.message : e); }
    }
  } catch (e) {
    console.error("[employee-ytd] ensure columns failed:", e instanceof Error ? e.message : e);
  }
}
