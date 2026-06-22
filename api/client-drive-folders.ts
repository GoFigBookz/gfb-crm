/**
 * FIGGY JR — CLIENT DRIVE FOLDER PROVISIONING
 * =============================================================================
 * Auto-creates a client's standard Google Drive folder tree under the HARDCODED
 * "GFB Clients" parent (never the root), mirroring the firm's existing structure
 * (see docs/RECEIPT_WORKFLOW.md). Idempotent: skips if the client already has a
 * driveFolderUrl, and reuses an existing "Finance - <Client>" folder if one is
 * already there. Routes through the Make Drive bridge; no-ops (without error) if
 * FIGGY_MAKE_API_TOKEN isn't set, so it never blocks client creation.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq } from "drizzle-orm";
import { GFB_CLIENTS_PARENT_FOLDER_ID } from "./link-drive-folders";
import { driveConfigured, createDriveFolder, findDriveFolder } from "./drive-make-bridge";

/** Standard subfolder tree (name → child names). Tax Filings children are
 *  country-aware (US has no HST/WSIB; files state Sales Tax instead). */
function subfolderTree(isUS: boolean): { name: string; children?: string[] }[] {
  const taxChildren = isUS
    ? ["Sales Tax", "Payroll", "Dividends", "Corp Tax"]
    : ["HST", "Payroll", "WSIB", "Dividends", "Corp Tax"];
  return [
    { name: "1 - Company Documentation", children: ["Engagement Letters & Legal"] },
    { name: "2 - Tax Filings", children: taxChildren },
    { name: "3 - Year-End Financials", children: ["01 - Financials (our work)", "02 - Accountant (adjusting entries)"] },
    { name: "4 - Statements" },
    { name: "5 - Triage" },
    { name: "6 - Vendors" },
    { name: "7 - Customers" },
    { name: "ARCHIVE (pre-2020)" },
  ];
}

export type DriveProvisionResult =
  | { ok: true; created: boolean; url: string; folderId: string }
  | { ok: false; skipped: "already_has_folder" | "not_configured"; url?: string }
  | { ok: false; error: string };

/**
 * Ensure the client has its Drive folder tree. `force` recreates even if a URL is
 * already set (used by the manual "Create Drive folder" button when the existing
 * link is wrong/empty).
 */
export async function ensureClientDriveFolder(clientId: number, opts: { force?: boolean } = {}): Promise<DriveProvisionResult> {
  const db = getDb();
  const c = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
  if (!c) return { ok: false, error: "client_not_found" };
  if (c.driveFolderUrl && !opts.force) return { ok: false, skipped: "already_has_folder", url: c.driveFolderUrl };
  if (!driveConfigured()) return { ok: false, skipped: "not_configured" };

  const isUS = (c.country || (c.qboAccountType === "us_clients" ? "US" : "CA")) === "US";
  const topName = `Finance - ${c.name}`;
  try {
    // Reuse an existing top folder if present (idempotent), else create it.
    let top = await findDriveFolder(topName, GFB_CLIENTS_PARENT_FOLDER_ID).catch(() => null);
    const created = !top;
    if (!top) top = await createDriveFolder(topName, GFB_CLIENTS_PARENT_FOLDER_ID);

    // Build the standard subfolders (best-effort — one failure doesn't abort the rest).
    for (const sub of subfolderTree(isUS)) {
      try {
        const existing = await findDriveFolder(sub.name, top.id).catch(() => null);
        const node = existing || (await createDriveFolder(sub.name, top.id));
        for (const child of sub.children || []) {
          try {
            const ce = await findDriveFolder(child, node.id).catch(() => null);
            if (!ce) await createDriveFolder(child, node.id);
          } catch (e) { console.error(`[drive] child folder "${child}" failed:`, e instanceof Error ? e.message : e); }
        }
      } catch (e) { console.error(`[drive] subfolder "${sub.name}" failed:`, e instanceof Error ? e.message : e); }
    }

    await db.update(clients).set({ driveFolderUrl: top.webViewLink, updatedAt: new Date() }).where(eq(clients.id, clientId));
    return { ok: true, created, url: top.webViewLink, folderId: top.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
