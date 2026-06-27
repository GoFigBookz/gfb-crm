/**
 * BACKUP ROUTER — live data snapshots, full export, and guarded restore.
 * =============================================================================
 * - snapshotNow / autoSnapshotIfDue: capture every business table to a JSON row.
 * - list / status: what backups exist + when the last one ran (for the UI).
 * - download: the full JSON of one snapshot (Markie saves it off-box = real backup).
 * - restorePreview / restoreFrom: compare a backup to live, then (admin) restore
 *   selected tables — taking a SAFETY snapshot first, never a blind overwrite.
 * Boundary: read paths are senior+; snapshot is senior+; restore is ADMIN ONLY.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, seniorQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import {
  selectBackupTables, summarizeBackup, pruneSnapshots, shouldAutoSnapshot,
  restoreDiff, type BackupSnapshot,
} from "./backup-core";

const KEEP = Number(process.env.FIGGY_BACKUP_KEEP || 20);

async function listTableNames(): Promise<string[]> {
  const rows = (await getDb().all(sql`SELECT name FROM sqlite_master WHERE type='table'`)) as any[];
  return selectBackupTables(rows.map((r) => String(r.name)));
}

/** Real columns of a table (used to filter snapshot rows on restore — no drift/injection). */
async function tableColumns(table: string): Promise<string[]> {
  const rows = (await getDb().all(sql.raw(`PRAGMA table_info("${table.replace(/"/g, "")}")`))) as any[];
  return rows.map((r) => String(r.name));
}

