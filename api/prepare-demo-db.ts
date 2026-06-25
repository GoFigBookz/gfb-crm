/**
 * DEMO DATABASE — prepare a SEPARATE, fully-fake dataset for "Try Demo Mode".
 * =============================================================================
 * Demo requests (x-demo-mode header) resolve to demo.db, never the real books, so
 * a friend can be handed the demo with ZERO risk of seeing real client data.
 *
 * This (1) clones the real DB's table/index STRUCTURE into demo.db (no data) so the
 * app's queries work identically, then (2) seeds an invented firm — fake clients,
 * payroll, a company group + control book, tasks — so every page lights up with
 * obviously-made-up names. Idempotent: structure clone runs once; seed runs once.
 * =============================================================================
 */
import { getRealDb, getDemoDb, runInDemo } from "./queries/connection";
import { sql, getTableColumns } from "drizzle-orm";
import {
  users, clients, employees, payRuns, payRunLines, tasks,
  groupEntities, groupOwnership, groupProfit, groupFamilyBenefit,
} from "../db/schema";
import { seedDemoData } from "./seed-demo-data";

const rowsOf = (res: any): any[] => (res?.rows ?? res ?? []) as any[];

/** Add any Drizzle-schema column a (cloned) demo table is missing — bulletproofs
 *  the demo seed against a stale source structure, independent of column guards. */
async function syncColumns(table: any, name: string): Promise<void> {
  const demo = getDemoDb();
  const info = rowsOf(await demo.run(sql.raw(`PRAGMA table_info(${name})`)));
  const have = new Set(info.map((r: any) => String(r.name ?? r[1])));
  for (const col of Object.values(getTableColumns(table)) as any[]) {
    if (have.has(col.name)) continue;
    const ct = String(col.columnType || "");
    const t = /Integer|Boolean|Timestamp/.test(ct) ? "integer" : /Real|Number/.test(ct) ? "real" : "text";
    try { await demo.run(sql.raw(`ALTER TABLE ${name} ADD COLUMN "${col.name}" ${t}`)); } catch { /* exists */ }
  }
}

const SEEDED_TABLES: Array<[any, string]> = [
  [users, "users"], [clients, "clients"], [employees, "employees"], [payRuns, "pay_runs"],
  [payRunLines, "pay_run_lines"], [tasks, "tasks"], [groupEntities, "group_entities"],
  [groupOwnership, "group_ownership"], [groupProfit, "group_profit"], [groupFamilyBenefit, "group_family_benefit"],
];

/** Copy every CREATE TABLE/INDEX from the real DB into demo.db (structure only). */
async function cloneStructure(): Promise<number> {
  const real = getRealDb();
  const demo = getDemoDb();
  // Tables first, then indexes (indexes depend on their table existing).
  const defs = rowsOf(await real.run(sql.raw(
    "SELECT type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
  )));
  let made = 0;
  for (const d of defs) {
    const stmt = String((d as any).sql ?? "");
    if (!stmt) continue;
    try { await demo.run(sql.raw(stmt)); made++; } catch { /* already exists — fine */ }
  }
  return made;
}

/** Ensure demo.db exists with structure + fake data. Safe to call every boot. */
export async function prepareDemoDb(): Promise<void> {
  try {
    await runInDemo(async () => {
      const demo = getDemoDb();
      // Has the demo DB been built yet? (clients table present?)
      const tbls = rowsOf(await demo.run(sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'")));
      if (!tbls.length) {
        const made = await cloneStructure();
        console.log(`[demo-db] cloned ${made} table/index definitions into demo.db`);
      }
      // Make sure the tables we seed exist + carry every column the schema defines
      // (the cloned source structure can be stale). Belt-and-suspenders create +
      // generic column sync — independent of the per-table column guards.
      const ec = await import("./ensure-clients-schema");
      await ec.ensurePayrollTables();
      const { ensureGroupBookTables } = await import("./ensure-group-book-schema");
      await ensureGroupBookTables();
      for (const [table, name] of SEEDED_TABLES) await syncColumns(table, name);
      await seedDemoData();
    });
  } catch (e) {
    console.error("[demo-db] prepare failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
