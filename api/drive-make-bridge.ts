/**
 * FIGGY JR — GOOGLE DRIVE MAKE BRIDGE
 * =============================================================================
 * The CRM server has no Google credentials, so Drive calls route through Make's
 * generic Drive API proxy scenario (5342854 "figgy_drive_api"), the same pattern
 * as the QBO bridge. That scenario's interface is:
 *   input  { url (path under the Drive API base, e.g. "files"), method, body,
 *            qs_fields, qs_q }  →  google-drive:makeApiCall  →  { tool_output }
 *
 * Unlike the read-only QBO webhook proxies, folder creation is a WRITE, so this
 * goes through the authenticated scenario-RUN API (responsive) and needs
 * FIGGY_MAKE_API_TOKEN. If the token isn't set, callers no-op gracefully (Drive
 * auto-create simply doesn't run — it never blocks client creation).
 * =============================================================================
 */
const DEFAULT_RUN_URL = "https://us2.make.com/api/v2/scenarios/5342854/run";

export function driveRunUrl(): string {
  return process.env.FIGGY_DRIVE_SCENARIO_RUN_URL || DEFAULT_RUN_URL;
}
export function driveApiToken(): string {
  return process.env.FIGGY_MAKE_API_TOKEN || "";
}
export function driveConfigured(): boolean {
  return !!driveApiToken();
}

function unwrap(data: any): any {
  return data?.outputs?.tool_output?.body ?? data?.tool_output?.body ?? data?.body ?? data;
}

/** One Drive API call through the Make proxy. `path` is relative to the Drive API
 *  base (e.g. "files"). Returns the parsed Drive resource (object). */
export async function driveApi(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  opts: { body?: unknown; fields?: string; q?: string } = {},
): Promise<any> {
  if (!driveConfigured()) throw new Error("Drive bridge not configured: set FIGGY_MAKE_API_TOKEN");
  const bodyStr = opts.body == null ? "" : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  const res = await fetch(driveRunUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${driveApiToken()}` },
    body: JSON.stringify({
      responsive: true,
      data: { url: path, method, body: bodyStr, qs_fields: opts.fields || "", qs_q: opts.q || "" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive bridge ${method} ${path} failed: ${res.status} ${errText}`);
  }
  const out = unwrap(await res.json());
  // Make may return the body as a JSON string — parse if so.
  if (typeof out === "string") { try { return JSON.parse(out); } catch { return out; } }
  return out;
}

/** Create a Drive folder under `parentId`; returns { id, webViewLink }. */
export async function createDriveFolder(name: string, parentId: string): Promise<{ id: string; webViewLink: string }> {
  const r = await driveApi("files", "POST", {
    body: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id,webViewLink",
  });
  if (!r?.id) throw new Error(`Drive folder create returned no id: ${JSON.stringify(r).slice(0, 200)}`);
  return { id: String(r.id), webViewLink: String(r.webViewLink || `https://drive.google.com/drive/folders/${r.id}`) };
}

/** Find an existing folder by exact name under a parent (so we don't double-create). */
export async function findDriveFolder(name: string, parentId: string): Promise<{ id: string; webViewLink: string } | null> {
  const safe = name.replace(/'/g, "\\'");
  const q = `name = '${safe}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const r = await driveApi("files", "GET", { q, fields: "files(id,webViewLink)" });
  const f = r?.files?.[0];
  return f?.id ? { id: String(f.id), webViewLink: String(f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`) } : null;
}