async function currentCounts(tables: string[]): Promise<Record<string, number>> {
  const db = getDb(); const out: Record<string, number> = {};
  for (const t of tables) {
    try { const r = (await db.all(sql.raw(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, "")}"`))) as any[]; out[t] = Number(r[0]?.n || 0); }
    catch { out[t] = 0; }
  }
  return out;
}

/** Capture every business table into a snapshot row. Returns the new backup id + summary. */
export async function takeSnapshot(opts: { kind: "auto" | "manual" | "pre_restore"; label?: string; createdBy?: number }): Promise<{ id: number; tableCount: number; totalRows: number }> {
  const db = getDb();
  const tables = await listTableNames();
  const snapshot: BackupSnapshot = { version: 1, createdAt: Date.now(), app: process.env.BUILD_TAG || "figgy", tables: {} };
  for (const t of tables) {
    try { snapshot.tables[t] = (await db.all(sql.raw(`SELECT * FROM "${t.replace(/"/g, "")}"`))) as any[]; }
    catch (e) { console.error(`[backup] read ${t} failed:`, e instanceof Error ? e.message : e); snapshot.tables[t] = []; }
  }
  const summary = summarizeBackup(snapshot);
  const now = Date.now();
  await db.run(sql`INSERT INTO data_backups (kind, label, app, tableCount, totalRows, summary, payload, createdBy, createdAt)
    VALUES (${opts.kind}, ${opts.label ?? null}, ${snapshot.app}, ${summary.tableCount}, ${summary.totalRows},
    ${JSON.stringify(summary.perTable)}, ${JSON.stringify(snapshot)}, ${opts.createdBy ?? null}, ${now})`);
  const row = ((await db.all(sql`SELECT id FROM data_backups ORDER BY id DESC LIMIT 1`)) as any[])[0];

  // Prune to the newest KEEP (keep manual ones — they were deliberate).
  try {
    const all = (await db.all(sql`SELECT id, createdAt FROM data_backups WHERE kind != 'manual'`)) as any[];
    const drop = pruneSnapshots(all.map((r) => ({ id: Number(r.id), createdAt: Number(r.createdAt) })), KEEP);
    for (const id of drop) await db.run(sql`DELETE FROM data_backups WHERE id=${id}`);
  } catch { /* prune is best-effort */ }

  return { id: Number(row?.id), tableCount: summary.tableCount, totalRows: summary.totalRows };
}

/** Boot hook: take an auto snapshot if none happened today (UTC). */
export async function autoSnapshotIfDue(): Promise<void> {
  try {
    const db = getDb();
    const last = ((await db.all(sql`SELECT createdAt FROM data_backups ORDER BY createdAt DESC LIMIT 1`)) as any[])[0];
    if (shouldAutoSnapshot(last ? Number(last.createdAt) : null, Date.now())) {
      const r = await takeSnapshot({ kind: "auto", label: "Daily automatic backup" });
      console.log(`[backup] auto snapshot #${r.id}: ${r.tableCount} tables, ${r.totalRows} rows`);
    }
  } catch (e) { console.error("[backup] autoSnapshotIfDue failed:", e instanceof Error ? e.message : e); }
}

export const backupRouter = createRouter({
  status: seniorQuery.query(async () => {
    const db = getDb();
    const last = ((await db.all(sql`SELECT id, kind, totalRows, tableCount, createdAt FROM data_backups ORDER BY createdAt DESC LIMIT 1`)) as any[])[0] || null;
    const total = ((await db.all(sql`SELECT COUNT(*) AS n FROM data_backups`)) as any[])[0]?.n || 0;
    return { last, count: Number(total), keep: KEEP };
  }),

  list: seniorQuery.query(async () => {
    return (await getDb().all(sql`SELECT id, kind, label, app, tableCount, totalRows, createdAt FROM data_backups ORDER BY createdAt DESC LIMIT 100`)) as any[];
  }),

  snapshotNow: seniorQuery.input(z.object({ label: z.string().max(120).optional() }).optional()).mutation(async ({ ctx, input }) => {
    return takeSnapshot({ kind: "manual", label: input?.label || "Manual backup", createdBy: ctx.user.id });
  }),

  /** The full snapshot JSON for download (front-end turns it into a file). */
  download: seniorQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const row = ((await getDb().all(sql`SELECT payload, createdAt FROM data_backups WHERE id=${input.id} LIMIT 1`)) as any[])[0];
    if (!row) return null;
    return { createdAt: Number(row.createdAt), payload: row.payload as string };
  }),

  remove: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await getDb().run(sql`DELETE FROM data_backups WHERE id=${input.id}`); return { ok: true as const };
  }),

  /** Compare a backup to the live data — never restore blind. */
  restorePreview: seniorQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const row = ((await getDb().all(sql`SELECT summary, createdAt FROM data_backups WHERE id=${input.id} LIMIT 1`)) as any[])[0];
    if (!row) return null;
    const backupCounts = JSON.parse(row.summary || "{}") as Record<string, number>;
    const current = await currentCounts(Object.keys(backupCounts));
    return { createdAt: Number(row.createdAt), diff: restoreDiff(backupCounts, current) };
  }),

  /**
   * Restore SELECTED tables from a snapshot (ADMIN). Takes a safety snapshot first,
   * then for each chosen table: DELETE all rows + re-insert the backup rows, filtered
   * to the table's real columns. Per-table txn-ish; one bad table doesn't abort the rest.
   */
  restoreFrom: adminQuery.input(z.object({ id: z.number(), tables: z.array(z.string()).min(1).max(200) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const row = ((await db.all(sql`SELECT payload FROM data_backups WHERE id=${input.id} LIMIT 1`)) as any[])[0];
    if (!row) return { ok: false as const, error: "backup_not_found" };
    const snap = JSON.parse(row.payload) as BackupSnapshot;

    // Safety net: snapshot the CURRENT state before we overwrite anything.
    await takeSnapshot({ kind: "pre_restore", label: `Auto safety backup before restoring #${input.id}`, createdBy: ctx.user.id });

    const restored: { table: string; rows: number }[] = [];
    const errors: { table: string; error: string }[] = [];
    for (const t of input.tables) {
      const rows = (snap.tables || {})[t];
      if (!Array.isArray(rows)) { errors.push({ table: t, error: "not_in_backup" }); continue; }
      const safe = t.replace(/"/g, "");
      try {
        const cols = new Set(await tableColumns(safe));
        if (!cols.size) { errors.push({ table: t, error: "table_missing" }); continue; }
        await db.run(sql.raw(`DELETE FROM "${safe}"`));
        for (const r of rows) {
          const keys = Object.keys(r).filter((k) => cols.has(k));
          if (!keys.length) continue;
          // Column/table names are whitelisted (pragma + sqlite_master) so raw text is
          // safe; VALUES are bound params via sql`${v}` to prevent injection.
          const colList = keys.map((k) => `"${k.replace(/"/g, "")}"`).join(", ");
          const valueChunks = keys.map((k) => sql`${(r as any)[k] ?? null}`);
          await db.run(sql`INSERT INTO ${sql.raw(`"${safe}" (${colList})`)} VALUES (${sql.join(valueChunks, sql`, `)})`);
        }
        restored.push({ table: t, rows: rows.length });
      } catch (e) { errors.push({ table: t, error: e instanceof Error ? e.message : String(e) }); }
    }
    return { ok: true as const, restored, errors };
  }),
});
