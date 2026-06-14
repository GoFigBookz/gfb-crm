/**
 * FIGGY JR — CLIENT DEDUPE (one-off, idempotent, guarded)
 * =============================================================================
 * The clients table accumulated exact-duplicate rows (same name + company) —
 * ~3 copies of each company. This collapses each duplicate group to its
 * lowest-id "canonical" row:
 *   1) re-point EVERY table that has a `clientId` column from the duplicate ids
 *      to the canonical id (so nothing is orphaned — findings, connections,
 *      vendor memory, onboarding, tasks, etc.), then
 *   2) delete the duplicate client rows.
 *
 * SAFETY:
 *  - Dry-run by default: returns the plan + how many references each duplicate
 *    actually has. Only deletes when `confirm` is true.
 *  - "Duplicate" = identical normalized (name|company). The canonical kept row
 *    is the lowest id — which is exactly where the live QBO connections + matched
 *    findings already point, so connections are preserved.
 *  - Per-statement try/catch; a repoint that would violate a unique index is
 *    skipped and that duplicate is held back from deletion (reported), never
 *    silently orphaned.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

const norm = (s: any): string => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const asRows = (res: any): any[] => [...(res?.rows ?? res ?? [])];
const num = (res: any): number => Number(res?.rowsAffected ?? res?.changes ?? 0);

export async function dedupeClients(confirm: boolean) {
  const db = getDb();

  // 1) Group clients by normalized name|company; canonical = lowest id.
  const clientRows = asRows(await db.run(sql`SELECT id, name, company FROM clients ORDER BY id ASC`));
  const groups = new Map<string, number[]>();
  for (const r of clientRows) {
    const id = Number(r.id ?? r[0]);
    const key = `${norm(r.name ?? r[1])}|${norm(r.company ?? r[2])}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(id);
  }
  const mapping: Array<{ dupe: number; canonical: number }> = [];
  for (const ids of groups.values()) {
    ids.sort((a, b) => a - b);
    for (const d of ids.slice(1)) mapping.push({ dupe: d, canonical: ids[0] });
  }
  const dupeIds = mapping.map((m) => m.dupe);

  // 2) Discover every table that has a clientId column (so nothing is orphaned).
  const tableNames = asRows(await db.run(sql`SELECT name FROM sqlite_master WHERE type='table'`))
    .map((t: any) => String(t.name ?? t[0]));
  const refTables: string[] = [];
  for (const t of tableNames) {
    if (t === "clients" || t.startsWith("sqlite_")) continue;
    try {
      const cols = asRows(await db.run(sql.raw(`PRAGMA table_info("${t}")`))).map((c: any) => String(c.name ?? c[1]));
      if (cols.includes("clientId")) refTables.push(t);
    } catch { /* skip unreadable */ }
  }

  const report: any = {
    confirm, totalClients: clientRows.length, uniqueGroups: groups.size,
    keep: groups.size, duplicates: dupeIds.length, refTables,
    refCounts: {} as Record<string, number>, repointed: {} as Record<string, number>,
    held: [] as number[], deleted: 0,
  };

  // How many references each duplicate actually has (visibility before delete).
  if (dupeIds.length) {
    for (const t of refTables) {
      try {
        const c = asRows(await db.run(sql.raw(`SELECT COUNT(*) AS n FROM "${t}" WHERE "clientId" IN (${dupeIds.join(",")})`)))[0];
        report.refCounts[t] = Number(c?.n ?? c?.[0] ?? 0);
      } catch { report.refCounts[t] = -1; }
    }
  }

  if (!confirm || dupeIds.length === 0) return report; // dry run (or nothing to do)

  // 3) Re-point references dupe -> canonical. A failed repoint holds that dupe back.
  const held = new Set<number>();
  for (const t of refTables) {
    let cnt = 0;
    for (const m of mapping) {
      try {
        cnt += num(await db.run(sql.raw(`UPDATE "${t}" SET "clientId" = ${m.canonical} WHERE "clientId" = ${m.dupe}`)));
      } catch { held.add(m.dupe); }
    }
    report.repointed[t] = cnt;
  }

  // 4) Delete the duplicates that fully re-pointed.
  const toDelete = dupeIds.filter((id) => !held.has(id));
  report.held = [...held];
  if (toDelete.length) {
    await db.run(sql.raw(`DELETE FROM clients WHERE id IN (${toDelete.join(",")})`));
    report.deleted = toDelete.length;
  }
  return report;
}
