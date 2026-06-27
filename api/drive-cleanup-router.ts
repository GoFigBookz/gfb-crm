/**
 * DRIVE CLEANUP & DEDUP ROUTER — tidy a Google Drive (personal photos/videos or business).
 * =============================================================================
 * Reads file metadata from the Google Drive API (via an existing connected Google account
 * + its full `auth/drive` scope) and runs the dedup core. The only write is move-to-Trash
 * (REVERSIBLE — 30-day recovery), guarded so a duplicate-group KEEPER can never be trashed,
 * and audited. There is intentionally NO permanent-delete here.
 *
 * Account-aware: lists every connected Google account so you can target the business gofig
 * Drive OR your personal gmail (connect it in Integrations first). Read-mostly + safe.
 *
 * Inputs: accountId, kind filter (photos/videos/all), optional folderId, requested trash ids.
 * Outputs: scan summary, duplicate groups, biggest files; trash result (moved/blocked).
 * Errors: not-connected / token-expired / Drive API → a clear status, never a crash.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { connectedAccounts } from "../db/sqlite-schema";
import { and, eq } from "drizzle-orm";
import { getValidGoogleAccessToken } from "./google-token";
import { recordAudit } from "./agent-audit";
import { findDuplicates, biggestFiles, summarizeScan, safeTrashIds, kindOf, type DriveFile } from "./drive-cleanup-core";

const FIELDS = "nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime,createdTime,parents,thumbnailLink,webViewLink,trashed,ownedByMe)";

async function googleAccount(accountId: number) {
  const rows = await getDb().select().from(connectedAccounts)
    .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.provider, "google")));
  return rows[0] || null;
}

/** Page through Drive files matching the kind filter (capped so a huge Drive can't run away). */
async function listDriveFiles(token: string, kind: "all" | "image" | "video" | "media", folderId?: string, maxPages = 20): Promise<DriveFile[]> {
  const mimeClause =
    kind === "image" ? " and mimeType contains 'image/'" :
    kind === "video" ? " and mimeType contains 'video/'" :
    kind === "media" ? " and (mimeType contains 'image/' or mimeType contains 'video/')" : "";
  const folderClause = folderId ? ` and '${folderId}' in parents` : "";
  const q = `trashed = false${mimeClause}${folderClause}`;
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const params = new URLSearchParams({
      q, fields: FIELDS, pageSize: "1000", spaces: "drive",
      corpora: "user", orderBy: "modifiedTime",
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json() as { files?: any[]; nextPageToken?: string };
    for (const f of data.files ?? []) out.push({ ...f, size: f.size != null ? Number(f.size) : undefined });
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export const driveCleanupRouter = createRouter({
  /** Connected Google accounts you can clean (business gofig + any personal gmail). */
  accounts: staffQuery.query(async () => {
    const rows = await getDb().select().from(connectedAccounts).where(eq(connectedAccounts.provider, "google"));
    return rows.filter((a) => a.isActive).map((a) => ({ id: a.id, email: a.accountEmail, label: a.accountLabel }));
  }),

  /** Scan a Drive: duplicates (exact + possible), biggest files, totals by kind. Read-only. */
  scan: staffQuery
    .input(z.object({ accountId: z.number(), kind: z.enum(["all", "image", "video", "media"]).default("media"), folderId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const acct = await googleAccount(input.accountId);
      if (!acct) return { ok: false as const, error: "account_not_found" };
      let token: string;
      try { token = await getValidGoogleAccessToken(acct as any); }
      catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "token_error" }; }
      try {
        const files = await listDriveFiles(token, input.kind, input.folderId);
        const dup = findDuplicates(files);
        return {
          ok: true as const,
          email: acct.accountEmail,
          summary: summarizeScan(files, dup),
          groups: dup.groups.slice(0, 200).map((g) => ({
            key: g.key, kind: g.kind, exact: g.exact, size: g.size, reclaim: g.reclaim,
            keeper: { id: g.keeper.id, name: g.keeper.name, modifiedTime: g.keeper.modifiedTime, webViewLink: g.keeper.webViewLink, thumbnailLink: g.keeper.thumbnailLink },
            duplicates: g.duplicates.map((d) => ({ id: d.id, name: d.name, modifiedTime: d.modifiedTime, webViewLink: d.webViewLink, thumbnailLink: d.thumbnailLink })),
          })),
          biggest: biggestFiles(files, 25),
        };
      } catch (e) {
        return { ok: true as const, error: e instanceof Error ? e.message : String(e) };
      }
    }),

  /**
   * Move duplicate copies to Trash (REVERSIBLE — recoverable for 30 days). Re-scans first
   * and only trashes ids that are a duplicate (never a keeper) in the live Drive — so a
   * stale UI can't delete an original. Audited.
   */
  trashDuplicates: staffQuery
    .input(z.object({ accountId: z.number(), fileIds: z.array(z.string()).min(1).max(500), kind: z.enum(["all", "image", "video", "media"]).default("media") }))
    .mutation(async ({ input, ctx }) => {
      const acct = await googleAccount(input.accountId);
      if (!acct) return { ok: false as const, error: "account_not_found" };
      let token: string;
      try { token = await getValidGoogleAccessToken(acct as any); }
      catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "token_error" }; }

      // Re-scan and guard: only real duplicates may be trashed.
      const files = await listDriveFiles(token, input.kind);
      const { groups } = findDuplicates(files);
      const { allowed, blocked } = safeTrashIds(input.fileIds, groups);

      const trashed: string[] = [], failed: string[] = [];
      for (const id of allowed) {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id`, {
            method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ trashed: true }),
          });
          (res.ok ? trashed : failed).push(id);
        } catch { failed.push(id); }
      }
      await recordAudit({
        userId: ctx.user.id, agentScope: "liv", action: "drive_trash_duplicates",
        summary: `Moved ${trashed.length} duplicate file(s) to Trash on ${acct.accountEmail} (reversible). Blocked ${blocked.length} non-duplicate.`,
        decision: "done",
      });
      return { ok: true as const, trashed: trashed.length, failed: failed.length, blocked: blocked.length };
    }),
});
