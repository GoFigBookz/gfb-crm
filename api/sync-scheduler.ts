/**
 * SYNC SCHEDULER
 * Runs automatic QBO sync on a schedule.
 * Also triggers agent finding refreshes and dashboard updates.
 */
let schedulerRunning = false;

// DAILY, not hourly: each sync run issues a handful of read-only Make calls per
// connection. Daily keeps us well under the Make Core ops cap while month-end
// data (which changes slowly) stays fresh. The dashboards read the cached
// snapshot, never live QBO.
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startSyncScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  console.log("[SYNC] Auto-sync scheduler started (daily)");

  setInterval(() => {
    runAutoSync().catch((err) => console.error("[SYNC] Auto-sync failed:", err));
  }, SYNC_INTERVAL_MS);

  // Run once shortly after startup (after 45s delay so boot/seeds settle).
  setTimeout(() => {
    runAutoSync().catch((err) => console.error("[SYNC] Initial sync failed:", err));
  }, 45000);
}

async function runAutoSync() {
  // The real pull: per-connection entity sync + cached per-client financial
  // snapshot (api/qbo-snapshot.ts). Isolated + best-effort per connection.
  const { runQboSync } = await import("./qbo-snapshot");
  const r = await runQboSync();
  if (r.ran) {
    const ok = r.results.filter((x) => x.ok).length;
    console.log(`[SYNC] QBO pull complete: ${ok}/${r.connections} connections ok`);
  }
}

export function getSchedulerStatus() {
  return { running: schedulerRunning, intervalMs: SYNC_INTERVAL_MS };
}
