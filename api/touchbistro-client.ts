/**
 * TOUCHBISTRO CLIENT — reads a restaurant's payroll WORKBOOK (Google Sheets) via
 * the connected Google account and AI-extracts the pay period's hours per
 * employee. TouchBistro has no usable API; these Sheets are the real data source.
 * Read-only. The payroll router matches the names to the roster and fills the run.
 */
import { getDb } from "./queries/connection";
import { connectedAccounts } from "../db/schema";
import { eq } from "drizzle-orm";
import { getValidGoogleAccessToken } from "./google-token";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Per-restaurant payroll workbook (Google Sheet IDs from Markie's Drive). */
export const TOUCHBISTRO_WORKBOOKS: { match: string; sheetId: string }[] = [
  { match: "sher", sheetId: "1BsiHTPaSnFhXZPwI_5YnLK32rdJhFOi6EWdCeujnPIo" }, // Sher-E-Punjab
  { match: "punjab", sheetId: "1BsiHTPaSnFhXZPwI_5YnLK32rdJhFOi6EWdCeujnPIo" },
  { match: "spot", sheetId: "1BXK_SxiogGbFSfz1jX1uekyUG9n02huEDXmbmNCX51I" },     // The Auld Spot / Old Spot
];

export function workbookFor(clientName: string): string | null {
  const n = (clientName || "").toLowerCase();
  return TOUCHBISTRO_WORKBOOKS.find((w) => n.includes(w.match))?.sheetId ?? null;
}

async function googleAccount(userId: number): Promise<any> {
  // FIRM-WIDE: one Google login for the practice; don't fail just because the
  // OAuth row is filed under a different staff-user than the caller.
  const { getFirmGoogleAccount } = await import("./google-token");
  return getFirmGoogleAccount(userId);
}

/** Read the workbook's tabs as tab-separated text (capped) via the Sheets API. */
async function readWorkbookText(userId: number, sheetId: string): Promise<string> {
  const acct = await googleAccount(userId);
  if (!acct) throw new Error("Google isn't connected. Connect it in Integrations (with Drive access) so I can read the TouchBistro sheet.");
  const token = await getValidGoogleAccessToken(acct);
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) {
    throw new Error(`Couldn't open the sheet (${metaRes.status}). Reconnect Google in Integrations with Drive access.`);
  }
  const meta = await metaRes.json();
  const titles: string[] = (meta.sheets || []).map((s: any) => s?.properties?.title).filter(Boolean).slice(0, 8);
  let out = "";
  for (const t of titles) {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(t)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) continue;
    const d = await r.json();
    const rows = (d.values || []) as string[][];
    out += `\n### TAB: ${t}\n` + rows.map((row) => row.join("\t")).join("\n");
    if (out.length > 60000) break;
  }
  return out.slice(0, 60000);
}

/** Pull a Drive folder ID out of a folder URL (or accept a bare ID). */
export function driveFolderId(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null;
  const s = String(urlOrId).trim();
  const m = s.match(/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s; // already an ID
  return null;
}

/**
 * Read the NEWEST timesheet file Markie dropped in a client's Drive folder and
 * return it as base64 + media type (so it runs through the SAME detailed parser
 * as an uploaded file → keeps the >10h missed-clock-out flag). This is the
 * "save the report to the folder, I import it" flow Markie likes. Read-only.
 *
 * Looks in the client's main folder AND any "Payroll"/"Timesheets"/"Hours"
 * subfolder (so saving it in the payroll subfolder just works), and prefers the
 * newest file whose name mentions a timesheet.
 */
async function listFolder(token: string, folderId: string): Promise<any[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime)");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=100&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Couldn't open the Drive folder (${res.status}). Reconnect Google in Integrations with Drive access.`);
  return (((await res.json()) as any).files || []) as any[];
}

