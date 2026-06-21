/**
 * FIGGY JR — MASTER SHEET SYNC (CRM → canonical Google master, outbound)
 * =============================================================================
 * Markie's requirement (2026-06-21): the Google Sheet is the crash-safe mirror —
 * "the back end of the Google Sheets must always match what we're building here."
 * On every client onboard/edit the CRM UPSERTS that client's row into the ONE
 * canonical "Client Master" tab so the sheet always reflects the CRM.
 *
 * CANONICAL MASTER (Markie chose this, 2026-06-21):
 *   sheet 1pcAw-WSQXXnVn-0L-TQ2FIExkHQ0Olf4dzz47t0gTUk
 *   tab "Client Master" (active) + tab "Inactive Clients".
 *   25 columns A..Y — see COLS below.
 *
 * TRANSPORT (same zero-touch pattern as the QBO bridge): a committed Make WEBHOOK
 * capability URL proxies a flat {url, method, body} to the Google Sheets v4 API
 * (scenario 5453235 "FIGGY Master Sheet Sync (webhook)", Google conn 9040573).
 * No token / env var needed → go-live is automatic on deploy. The server can't
 * reach Google directly (egress allowlist); Make holds the authorized connection.
 * Opt out with FIGGY_SHEET_SYNC_DISABLE=on.
 *
 * UPSERT, NOT OVERWRITE: we READ the existing row first and only overwrite the
 * columns the CRM is authoritative for (name/status/HST/payroll/WSIB/website/…),
 * PRESERVING the government-registry columns the CRM doesn't track
 * (registry #, incorp date, corp type, govt status, # employees, POS/apps). So a
 * sync never wipes the gov-registry data Markie curated by hand.
 *
 * Fully best-effort: any failure logs + returns false; it NEVER blocks the save.
 * =============================================================================
 */

export const CANONICAL_MASTER_SHEET_ID =
  process.env.FIGGY_MASTER_SHEET_ID || "1pcAw-WSQXXnVn-0L-TQ2FIExkHQ0Olf4dzz47t0gTUk";
const MASTER_TAB = "Client Master";
// Committed capability URL (private repo) — same trade-off as the QBO webhook bridge.
const SYNC_WEBHOOK =
  process.env.FIGGY_SHEET_SYNC_WEBHOOK || "https://hook.us2.make.com/d4h33m0na6ulrlm9nkv9dyyfa8hv1bcs";

/** Client Master column order (A..Z). Indexes are 0-based. Bio is appended at Z
 *  so the existing 25-col layout (A..Y) is never reshuffled. */
const COLS = [
  "name", "status", "industry", "craBn", "registryNo", "incorpDate", "corpType",
  "govtStatus", "closePeriod", "yeMonth", "hstCadence", "nextHstDue", "hstNumber",
  "payrollPeriod", "craRemitter", "payrollRp", "wsibNo", "numEmployees", "posApps",
  "address", "phone", "email", "website", "owner", "triageEmail", "bio",
] as const;
const N = COLS.length; // 26 → A..Z
// Columns the CRM does NOT own — always preserved from the existing sheet row.
const GOV_ONLY = new Set(["closePeriod", "numEmployees", "posApps"]);
// Columns the CRM fills only if it has a value, else preserve the sheet's.
const SOFT = new Set(["industry", "registryNo", "incorpDate", "corpType", "govtStatus", "address", "phone", "email", "owner", "bio"]);

const lastColLetter = "Z"; // 26th column

export type MasterClient = {
  name?: string | null; company?: string | null; status?: string | null;
  industry?: string | null; taxId?: string | null; yearEndMonth?: string | null;
  hstPeriod?: string | null; hstNextDue?: string | null; hstNumber?: string | null;
  payrollFrequency?: string | null; payrollRemitterFreq?: string | null;
  payrollRpNumber?: string | null; wsibAccountNumber?: string | null;
  address?: string | null; phone?: string | null; email?: string | null;
  website?: string | null; contactName?: string | null; figgyEmail?: string | null;
  registryNumber?: string | null; incorporationDate?: string | null;
  corpType?: string | null; governmentStatus?: string | null; bio?: string | null;
};

const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const titleCadence: Record<string, string> = { annual: "Annual", quarterly: "Quarterly", monthly: "Monthly" };
const titlePay: Record<string, string> = { weekly: "Weekly", "bi-weekly": "Bi-Weekly", "semi-monthly": "Semi-Monthly", monthly: "Monthly", self: "Self" };
const titleRemit: Record<string, string> = { regular: "Regular", quarterly: "Quarterly", accelerated: "Threshold 1" };

