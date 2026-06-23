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
  const db = getDb();
  // Select only core columns (avoids any live schema-drift "no such column" error)
  // and don't filter by provider in SQL — filter in JS — so an enum/value quirk
  // can't break the query. We just need a Google account with a token.
  const accts = (await db.select({
    id: connectedAccounts.id,
    provider: connectedAccounts.provider,
    accessToken: connectedAccounts.accessToken,
    refreshToken: connectedAccounts.refreshToken,
    expiresAt: connectedAccounts.expiresAt,
    accountEmail: connectedAccounts.accountEmail,
    isActive: connectedAccounts.isActive,
  }).from(connectedAccounts).where(eq(connectedAccounts.userId, userId))) as any[];
  const google = accts.filter((a) => a.provider === "google");
  return google.find((a) => a.isActive && a.refreshToken) || google.find((a) => a.refreshToken) || google.find((a) => a.isActive) || google[0] || null;
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
