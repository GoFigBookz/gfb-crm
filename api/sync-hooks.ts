/**
 * SYNC HOOKS - Auto-push SQLite writes to Google Sheets
 * Import and call after every INSERT/UPDATE/DELETE in your routers.
 * 
 * These functions are fire-and-forget: they run in the background
 * and won't block or fail your main request.
 */

import { pushToSheets } from "./sheets-sync-bridge";

/**
 * Call after INSERT - pushes the new record to Sheets
 * Usage:
 *   const [record] = await db.insert(tasks).values({...}).returning();
 *   syncInsert("tasks", record);
 */
export function syncInsert(table: string, record: Record<string, any>) {
  if (!record || !record.id) return;
  // Fire and forget - don't await
  pushToSheets(table, record).catch(() => {});
}

/**
 * Call after UPDATE - pushes updated record to Sheets
 * Usage:
 *   await db.update(clients).set({name: "New Name"}).where(eq(clients.id, 1));
 *   syncUpdate("clients", { id: 1, name: "New Name" });
 */
export function syncUpdate(table: string, record: Record<string, any>) {
  if (!record || !record.id) return;
  pushToSheets(table, record).catch(() => {});
}

/**
 * Call after DELETE - removes the record from Sheets
 * Currently this just re-syncs the full table to remove the deleted row.
 * For large tables, consider marking as deleted instead.
 */
export function syncDelete(table: string, recordId: number) {
  // For deletes, we re-sync the table (simpler than finding/deleting specific rows)
  // In production with large tables, you'd want row-level deletion
  const { pushFullTable } = require("./sheets-sync-bridge");
  pushFullTable(table).catch(() => {});
}

/**
 * Batch sync - push multiple records at once
 */
export function syncBatch(table: string, records: Record<string, any>[]) {
  records.forEach(r => syncInsert(table, r));
}