/** Map a CRM client → the value the CRM would put in each Client-Master column. */
function crmValue(c: MasterClient, key: string): string | null {
  switch (key) {
    case "name": return c.name || c.company || null;
    case "status": return cap(c.status) || null;
    case "industry": return c.industry && c.industry !== "other" ? c.industry : null;
    case "craBn": return c.taxId || null;
    case "registryNo": return c.registryNumber || null;
    case "incorpDate": return c.incorporationDate || null;
    case "corpType": return c.corpType || null;
    case "govtStatus": return c.governmentStatus || null;
    case "bio": return c.bio || null;
    case "yeMonth": return c.yearEndMonth || null;
    case "hstCadence": return c.hstPeriod ? (titleCadence[c.hstPeriod] ?? cap(c.hstPeriod)) : null;
    case "nextHstDue": return c.hstNextDue || null;
    case "hstNumber": return c.hstNumber || null;
    case "payrollPeriod": return c.payrollFrequency ? (titlePay[c.payrollFrequency] ?? cap(c.payrollFrequency)) : null;
    case "craRemitter": return c.payrollRemitterFreq ? (titleRemit[c.payrollRemitterFreq] ?? cap(c.payrollRemitterFreq)) : null;
    case "payrollRp": return c.payrollRpNumber || null;
    case "wsibNo": return c.wsibAccountNumber || null;
    case "address": return c.address || null;
    case "phone": return c.phone || null;
    case "email": return c.email || null;
    case "website": return c.website || null;
    case "owner": return c.contactName || null;
    case "triageEmail": return c.figgyEmail || null;
    default: return null; // gov-only columns
  }
}

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** POST {url, method, body} to the committed Sheets webhook proxy. */
async function sheetsApi(url: string, method: "GET" | "POST" | "PUT", body?: unknown): Promise<any> {
  const res = await fetch(SYNC_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, method, body: body == null ? "" : typeof body === "string" ? body : JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`sheets proxy ${method} ${url} → ${res.status} ${await res.text()}`);
  const data = await res.json().catch(() => ({}));
  // proxy returns the bare Sheets API body
  return data?.outputs?.tool_output?.body ?? data?.tool_output?.body ?? data?.body ?? data;
}

/**
 * Upsert one client's row into the canonical Client Master tab.
 * Matches by CRA BN (col D) when present, else by normalized name (col A).
 * Preserves government-registry columns. Best-effort: returns true/false.
 */
export async function upsertClientToMaster(c: MasterClient): Promise<boolean> {
  if (process.env.FIGGY_SHEET_SYNC_DISABLE === "on") return false;
  if (!c.name && !c.company && !c.taxId) return false;
  const sid = CANONICAL_MASTER_SHEET_ID;
  const range = `'${MASTER_TAB}'!A:${lastColLetter}`;
  try {
    const read = await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(range)}`, "GET");
    const rows: string[][] = Array.isArray(read?.values) ? read.values : [];
    const bn = (c.taxId || "").trim();
    const nameKey = norm(c.name || c.company);

    // row 0 is the header; find the matching data row (1-based sheet row = i+1).
    let matchIdx = -1; // index into rows[] (incl. header), so sheet row = matchIdx+1
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (bn && norm(r[3]) === norm(bn)) { matchIdx = i; break; }
    }
    if (matchIdx < 0 && nameKey) {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        if (norm(r[0]) === nameKey) { matchIdx = i; break; }
      }
    }

    const existing = matchIdx >= 0 ? rows[matchIdx] || [] : [];
    const out: string[] = [];
    for (let k = 0; k < N; k++) {
      const key = COLS[k];
      const cur = existing[k] ?? "";
      if (GOV_ONLY.has(key)) { out[k] = cur; continue; }       // never touch gov columns
      const v = crmValue(c, key);
      if (SOFT.has(key)) { out[k] = v ?? cur; continue; }      // CRM value if present, else keep
      out[k] = v ?? (matchIdx >= 0 ? cur : "");                // authoritative; keep on update if CRM blank
    }

    if (matchIdx >= 0) {
      const sheetRow = matchIdx + 1; // rows[] is 1:1 with sheet rows (rows[0]=row1)
      const wr = `'${MASTER_TAB}'!A${sheetRow}:${lastColLetter}${sheetRow}`;
      await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(wr)}?valueInputOption=RAW`, "PUT", { values: [out] });
    } else {
      await sheetsApi(
        `spreadsheets/${sid}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        "POST",
        { values: [out] },
      );
    }
    return true;
  } catch (e) {
    console.error("[master-sync] upsert failed for", c.name || c.company || c.taxId, ":", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Fire-and-forget wrapper for hot paths (onboarding/edit) — never throws/blocks. */
export function syncClientToMaster(c: MasterClient): void {
  upsertClientToMaster(c).catch(() => {});
}
