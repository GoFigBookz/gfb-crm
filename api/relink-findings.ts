/**
 * ONE-TIME RELINK — back-fills the company (clientId) on Triage findings created
 * before the intake stored `clientName`. Runs on every boot but is idempotent:
 * it only touches findings whose clientId is NULL, resolving each via:
 *   1) `clientName` already in sourceData (new-style findings), else
 *   2) the captured Review-Queue map (rowId -> client label), then
 *   3) the conservative name matcher (exact/contains/city — isolation-safe).
 * Never guesses: unmatched findings stay unlinked. Non-fatal on error.
 */
import { getDb } from "./queries/connection";
import { triageFindings } from "../db/schema";
import { eq, isNull } from "drizzle-orm";
import { matchClientIdByName } from "./client-match";
import { ROW_CLIENT_MAP } from "./relink-data";

export async function relinkFindings(): Promise<void> {
  try {
    const db = getDb();
    const rows = await db.select().from(triageFindings).where(isNull(triageFindings.clientId));
    if (rows.length === 0) return;
    let linked = 0;
    for (const f of rows) {
      try {
        let meta: any = {};
        let isJson = true;
        try { meta = JSON.parse(f.sourceData || "{}"); if (!meta || typeof meta !== "object") { meta = {}; isJson = false; } }
        catch { meta = {}; isJson = false; }
        const rowId = String(meta.rowId ?? (isJson ? "" : (f.sourceData || ""))).trim();
        const clientName: string = String(meta.clientName ?? "").trim() || (rowId ? (ROW_CLIENT_MAP[rowId] ?? "") : "");
        if (!clientName) continue;
        const clientId = await matchClientIdByName(clientName);
        if (!clientId) continue;
        const patch: Record<string, any> = { clientId };
        if (isJson && !meta.clientName) patch.sourceData = JSON.stringify({ ...meta, clientName });
        await db.update(triageFindings).set(patch).where(eq(triageFindings.id, f.id));
        linked++;
      } catch { /* per-finding best-effort */ }
    }
    if (linked) console.log(`[relink] linked ${linked} finding(s) to their client`);
  } catch (e) {
    console.error("[relink] failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
