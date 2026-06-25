/**
 * FIGGY JR — MASTER SHEET SYNC (CRM ⇄ canonical Google master)
 * =============================================================================
 * Markie's requirement: the Google Sheet is the crash-safe mirror — "the back end
 * of the Google Sheets must always match what we're building here." Outbound
 * (CRM→sheet) upserts a client's row on every onboard/edit; inbound (sheet→CRM,
 * see sheet-inbound-sync.ts) applies sheet edits back on a schedule.
 *
 * HEADER-DRIVEN (so layout & code never fight): we resolve every column by MATCHING
 * THE HEADER ROW, not by a fixed position. Reorder columns in the sheet freely —
 * sync still finds them. Columns we don't own (close period, # employees, POS,
 * notes, …) are never touched, so a sync never wipes hand-curated data.
 *
 * TRANSPORT (zero-touch, same as the QBO bridge): a committed Make WEBHOOK proxies
 * a flat {url, method, body} to the Google Sheets v4 API (scenario 5453235, Google
 * conn 9040573). No token/env var needed. Opt out with FIGGY_SHEET_SYNC_DISABLE=on.
 * Best-effort: any failure logs + returns false; never blocks the save.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clientOnboarding, clients } from "../db/schema";
import { eq } from "drizzle-orm";

export const CANONICAL_MASTER_SHEET_ID =
  process.env.FIGGY_MASTER_SHEET_ID || "1pcAw-WSQXXnVn-0L-TQ2FIExkHQ0Olf4dzz47t0gTUk";
const MASTER_TAB = "Client Master";
const LEADS_TAB = "Leads";
const SYNC_WEBHOOK =
  process.env.FIGGY_SHEET_SYNC_WEBHOOK || "https://hook.us2.make.com/d4h33m0na6ulrlm9nkv9dyyfa8hv1bcs";

export type MasterClient = {
  id?: number | null;
  name?: string | null; company?: string | null; status?: string | null;
  industry?: string | null; taxId?: string | null; yearEndMonth?: string | null;
  hstPeriod?: string | null; hstNextDue?: string | null; hstNumber?: string | null;
  payrollFrequency?: string | null; payrollRemitterFreq?: string | null;
  payrollRpNumber?: string | null; wsibAccountNumber?: string | null;
  address?: string | null; phone?: string | null; email?: string | null;
  website?: string | null; contactName?: string | null; figgyEmail?: string | null;
  registryNumber?: string | null; incorporationDate?: string | null;
  corpType?: string | null; governmentStatus?: string | null; bio?: string | null;
  hasIntercoJournals?: boolean | null;
  qboRealmId?: string | null;
  workflowStatus?: string | null;
  // Sales/payment platforms — discrete checkbox columns (live on client_onboarding,
  // attached here by upsert so each platform is its own TRUE/FALSE column, never a
  // messy comma-list that breaks syncing).
  usesStripe?: boolean | null; usesSquare?: boolean | null; usesJobber?: boolean | null;
  usesTouchBistro?: boolean | null; usesPayPal?: boolean | null; usesWise?: boolean | null;
  usesShopify?: boolean | null;
};

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const titleCadence: Record<string, string> = { annual: "Annual", quarterly: "Quarterly", monthly: "Monthly" };
const titlePay: Record<string, string> = { weekly: "Weekly", "bi-weekly": "Bi-Weekly", "semi-monthly": "Semi-Monthly", monthly: "Monthly", self: "Self" };
const titleRemit: Record<string, string> = { regular: "Regular", quarterly: "Quarterly", accelerated: "Threshold 1" };

// Inbound parsers (sheet display → CRM canonical value).
function cadenceIn(v: string): string | null { const s = v.toLowerCase(); if (!s) return null; if (s.includes("month")) return "monthly"; if (s.includes("quart") || s.includes("qrtly")) return "quarterly"; if (s.includes("annual") || s.includes("year")) return "annual"; return null; }
function payInF(v: string): string | null { const s = v.toLowerCase().replace(/\s+/g, "-"); if (!s) return null; if (s.includes("bi-week")) return "bi-weekly"; if (s.includes("week")) return "weekly"; if (s.includes("semi")) return "semi-monthly"; if (s.includes("month")) return "monthly"; if (s.includes("self")) return "self"; return null; }
function remitIn(v: string): string | null { const s = v.toLowerCase(); if (!s) return null; if (s.includes("threshold") || s.includes("acceler")) return "accelerated"; if (s.includes("quart")) return "quarterly"; if (s.includes("regular")) return "regular"; return null; }
function statusInF(v: string): string | null { const s = v.toLowerCase().trim(); return ["active", "inactive", "prospect", "lead"].includes(s) ? s : null; }
const cleanIn = (v: any): string => { const s = String(v ?? "").trim(); return /^(n\/?a|none|null)$/i.test(s) ? "" : s; };

export type FieldKey =
  | "name" | "status" | "industry" | "bio" | "craBn" | "registryNo" | "incorpDate"
  | "corpType" | "govtStatus" | "address" | "phone" | "email" | "website" | "owner"
  | "triageEmail" | "yeMonth" | "hstCadence" | "nextHstDue" | "hstNumber"
  | "payrollPeriod" | "craRemitter" | "payrollRp" | "wsibNo" | "companyKey" | "craRepId"
  | "qboRealm"
  | "useStripe" | "useSquare" | "useJobber" | "useTouchBistro" | "usePayPal" | "useWise" | "useShopify" | "interco";

type FieldDef = {
  key: FieldKey;
  match: (h: string) => boolean;          // h = normalized header
  toSheet: (c: MasterClient) => string | null;
  soft: boolean;                          // soft = write only when CRM has a value (else preserve)
  fromSheet: (raw: string) => Record<string, any> | null; // sheet → CRM patch (null = skip)
  onb?: boolean;                          // patch targets client_onboarding (not clients)
};

// Checkbox helpers: CRM bool → "TRUE"/"FALSE"; sheet cell → bool (TRUE/✓/yes/1/x).
const boolToSheet = (v: any): string => (v ? "TRUE" : "FALSE");
const boolFromSheet = (raw: string): boolean => /^(true|t|yes|y|1|x|✓|checked)$/i.test(String(raw).trim());

// Order matters: first matching field wins per column.
export const MASTER_FIELDS: FieldDef[] = [
  { key: "name", match: h => h.includes("legal name") || (h.includes("client") && h.includes("name")), toSheet: c => c.name || c.company || null, soft: false, fromSheet: r => ({ name: r }) },
  { key: "status", match: h => h === "status", toSheet: c => cap(c.status) || null, soft: false, fromSheet: r => { const s = statusInF(r); return s ? { status: s } : null; } },
  { key: "industry", match: h => h.includes("industry"), toSheet: c => (c.industry && c.industry !== "other" ? c.industry : null), soft: true, fromSheet: r => ({ industry: r }) },
  { key: "bio", match: h => h.includes("bio") || h.includes("description"), toSheet: c => c.bio || null, soft: true, fromSheet: r => ({ bio: r }) },
  { key: "craBn", match: h => h.includes("business") || h === "cra bn" || (h.includes("cra") && h.includes("bn")), toSheet: c => c.taxId || null, soft: true, fromSheet: r => ({ taxId: r }) },
  { key: "registryNo", match: h => h.includes("registry"), toSheet: c => c.registryNumber || null, soft: true, fromSheet: r => ({ registryNumber: r }) },
  { key: "incorpDate", match: h => h.includes("incorpor"), toSheet: c => c.incorporationDate || null, soft: true, fromSheet: r => ({ incorporationDate: r }) },
  { key: "corpType", match: h => h.includes("corp type") || (h.includes("corp") && h.includes("type")), toSheet: c => c.corpType || null, soft: true, fromSheet: r => ({ corpType: r }) },
  { key: "govtStatus", match: h => h.includes("govt") || h.includes("government"), toSheet: c => c.governmentStatus || null, soft: true, fromSheet: r => ({ governmentStatus: r }) },
  { key: "address", match: h => h.includes("address") || h.includes("registered office"), toSheet: c => c.address || null, soft: true, fromSheet: r => ({ address: r }) },
  { key: "phone", match: h => h.includes("phone"), toSheet: c => c.phone || null, soft: true, fromSheet: r => ({ phone: r }) },
  { key: "triageEmail", match: h => h.includes("triage"), toSheet: c => c.figgyEmail || null, soft: false, fromSheet: r => ({ figgyEmail: r }) },
  { key: "email", match: h => h === "email" || (h.includes("email") && !h.includes("triage")), toSheet: c => c.email || null, soft: true, fromSheet: r => ({ email: r }) },
  { key: "website", match: h => h.includes("website") || h.includes("web site"), toSheet: c => (c.website ? c.website.toLowerCase() : null), soft: true, fromSheet: r => ({ website: r.toLowerCase() }) },
  { key: "owner", match: h => h.includes("owner") || h === "contact", toSheet: c => c.contactName || null, soft: true, fromSheet: r => ({ contactName: r }) },
  { key: "yeMonth", match: h => h.includes("year end") || h.includes("ye month") || h.includes("fiscal"), toSheet: c => c.yearEndMonth || null, soft: false, fromSheet: r => ({ yearEndMonth: r }) },
  { key: "hstCadence", match: h => h.includes("hst cadence") || (h.includes("hst") && h.includes("cadence")), toSheet: c => (c.hstPeriod ? (titleCadence[c.hstPeriod] ?? cap(c.hstPeriod)) : null), soft: false, fromSheet: r => { const p = cadenceIn(r); return p ? { hstPeriod: p, hasHST: true } : null; } },
  { key: "nextHstDue", match: h => h.includes("next hst") || (h.includes("hst") && h.includes("due")), toSheet: c => c.hstNextDue || null, soft: false, fromSheet: r => ({ hstNextDue: r }) },
  { key: "hstNumber", match: h => h === "hst" || (h.includes("hst") && (h.includes("number") || h === "hst")), toSheet: c => c.hstNumber || null, soft: true, fromSheet: r => ({ hstNumber: r }) },
  { key: "payrollPeriod", match: h => h === "payroll" || h.includes("payroll period") || h.includes("payroll freq"), toSheet: c => (c.payrollFrequency ? (titlePay[c.payrollFrequency] ?? cap(c.payrollFrequency)) : null), soft: false, fromSheet: r => { const p = payInF(r); return p ? { payrollFrequency: p, hasPayroll: true } : null; } },
  { key: "craRemitter", match: h => h.includes("remitter"), toSheet: c => (c.payrollRemitterFreq ? (titleRemit[c.payrollRemitterFreq] ?? cap(c.payrollRemitterFreq)) : null), soft: false, fromSheet: r => { const p = remitIn(r); return p ? { payrollRemitterFreq: p } : null; } },
  { key: "payrollRp", match: h => h.includes("payroll rp") || (h.includes("payroll") && h.includes("rp")), toSheet: c => c.payrollRpNumber || null, soft: true, fromSheet: r => ({ payrollRpNumber: r }) },
  { key: "wsibNo", match: h => h.includes("wsib"), toSheet: c => c.wsibAccountNumber || null, soft: true, fromSheet: r => ({ wsibAccountNumber: r, hasWSIB: true }) },
  { key: "companyKey", match: h => h.includes("company key") || h.includes("service canada"), toSheet: c => c.companyKey || null, soft: true, fromSheet: r => ({ companyKey: r }) },
  { key: "craRepId", match: h => h.includes("repid") || h.includes("rep id") || (h.includes("cra") && h.includes("rep")), toSheet: c => c.craRepId || "YY7F3GN", soft: false, fromSheet: r => ({ craRepId: r }) },
  // QBO company/realm ID — the realm column Markie lost. Soft (only writes when we
  // have one, so a manual realm entry is never wiped); inbound updates the file too.
  { key: "qboRealm", match: h => h.includes("realm") || (h.includes("qbo") && h.includes("id")) || (h.includes("quickbooks") && h.includes("id")), toSheet: c => c.qboRealmId || null, soft: true, fromSheet: r => ({ qboRealmId: r }) },
  // Sales/payment platform checkbox columns (each its own TRUE/FALSE column).
  // `onb: true` → inbound applies these to client_onboarding, not clients.
  { key: "useStripe", match: h => h === "stripe", toSheet: c => boolToSheet(c.usesStripe), soft: false, onb: true, fromSheet: r => ({ usesStripe: boolFromSheet(r) }) },
  { key: "useSquare", match: h => h === "square", toSheet: c => boolToSheet(c.usesSquare), soft: false, onb: true, fromSheet: r => ({ usesSquare: boolFromSheet(r) }) },
  { key: "useJobber", match: h => h === "jobber", toSheet: c => boolToSheet(c.usesJobber), soft: false, onb: true, fromSheet: r => ({ usesJobber: boolFromSheet(r) }) },
  { key: "useTouchBistro", match: h => h.includes("touchbistro") || h.includes("touch bistro"), toSheet: c => boolToSheet(c.usesTouchBistro), soft: false, onb: true, fromSheet: r => ({ usesTouchBistro: boolFromSheet(r) }) },
  { key: "usePayPal", match: h => h.includes("paypal") || h.includes("pay pal"), toSheet: c => boolToSheet(c.usesPayPal), soft: false, onb: true, fromSheet: r => ({ usesPayPal: boolFromSheet(r) }) },
  { key: "useWise", match: h => h === "wise", toSheet: c => boolToSheet(c.usesWise), soft: false, onb: true, fromSheet: r => ({ usesWise: boolFromSheet(r) }) },
  { key: "useShopify", match: h => h === "shopify", toSheet: c => boolToSheet(c.usesShopify), soft: false, onb: true, fromSheet: r => ({ usesShopify: boolFromSheet(r) }) },
  // Inter-company journals (client-level checkbox column).
  { key: "interco", match: h => h.includes("inter") && (h.includes("co") || h.includes("journal")), toSheet: c => boolToSheet(c.hasIntercoJournals), soft: false, fromSheet: r => ({ hasIntercoJournals: boolFromSheet(r) }) },
];

// Headers for the discrete platform checkbox columns (self-provisioned into the
// Client Master if missing). Order = how they're appended.
export const PLATFORM_HEADERS = ["Stripe", "Square", "Shopify", "Jobber", "TouchBistro", "PayPal", "Wise", "Inter-Co Journals"];

// Columns we self-provision into an EXISTING Client Master tab if missing (so a
// sheet that predates a column gets it added rather than silently dropping data).
export const SELF_PROVISION_HEADERS = ["QBO Realm ID", ...PLATFORM_HEADERS];

/** The default header row written if the Client Master tab is ever empty. */
export const DEFAULT_MASTER_HEADER = [
  "Client / Legal Name", "Status", "Industry", "Bio / Description", "CRA Business #",
  "Registry #", "Incorporation Date", "Corp Type", "Govt Status", "Address", "Phone",
  "Email", "Website", "Owner / Contact", "Figgy Triage Email", "Year-End Month",
  "Close Period", "HST Cadence", "Next HST Due", "HST #", "Payroll", "CRA Remitter",
  "Payroll RP #", "WSIB #", "# Employees", "POS / Apps", "Company Key", "CRA RepID",
  "QBO Realm ID",
  "Stripe", "Square", "Shopify", "Jobber", "TouchBistro", "PayPal", "Wise", "Inter-Co Journals",
];

