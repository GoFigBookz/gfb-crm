/**
 * BILLBACK → DRIVE — file the inter-company billback worksheet into BOTH clients'
 * Google Drive folders (e.g. Alderson AND Ovita Holdings), because the recharge
 * affects both entities (Markie 2026-06-26).
 * =============================================================================
 * Builds a branded HTML worksheet from the posted period's snapshot and uploads it
 * as a Google Doc into each client's `driveFolderUrl` folder, via the firm Google
 * account (scope auth/drive is granted). Read of the snapshot only — no QBO call.
 * Returns which folders it filed to + which were skipped (no folder set).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

const money = (n: number) => (Number(n) || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/** Pull a Drive folder id out of a stored folder URL (several shapes). */
function folderIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/([A-Za-z0-9_-]{25,})/);
  return m ? m[1] : null;
}

function worksheetHtml(ws: any): string {
  const rows = (ws.byAccount || []).map((a: any) =>
    `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${escapeHtml(a.accountName)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${money(a.net)}</td></tr>`).join("");
  const excluded = ws.excluded && ws.excluded.lines > 0
    ? `<p style="color:#666;font-size:12px">Excluded ${ws.excluded.lines} bank-charge line(s) (${money(ws.excluded.total)})${ws.excluded.accounts?.length ? ` — ${escapeHtml(ws.excluded.accounts.join(", "))}` : ""}. These are ${escapeHtml(ws.payerName)}'s own banking costs, not recharged.</p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <h1 style="font-size:18px">Inter-company billback — ${escapeHtml(ws.payerName)} → ${escapeHtml(ws.counterpartyName)}</h1>
  <p style="color:#666">${escapeHtml(ws.periodLabel || "")}${ws.periodStart ? ` (${ws.periodStart} → ${ws.periodEnd})` : ""}</p>
  <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px">
    <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ddd">Account</th><th style="text-align:right;padding:4px 8px;border-bottom:2px solid #ddd">Amount</th></tr></thead>
    <tbody>
      ${rows}
      <tr><td style="padding:4px 8px;font-weight:bold">Subtotal</td><td style="padding:4px 8px;text-align:right;font-weight:bold">${money(ws.subtotal)}</td></tr>
      ${ws.chargeHst ? `<tr><td style="padding:4px 8px;color:#666">HST (${ws.hstRatePct}%)</td><td style="padding:4px 8px;text-align:right">${money(ws.hst)}</td></tr>` : ""}
      <tr><td style="padding:6px 8px;font-weight:bold;border-top:2px solid #ddd">Total billed</td><td style="padding:6px 8px;text-align:right;font-weight:bold;border-top:2px solid #ddd">${money(ws.total)}</td></tr>
    </tbody>
  </table>
  ${excluded}
  <p style="font-size:13px">Invoice in ${escapeHtml(ws.payerName)}: <b>#${escapeHtml(ws.invoiceId || "—")}</b> &nbsp;·&nbsp; Bill in ${escapeHtml(ws.counterpartyName)}: <b>#${escapeHtml(ws.billId || "—")}</b></p>
  ${ws.zeroOut ? `<p style="font-size:12px;color:#666">The recharge credits ${escapeHtml(ws.payerName)}'s cost accounts so its expenses and HST net to zero for the period; ${escapeHtml(ws.counterpartyName)} carries the cost and claims the ITC.</p>` : ""}
  <p style="font-size:11px;color:#999">Generated ${new Date().toISOString().slice(0, 10)} · Go Fig Bookz</p>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Upload the HTML worksheet as a Google Doc into a folder. Returns the file's webViewLink. */
async function uploadDoc(token: string, folderId: string, name: string, html: string): Promise<{ id: string; url: string }> {
  const boundary = "figgybillback" + Math.abs(name.length * 7 + html.length).toString(36);
  const meta = { name, parents: [folderId], mimeType: "application/vnd.google-apps.document" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n` +
    `--${boundary}--`;
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  return { id: j.id, url: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
}

export type FileToDriveResult =
  | { ok: true; filed: { clientName: string; url: string }[]; skipped: string[] }
  | { ok: false; error: string; detail?: string };

/** File the billback worksheet for one posted period (log row) into BOTH clients' folders. */
export async function fileBillbackToDrive(logId: number): Promise<FileToDriveResult> {
  const db = getDb();
  const row = (await db.all(sql`SELECT * FROM interco_recharge_log WHERE id=${logId} LIMIT 1`))[0] as any;
  if (!row) return { ok: false, error: "period_not_found" };
  let ws: any = {};
  try { ws = row.worksheetJson ? JSON.parse(row.worksheetJson) : {}; } catch { ws = {}; }

  // Resolve both clients (payer + counterparty) for name + Drive folder.
  const ids = [row.payerClientId, row.counterpartyClientId].filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "no_clients_on_period" };
  const clientRows = (await db.all(sql`SELECT id, name, driveFolderUrl FROM clients WHERE id IN (${sql.join(ids, sql`, `)})`)) as any[];

  const { getFirmGoogleAccount, getValidGoogleAccessToken } = await import("./google-token");
  const acct = await getFirmGoogleAccount();
  if (!acct) return { ok: false, error: "google_not_connected", detail: "Connect the firm Google account (Integrations) to file to Drive." };
  let token: string;
  try { token = await getValidGoogleAccessToken(acct); }
  catch (e) { return { ok: false, error: "google_token_failed", detail: e instanceof Error ? e.message : String(e) }; }

  const html = worksheetHtml({ ...ws, payerName: ws.payerName || "Payer", counterpartyName: ws.counterpartyName || "Counterparty" });
  const periodTag = (ws.periodLabel || row.periodLabel || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "period";
  const baseName = `${(ws.payerName || "Billback")}_${periodTag}_Billback_GoFigBookz`.replace(/\s+/g, "-");

  const filed: { clientName: string; url: string }[] = [];
  const skipped: string[] = [];
  for (const c of clientRows) {
    const folderId = folderIdFromUrl(c.driveFolderUrl);
    if (!folderId) { skipped.push(`${c.name} (no Drive folder set)`); continue; }
    try {
      const f = await uploadDoc(token, folderId, baseName, html);
      filed.push({ clientName: c.name, url: f.url });
    } catch (e) {
      skipped.push(`${c.name} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  if (filed.length === 0) return { ok: false, error: "nothing_filed", detail: skipped.join("; ") };
  return { ok: true, filed, skipped };
}