export async function readNewestTimesheetFromDrive(
  userId: number, folderUrlOrId: string,
): Promise<{ data: string; mediaType: string; name: string }> {
  const folderId = driveFolderId(folderUrlOrId);
  if (!folderId) throw new Error("That client has no Google Drive folder linked — add the folder URL on the client card.");
  const acct = await googleAccount(userId);
  if (!acct) throw new Error("Google isn't connected. Connect it in Integrations (with Drive access) so I can read the timesheet from Drive.");
  const token = await getValidGoogleAccessToken(acct);

  const isFolder = (f: any) => f.mimeType === "application/vnd.google-apps.folder";
  // BFS the client's whole folder tree (Payroll often lives a couple levels deep,
  // e.g. <Client>/2 - Tax Filings/Payroll). Bounded so we never runaway-crawl.
  let files: any[] = [];
  let frontier = [folderId];
  const seen = new Set<string>([folderId]);
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier.slice(0, 60)) {
      let kids: any[] = [];
      try { kids = await listFolder(token, id); } catch { continue; }
      for (const k of kids) {
        if (isFolder(k)) { if (!seen.has(k.id)) { seen.add(k.id); next.push(k.id); } }
        else files.push(k);
      }
    }
    frontier = next;
  }

  const importable = (f: any) =>
    f.mimeType === "application/pdf" ||
    f.mimeType === "text/csv" || f.mimeType === "text/plain" ||
    (f.mimeType || "").startsWith("image/") ||
    f.mimeType === "application/vnd.google-apps.spreadsheet" ||
    f.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const candidates = files.filter(importable)
    .sort((a, b) => String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || "")));
  if (!candidates.length) throw new Error("No timesheet files found in that Drive folder (or its Payroll subfolder). Save the detailed timesheet (PDF or CSV) there first.");
  // Prefer the newest file whose name mentions a timesheet; else the newest importable file.
  const named = candidates.filter((f) => /time\s*sheet|timesheet|time card|hours/i.test(f.name || ""));
  const pick = (named[0] || candidates[0]);

  // Google-native sheets must be exported; everything else is downloaded as-is.
  if (pick.mimeType === "application/vnd.google-apps.spreadsheet") {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${pick.id}/export?mimeType=text/csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Couldn't read "${pick.name}" from Drive (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    return { data: buf.toString("base64"), mediaType: "text/csv", name: pick.name };
  }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${pick.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Couldn't read "${pick.name}" from Drive (${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  let mediaType = pick.mimeType || "application/octet-stream";
  if (mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") mediaType = "text/csv"; // best-effort; parser decodes text
  return { data: buf.toString("base64"), mediaType, name: pick.name };
}

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } }
  return null;
}

/** Extract each employee's total worked hours for the period from the workbook. */
export async function importTouchBistroHoursData(
  userId: number, clientName: string, periodStart: string, periodEnd: string,
): Promise<{ userName: string; hours: number }[]> {
  const sheetId = workbookFor(clientName);
  if (!sheetId) throw new Error(`No TouchBistro workbook is linked for "${clientName}".`);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY isn't set — needed to read the timesheet.");
  const text = await readWorkbookText(userId, sheetId);
  const model = process.env.FIGGY_CLASSIFY_MODEL || "claude-haiku-4-5";
  const system = "You extract payroll hours from a messy restaurant timesheet workbook. Return ONLY JSON, no prose.";
  const prompt =
    `Find the pay period covering ${periodStart} to ${periodEnd} (or the closest/most recent period if exact dates aren't present). ` +
    `Return ONLY: {"period":"<label>","employees":[{"name":"<as shown, e.g. Last, First>","hours":<number>}]}. ` +
    `Use each employee's TOTAL worked hours (regular + overtime) for that period. ` +
    `EXCLUDE rows marked "Not in Payroll", subtotal/total rows, and salaried staff. If hours are 0, include them with 0.\n\nWORKBOOK:\n${text}`;
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    throw new Error(`Couldn't read the timesheet (${res.status}). ${b.slice(0, 120)}`);
  }
  const data: any = await res.json();
  const txt = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const json = extractJson(txt);
  const emps = (json?.employees || []) as any[];
  return emps.filter((e) => e && e.name).map((e) => ({ userName: String(e.name), hours: Number(e.hours) || 0 }));
}
