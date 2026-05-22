import { startSyncScheduler as startQBOSyncScheduler } from "./sync-scheduler";
import { syncAllGoogleAccounts } from "./google-sync";

let googleSyncRunning = false;

export function startAllSchedulers() {
  // Start QBO scheduler
  startQBOSyncScheduler();

  // Start Google sync scheduler
  if (googleSyncRunning) return;
  googleSyncRunning = true;

  console.log("[GOOGLE SYNC] Auto-sync scheduler started");

  // Every 30 minutes: sync all connected Google accounts
  const THIRTY_MINUTES = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      await runGoogleSync();
    } catch (err) {
      console.error("[GOOGLE SYNC] Auto-sync failed:", err);
    }
  }, THIRTY_MINUTES);

  // Run once immediately on startup (after 60s delay)
  setTimeout(() => {
    runGoogleSync().catch((err) => console.error("[GOOGLE SYNC] Initial sync failed:", err));
  }, 60000);
}

async function runGoogleSync() {
  console.log("[GOOGLE SYNC] Starting sync for all Google accounts");
  try {
    const results = await syncAllGoogleAccounts();
    for (const { accountId, result } of results) {
      const total = result.emailsAdded + result.eventsAdded + result.tasksAdded;
      if (total > 0) {
        console.log(`[GOOGLE SYNC] Account ${accountId}: +${result.emailsAdded} emails, +${result.eventsAdded} events, +${result.tasksAdded} tasks`);
      }
      if (result.errors.length > 0) {
        console.error(`[GOOGLE SYNC] Account ${accountId} errors:`, result.errors);
      }
    }
  } catch (err) {
    console.error("[GOOGLE SYNC] Failed:", err);
  }
}

export function getSchedulerStatus() {
  return {
    qbo: { running: true },
    google: { running: googleSyncRunning, intervalMs: 30 * 60 * 1000 },
  };
}