/** Map each known field → its column index in this header row (first match wins). */
export function resolveColumns(header: string[]): Map<FieldKey, number> {
  const map = new Map<FieldKey, number>();
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i]);
    if (!h) continue;
    for (const f of MASTER_FIELDS) {
      if (map.has(f.key)) continue;
      if (f.match(h)) { map.set(f.key, i); break; }
    }
  }
  return map;
}

/** 1-based column number → A1 letter (handles >26 → AA, AB…). */
export function colLetter(n: number): string {
  let s = ""; let x = n;
  while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
  return s || "A";
}

/** Read an A1 range from the canonical master sheet. Returns `values` (empty on fail). */
export async function readMasterRange(rangeA1: string): Promise<string[][]> {
  try {
    const read = await sheetsApi(`spreadsheets/${CANONICAL_MASTER_SHEET_ID}/values/${encodeURIComponent(rangeA1)}`, "GET");
    return Array.isArray(read?.values) ? read.values : [];
  } catch { return []; }
}

/** POST {url, method, body} to the committed Sheets webhook proxy. */
async function sheetsApi(url: string, method: "GET" | "POST" | "PUT", body?: unknown): Promise<any> {
  // Re-enabled 2026-06-22 with the double-encode FIXED. Root cause: callers
  // pre-encode the range (encodeURIComponent) AND the Make scenario's google-sheets
  // "Make an API Call" module encodes {{1.url}} again → Sheets received a literal
  // 'Client%20Master' and rejected it. Fix: send the path RAW so Make does the
  // single encode. We decode the caller's encoding here (centralized — callers
  // unchanged); the appended query parts (?valueInputOption=RAW) contain no % so
  // decoding leaves them intact. Off-switch: FIGGY_SHEET_SYNC_DISABLE=on.
  if (process.env.FIGGY_SHEET_SYNC_DISABLE === "on") return null;
  let rawUrl = url;
  try { const d = decodeURIComponent(url); if (d) rawUrl = d; } catch { /* keep as-is */ }
  const res = await fetch(SYNC_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: rawUrl, method, body: body == null ? "" : typeof body === "string" ? body : JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`sheets proxy ${method} ${url} → ${res.status} ${await res.text()}`);
  const data = await res.json().catch(() => ({}));
  return data?.outputs?.tool_output?.body ?? data?.tool_output?.body ?? data?.body ?? data;
}

