/**
 * BACKUP CORE — pure, deterministic helpers for the Backup & Data system.
 * =============================================================================
 * Purpose:  Decide WHAT to back up, summarize a snapshot, prune old ones, and gate
 *           the once-a-day auto-snapshot. All the I/O (reading tables, writing rows)
 *           lives in backup-router/boot; this file is pure so it's fully testable.
 * Why:      Markie wants real backups of the LIVE data — "backup and data and all the
 *           good stuff" — not a stale 2024 seed. The client list (and everything else)
 *           gets snapshotted on a schedule + on demand, downloadable anytime.
 * =============================================================================
 */

/** Tables we never snapshot: auth/session churn + anything that's a rebuildable cache
 *  or a transient log. Everything else (the business data) is backed up. Matched by
 *  exact name OR suffix pattern so new cache/log tables are excluded by convention. */
export const BACKUP_DENYLIST = new Set<string>([
  "sessions", "session", "user_sessions", "auth_sessions",
  "_litestream_seq", "_litestream_lock",
]);
const DENY_SUFFIX = /(_cache|_log|_logs|_audit_log|_tmp|_temp)$/i;

export function selectBackupTables(allTables: string[], opts?: { extraDeny?: string[] }): string[] {
  const extra = new Set((opts?.extraDeny || []).map((s) => s.toLowerCase()));
  return allTables
    .filter((t) => t && !t.startsWith("sqlite_") && !t.startsWith("_cf_"))
    .filter((t) => !BACKUP_DENYLIST.has(t) && !extra.has(t.toLowerCase()) && !DENY_SUFFIX.test(t))
    .sort();
}

export interface BackupSnapshot {
  version: 1;
  createdAt: number;            // ms
  app: string;                  // build tag
  tables: Record<string, any[]>;
}

export interface BackupSummary { tableCount: number; totalRows: number; perTable: Record<string, number> }

/** Row counts per table + totals — stored alongside each snapshot for the UI. */
export function summarizeBackup(snapshot: Pick<BackupSnapshot, "tables">): BackupSummary {
  const perTable: Record<string, number> = {};
  let totalRows = 0;
  for (const [t, rows] of Object.entries(snapshot.tables || {})) {
    const n = Array.isArray(rows) ? rows.length : 0;
    perTable[t] = n;
    totalRows += n;
  }
  return { tableCount: Object.keys(perTable).length, totalRows, perTable };
}

/** Which snapshot ids to delete to keep only the newest `keep` (by createdAt desc). */
export function pruneSnapshots<T extends { id: number; createdAt: number }>(list: T[], keep: number): number[] {
  return [...list]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(Math.max(0, keep))
    .map((s) => s.id);
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10); // UTC yyyy-mm-dd

/** Auto-snapshot at most once per calendar day (UTC). True if none today yet. */
export function shouldAutoSnapshot(lastCreatedAtMs: number | null | undefined, nowMs: number): boolean {
  if (!lastCreatedAtMs) return true;
  return dayKey(lastCreatedAtMs) !== dayKey(nowMs);
}

/** Stable, sortable download filename for a manual export. */
export function backupFilename(nowMs: number): string {
  const d = new Date(nowMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `figgy-backup-${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}.json`;
}

/**
 * Compare a snapshot's per-table counts to the CURRENT counts — the restore preview,
 * so a restore is never a blind overwrite (golden rule: look before you overwrite).
 * Returns per-table { inBackup, current, delta } sorted by biggest change.
 */
export function restoreDiff(
  backupCounts: Record<string, number>,
  currentCounts: Record<string, number>,
): { table: string; inBackup: number; current: number; delta: number }[] {
  const tables = new Set([...Object.keys(backupCounts), ...Object.keys(currentCounts)]);
  return [...tables]
    .map((table) => {
      const inBackup = backupCounts[table] || 0;
      const current = currentCounts[table] || 0;
      return { table, inBackup, current, delta: inBackup - current };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.table.localeCompare(b.table));
}
