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
import { eq } from "drizzle-orm";
import { matchClientIdByName } from "./client-match";
import { ROW_CLIENT_MAP } from "./relink-data";

/** Email-only invoices (no attachment existed) that Figgy snapshotted into Drive
 *  docs on 2026-06-11 so the card's "View receipt" opens a real document.
 *  rowId -> Drive file id. One-time back-fill for findings created before. */
const ROW_DRIVE_MAP: Record<string, string> = {
  "2026-06-09T19:56:13.463Z": "1YzoK3b56gEoYkEBpz9Y-ssMChCWKf_0Kq_4SI9W9n-k", // Farrow #000774 $1,950 Jun 1
  "2026-06-09T21:40:09.386Z": "1B_B7m2j6vFOQkYr1OXjdYBZ6YAXlHMbBpqsQTcGrwak", // Farrow #000742 $1,485 May 21
  "2026-06-09T21:40:16.110Z": "1s-bASMEKZdNDAlEjVbJcuG6Kg8Ojh-tM-AtEPougsFo", // Farrow #000764 $1,995 May 28
  "2026-06-09T22:05:33.215Z": "1s-bASMEKZdNDAlEjVbJcuG6Kg8Ojh-tM-AtEPougsFo", // duplicate of #000764 — same doc
};

export async function relinkFindings(): Promise<void> {
  try {
    const db = getDb();
    const rows = await db.select().from(triageFindings);
    let linked = 0, receipted = 0;
    for (const f of rows) {
      try {
        let meta: any = {};
        let isJson = true;
        try { meta = JSON.parse(f.sourceData || "{}"); if (!meta || typeof meta !== "object") { meta = {}; isJson = false; } }
        catch { meta = {}; isJson = false; }
        const rowId = String(meta.rowId ?? (isJson ? "" : (f.sourceData || ""))).trim();
        const patch: Record<string, any> = {};
        let newMeta = meta;

        // 1) Company link (only when missing)
        if (!f.clientId) {
          const clientName: string = String(meta.clientName ?? "").trim() || (rowId ? (ROW_CLIENT_MAP[rowId] ?? "") : "");
          if (clientName) {
            const clientId = await matchClientIdByName(clientName);
            if (clientId) {
              patch.clientId = clientId;
              if (isJson && !meta.clientName) newMeta = { ...newMeta, clientName };
              linked++;
            }
          }
        }

        // 2) Receipt link for email-only invoices we snapshotted into Drive
        if (isJson && rowId && !meta.driveFileId && ROW_DRIVE_MAP[rowId]) {
          newMeta = { ...newMeta, driveFileId: ROW_DRIVE_MAP[rowId] };
          receipted++;
        }

        if (newMeta !== meta) patch.sourceData = JSON.stringify(newMeta);
        if (Object.keys(patch).length) await db.update(triageFindings).set(patch).where(eq(triageFindings.id, f.id));
      } catch { /* per-finding best-effort */ }
    }
    if (linked || receipted) console.log(`[relink] linked ${linked} client(s), attached ${receipted} receipt snapshot(s)`);
  } catch (e) {
    console.error("[relink] failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