/**
 * Upsert one client's row into the Client Master tab — HEADER-DRIVEN. Matches the
 * row by CRA BN (else name), writes only the CRM-owned columns (by header), and
 * preserves every other column. Best-effort: returns true/false.
 */
/** A record still in the lead pipeline belongs on the LEADS tab, never on the
 *  Client Master (which is signed/active clients only). */
export function isLeadStage(c: { status?: string | null; workflowStatus?: string | null }): boolean {
  const s = String(c.status ?? "").toLowerCase();
  if (s === "lead" || s === "prospect") return true;
  const w = String(c.workflowStatus ?? "").toLowerCase();
  const LEAD_STAGES = ["new_lead", "discovery_call", "discovery", "proposal_sent", "proposal", "quote_sent", "quoted", "negotiation", "lead", "onboarding_sent"];
  return LEAD_STAGES.includes(w);
}

export async function upsertClientToMaster(c: MasterClient): Promise<boolean> {
  if (process.env.FIGGY_SHEET_SYNC_DISABLE === "on") return false;
  if (!c.name && !c.company && !c.taxId) return false;
  // Leads belong on the Leads tab — route them there and keep them OFF Client Master.
  if (isLeadStage(c)) { try { syncLeadToMaster(c as any); } catch { /* non-fatal */ } return false; }
  const sid = CANONICAL_MASTER_SHEET_ID;
  const range = `'${MASTER_TAB}'!A:AZ`;
  try {
    let rows = await readMasterRange(`${MASTER_TAB}!A:AZ`);
    // Empty tab → lay down the default header first.
    if (!rows.length || !(rows[0] || []).some((x) => String(x ?? "").trim())) {
      await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(`'${MASTER_TAB}'!A1`)}?valueInputOption=RAW`, "PUT", { values: [DEFAULT_MASTER_HEADER] });
      rows = [DEFAULT_MASTER_HEADER.slice()];
    }
    let header = rows[0] || [];

    // Self-provision the discrete platform/interco checkbox columns. The sheet's
    // grid is fixed-width (Google rejects a write past the last column), so we
    // EXPAND the grid first if needed, then write the new headers. Wrapped so a
    // failure here NEVER blocks the client's row write below (best-effort).
    const haveHeaders = new Set(header.map((h) => norm(h)));
    const missing = SELF_PROVISION_HEADERS.filter((h) => !haveHeaders.has(norm(h)));
    if (missing.length) {
      try {
        const targetWidth = header.length + missing.length;
        // Read the tab's grid width + sheetId; widen the grid if it's too narrow.
        const meta = await sheetsApi(`spreadsheets/${sid}?fields=sheets(properties(title,sheetId,gridProperties(columnCount)))`, "GET");
        const props = (meta?.sheets || []).map((s: any) => s?.properties).find((p: any) => p?.title === MASTER_TAB);
        const colCount = props?.gridProperties?.columnCount ?? 26;
        if (props?.sheetId != null && colCount < targetWidth) {
          await sheetsApi(`spreadsheets/${sid}:batchUpdate`, "POST", {
            requests: [{ appendDimension: { sheetId: props.sheetId, dimension: "COLUMNS", length: targetWidth - colCount } }],
          });
        }
        const startCol = colLetter(header.length + 1);
        const newHeader = [...header, ...missing];
        const endCol = colLetter(newHeader.length);
        await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(`'${MASTER_TAB}'!${startCol}1:${endCol}1`)}?valueInputOption=RAW`, "PUT", { values: [missing] });
        header = newHeader;
      } catch (e) {
        console.error("[master-sync] platform-column provision failed (continuing with row write):", e instanceof Error ? e.message : e);
      }
    }

    // Attach this client's platform flags (they live on client_onboarding) so the
    // checkbox columns reflect the intake.
    if (c.id) {
      try {
        const onbRows = await getDb().select().from(clientOnboarding).where(eq(clientOnboarding.clientId, c.id)).orderBy(clientOnboarding.id);
        const o = onbRows[onbRows.length - 1] as any;
        if (o) {
          c = { ...c, usesStripe: !!o.usesStripe, usesSquare: !!o.usesSquare, usesJobber: !!o.usesJobber,
            usesTouchBistro: !!o.usesTouchBistro, usesPayPal: !!o.usesPayPal, usesWise: !!o.usesWise, usesShopify: !!o.usesShopify };
        }
      } catch { /* non-fatal — platforms just stay unset */ }
    }

    const width = Math.max(header.length, DEFAULT_MASTER_HEADER.length);
    const cols = resolveColumns(header);
    const bnCol = cols.get("craBn"); const nameCol = cols.get("name") ?? 0;

    const bn = (c.taxId || "").trim();
    const nameKey = norm(c.name || c.company);
    let matchIdx = -1;
    if (bn && bnCol != null) for (let i = 1; i < rows.length; i++) { if (norm((rows[i] || [])[bnCol]) === norm(bn)) { matchIdx = i; break; } }
    if (matchIdx < 0 && nameKey) for (let i = 1; i < rows.length; i++) { if (norm((rows[i] || [])[nameCol]) === nameKey) { matchIdx = i; break; } }

    const existing = matchIdx >= 0 ? (rows[matchIdx] || []) : [];
    const out: string[] = [];
    for (let k = 0; k < width; k++) out[k] = existing[k] ?? "";           // keep untouched columns
    for (const f of MASTER_FIELDS) {
      const ci = cols.get(f.key); if (ci == null) continue;
      const v = f.toSheet(c);
      if (f.soft) out[ci] = v ?? (existing[ci] ?? "");
      else out[ci] = v ?? (matchIdx >= 0 ? (existing[ci] ?? "") : "");
    }
    const last = colLetter(width);
    if (matchIdx >= 0) {
      const sheetRow = matchIdx + 1;
      await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(`'${MASTER_TAB}'!A${sheetRow}:${last}${sheetRow}`)}?valueInputOption=RAW`, "PUT", { values: [out] });
    } else {
      await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", { values: [out] });
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

/**
 * Push every non-lead client's row to the Client Master — used to rebuild the
 * sheet after the QBO realm IDs were re-synced onto the files. Each client's full
 * record (incl. qboRealmId) is upserted, so the realm column repopulates and all
 * other CRM-owned columns refresh too. Sequential + best-effort (the proxy reads
 * the whole tab per row, so we don't hammer it in parallel). Returns counts.
 */
export async function pushAllClientsToMaster(): Promise<{ pushed: number; failed: number; total: number }> {
  if (process.env.FIGGY_SHEET_SYNC_DISABLE === "on") return { pushed: 0, failed: 0, total: 0 };
  const rows = (await getDb().select().from(clients)) as any[];
  const targets = rows.filter((c) => !isLeadStage(c));
  let pushed = 0, failed = 0;
  for (const c of targets) {
    try {
      const ok = await upsertClientToMaster(c as MasterClient);
      if (ok) pushed += 1; else failed += 1;
    } catch { failed += 1; }
  }
  console.log(`[master-sync] pushed ${pushed}/${targets.length} clients to master (incl. realm IDs); ${failed} failed`);
  return { pushed, failed, total: targets.length };
}

// ── LEADS TAB ────────────────────────────────────────────────────────────────
// Leads (workflowStatus new_lead/discovery_call/…) live on a SEPARATE "Leads" tab
// until they're signed + activated, at which point they graduate to Client Master.
const LEAD_COLS = [
  "dateReceived", "leadName", "businessName", "email", "phone", "website",
  "message", "source", "status", "estValue", "assignedTo", "nextAction", "notes", "crmId",
] as const;
const LEAD_N = LEAD_COLS.length; // 14 → A..N
const leadLastCol = "N";

export type MasterLead = {
  id?: number | null; createdAt?: any; name?: string | null; contactName?: string | null;
  company?: string | null; email?: string | null; phone?: string | null; website?: string | null;
  painPoints?: string | null; expectations?: string | null; leadSource?: string | null;
  leadSourceDetail?: string | null; workflowStatus?: string | null;
  estimatedMonthlyValue?: number | null; assignedTo?: string | null; nextAction?: string | null;
  notes?: string | null;
};

function leadValue(c: MasterLead, key: string): string {
  switch (key) {
    case "dateReceived": { const d = c.createdAt ? new Date(c.createdAt) : null; return d && !isNaN(+d) ? d.toISOString().slice(0, 10) : ""; }
    case "leadName": return c.contactName || c.name || "";
    case "businessName": return c.company || c.name || "";
    case "email": return c.email || "";
    case "phone": return c.phone || "";
    case "website": return c.website || "";
    case "message": return c.painPoints || c.expectations || "";
    case "source": return c.leadSourceDetail || c.leadSource || "";
    case "status": return c.workflowStatus || "new_lead";
    case "estValue": return c.estimatedMonthlyValue != null ? String(c.estimatedMonthlyValue) : "";
    case "assignedTo": return c.assignedTo || "";
    case "nextAction": return c.nextAction || "";
    case "notes": return c.notes || "";
    case "crmId": return c.id != null ? String(c.id) : "";
    default: return "";
  }
}

/** Upsert a lead's row into the Leads tab. Key = CRM Lead ID (col N), else email
 *  (col D). Best-effort: returns true/false, never throws. */
export async function upsertLeadToMaster(c: MasterLead): Promise<boolean> {
  if (process.env.FIGGY_SHEET_SYNC_DISABLE === "on") return false;
  if (!c.id && !c.email && !c.name) return false;
  const sid = CANONICAL_MASTER_SHEET_ID;
  const range = `'${LEADS_TAB}'!A:${leadLastCol}`;
  try {
    const read = await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(range)}`, "GET");
    const rows: string[][] = Array.isArray(read?.values) ? read.values : [];
    const id = c.id != null ? String(c.id) : "";
    const email = (c.email || "").trim();
    let matchIdx = -1;
    for (let i = 1; i < rows.length; i++) { if (id && norm((rows[i] || [])[13]) === norm(id)) { matchIdx = i; break; } }
    if (matchIdx < 0 && email) for (let i = 1; i < rows.length; i++) { if (norm((rows[i] || [])[3]) === norm(email)) { matchIdx = i; break; } }
    const out: string[] = [];
    for (let k = 0; k < LEAD_N; k++) out[k] = leadValue(c, LEAD_COLS[k]);
    if (matchIdx >= 0) {
      const sheetRow = matchIdx + 1;
      await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(`'${LEADS_TAB}'!A${sheetRow}:${leadLastCol}${sheetRow}`)}?valueInputOption=RAW`, "PUT", { values: [out] });
    } else {
      await sheetsApi(`spreadsheets/${sid}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", { values: [out] });
    }
    return true;
  } catch (e) {
    console.error("[master-sync] lead upsert failed for", c.name || c.email || c.id, ":", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Fire-and-forget lead sync for hot paths. */
export function syncLeadToMaster(c: MasterLead): void {
  upsertLeadToMaster(c).catch(() => {});
}
