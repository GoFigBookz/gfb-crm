/**
 * Manual trigger for the bridge setup (Clark OS + Clark CW). The SAME logic runs
 * automatically on server startup (api/bridge-bootstrap.ts) — this script is just
 * for running it on demand. Links to EXISTING CRM clients (never creates one),
 * idempotent, no QBO writes.
 *
 *   FIGGY_MAKE_API_TOKEN=<make api token> \
 *   node --experimental-strip-types scripts/seed-clark-os-bridge.ts
 */
import { ensureBridgeReady } from "../api/bridge-bootstrap.ts";

if (!process.env.FIGGY_MAKE_API_TOKEN) {
  console.warn("FIGGY_MAKE_API_TOKEN not set — columns will be ensured but no bridge connection is created.");
}
ensureBridgeReady()
  .then(() => { console.log("Bridge bootstrap complete."); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
