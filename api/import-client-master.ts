/**
 * FIGGY JR — MASTER INTAKE IMPORT (one-off, idempotent)
 * =============================================================================
 * Loads the GoFigBookz MASTER_INTAKE_DATABASE sheet into each CRM client record
 * so Figgy knows every client's CRA accounts, filing cadences, year-end,
 * processors, Drive folder and info doc. Data is EMBEDDED (below) so the import
 * needs no runtime Google auth — it's a known, auditable snapshot.
 *
 * Mapping (sheet -> client field):
 *   CRA BN + Payroll Freq -> hasPayroll, payrollFrequency, payrollRpNumber (BN+RP0001)
 *   CRA BN + HST Freq     -> hasHST, hstPeriod, hstNumber (BN+RT0001), taxId (BN)
 *   WSIB account          -> hasWSIB, wsibAccountNumber, wsibQuarter
 *   T2 year-end date      -> yearEndMonth
 *   Triage email          -> figgyEmail        Team lead -> assignedTo
 *   Drive folder / doc    -> driveFolderUrl, clientInfoDocUrl
 *   Stripe/PayPal/Wise/Jobber/TouchBistro -> clientVault.otherSoftwareLogins (JSON)
 *
 * Matching is by name (incl. the parenthetical trade name, e.g. "(The Auld Spot
 * Pub)") via the conservative matchClientIdByName; unmatched rows are reported,
 * never guessed. Idempotent: re-running overwrites the same fields.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients, clientVault } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { matchClientIdByName } from "./client-match";

type Row = {
  name: string; bn: string; pay: string; hst: string; wsib: string; ye: string;
  stripe?: boolean; paypal?: boolean; jobber?: boolean; touchbistro?: boolean;
  folder: string; doc: string; triageEmail?: string;
  // Stable slug for clients with no CRA BN (US / holding cos). The upsert key is
  // BN9 when present, else this slug — see docs/CLIENT_MASTER_SCHEMA.md.
  slug?: string;
};

/** 9-digit CRA Business Number, digits only (the canonical client key). */
const bn9 = (s: any) => String(s ?? "").replace(/\D+/g, "").slice(0, 9);
/** The stable upsert key for a row: BN9 if present, else its assigned slug. */
const keyForRow = (r: Row): string | null => (r.bn ? bn9(r.bn) : (r.slug ?? null));

// Embedded snapshot of MASTER_INTAKE_DATABASE (sheet 1_PCg6gNlx5yHg1McBQTFiwyuLIWB6xnKCY74QTfqDRE),
// captured 2026-06-14. bn = 9-digit CRA business number; "" = none/not applicable.
const F = "https://drive.google.com/drive/folders/";
const D = "https://docs.google.com/document/d/";
const ROWS: Row[] = [
  { name: "2303851 ONTARIO INC.", bn: "847759909", pay: "Monthly", hst: "Annually", wsib: "", ye: "2025-09-30", stripe: true, paypal: true, folder: F + "1FQw4yxOHXU9yDilc9Jy5yP1cKbBQaNCQ", doc: D + "1fLLB27VahF5Kc8mw9CkPikyh4een07iv0NX9YTyiBTE" },
  { name: "ORIGINALITY.AI INC.", bn: "786440610", pay: "Semi-Monthly", hst: "Quarterly", wsib: "", ye: "2025-09-30", stripe: true, folder: F + "1aaqB12rJ5Ou4kX_tWF24JFq7OjEXHL2o", doc: D + "1LTWesMl3XR7wQdjNObAJ3yte2V7Ov8aijMJuSDafG7o" },
  { name: "CLARK POOLS AND SPAS COLLINGWOOD INC.", bn: "770298602", pay: "Bi-Weekly", hst: "Quarterly", wsib: "8989514", ye: "2025-09-30", jobber: true, folder: F + "10qXdEt4KVgW2w3s5VOIph1chSFPUErtH", doc: D + "1B2Mx0H5-CjJyPKcqBy2zSUm7MA-1sZX8PREZxeLcne4" },
  { name: "CLARK POOLS AND SPAS OWEN SOUND INC.", bn: "715666566", pay: "Bi-Weekly", hst: "Annually", wsib: "1815646", ye: "2025-09-30", jobber: true, folder: F + "1eYu1sXe3jRIR4z-WzSzTGNXWS_12UbDt", doc: D + "1OybGjhMrIuCixtNnjnmXH9GqY-HVCtNDRy-mw9oewRM" },
  { name: "ADBANK INC.", bn: "793523481", pay: "Monthly", hst: "Annually", wsib: "", ye: "2025-09-30", paypal: true, folder: F + "17hK0koClzPBJ5uyWDUEDMm9RR9xRalJI", doc: D + "198YQdURQZN5ofZYi5YZRQjEQn-Umcc7gCWJP5D-PLHY" },
  { name: "FRACTAL SAAS INC.", bn: "739247070", pay: "Monthly", hst: "Annually", wsib: "", ye: "2025-09-30", stripe: true, folder: F + "1XiwLjwuQjAC23w3Tci-MHBEd_SRG6L2d", doc: D + "1sd-ndUjxk4b4A1C7xGtpi3KVzn9JS_741_uI5kE-drE" },
  { name: "MOTION INVEST INC.", bn: "728898321", pay: "", hst: "Annually", wsib: "", ye: "2025-12-31", stripe: true, paypal: true, folder: F + "126E4nVOp9xpyJeFvftMfjWdUAVQb_3xn", doc: D + "1ghoktdS_qrzCWCVu4rAQWkzs_3RJhFK9y-QXtTJH09I" },
  { name: "MARKETING STRATEGY VENTURES INC.", bn: "763289337", pay: "", hst: "Annually", wsib: "", ye: "2025-09-30", stripe: true, paypal: true, folder: F + "1tI9o-OSThIskTvG0SqQnIXbJu-rWgBCm", doc: D + "1PeGPRUiSeUqN73-Wb0ILKLRXyfOQcr5n6mr7BFxSx7E" },
  { name: "SEAHORSE HEALTH INC.", bn: "728509522", pay: "", hst: "Annually", wsib: "", ye: "2025-09-30", folder: F + "15GWhR8EchsoQlW_POfZyJJLrk5hLhTZv", doc: D + "1ZDCweQ4emGgVJkgoHNsCimUSEI9cpVkANx2SXWn5BfI" },
  { name: "LISTINGEAGLE.COM INC.", bn: "767302490", pay: "", hst: "Annually", wsib: "", ye: "2025-09-30", folder: F + "14yjTLms7pqbdzIZdyOfPs8orC1juRjiT", doc: D + "1meATRCsB03ZgCyQcU0pSf8PECI6kZqIUUaRdwrbFUYQ" },
  { name: "WEST YORK PAVING LTD.", bn: "877933515", pay: "Weekly", hst: "Quarterly", wsib: "", ye: "2025-12-31", folder: F + "1LlGVkPyMnZ46IPs9UPY66ws3IR_2bAxo", doc: D + "1HmT7d1Vv8UyDX5S9ZYkat63iQZQiOyp8EOLQgogpq9s" },
  { name: "1000235299 ONTARIO LTD. (The Auld Spot Pub)", bn: "718843600", pay: "Bi-Weekly", hst: "Quarterly", wsib: "", ye: "2025-09-30", touchbistro: true, folder: F + "1RYy_SiBp-Qlkl8AxurIWXnbHDHtx8J1F", doc: D + "1imfF8LCaEHFTMqegUTscw17-N9J9dtXV02N4ERW5uxc" },
  { name: "1001196626 ONTARIO LTD. (Sher-E-Punjab)", bn: "706313020", pay: "", hst: "Annually", wsib: "", ye: "2025-12-31", folder: F + "1pbNsufSywSXkETjYRTg8zFeqBxBpnuWy", doc: D + "1IiLR1jyiVne4WzvdDgW0tlwGSGrLDeIagaY3KHCR5Yg" },
  { name: "UNIVERSAL CONSTRUCTION GROUP INC.", bn: "741962930", pay: "Bi-Weekly", hst: "Quarterly", wsib: "45748", ye: "2025-12-31", folder: F + "1vINZgScLvvQtvFAc6xJK-IJXcDCmrM2h", doc: D + "1F9jNlQa51KxxfVOE0RVpZhLR5IszRRUi8RROG0q-i5I" },
  { name: "12738988 CANADA INC.", bn: "781088661", pay: "", hst: "Annually", wsib: "", ye: "2025-12-31", folder: F + "1XqpieuAB3eKiPpVYqgKgepkMblDl7L7B", doc: D + "13QrfRhI3WY2VTiVq99QmOYd7LYxyuDcsk129J7ICo6M" },
  { name: "UNIMAX (USA)", bn: "", slug: "unimax-usa", pay: "", hst: "", wsib: "", ye: "2025-12-31", folder: F + "1-iKPbFSUZ5YJSijbiCwFzpvbH4UCHaim", doc: D + "1cr_ln6XEyZX85eM1dY_ssflvrc59K-LvLIoSZMkFZ8o" },
  { name: "AIM CONSTRUCTION INC.", bn: "807649798", pay: "", hst: "Annually", wsib: "", ye: "2025-12-31", folder: F + "1VOnQyqFHB5o4TAcErQYCgOWIXrF_j5Ef", doc: D + "1gcr9V3hH_vIoV7hzyPEIzURI2AmXdgNa1Zr77N0BcGM" },
  { name: "SELECTIVE PAINTING", bn: "784617565", pay: "", hst: "Annually", wsib: "46023", ye: "2025-12-31", folder: F + "1F9C8GeZHWhT__YMaiWChiyvqV8XD9ft8", doc: D + "1D8ZwwFm6s3WuBdQwx2gnP7Ag10cPYYcFrbG0JKKCJpg" },
  { name: "KING INDUSTRIES INC.", bn: "858977705", pay: "", hst: "Quarterly", wsib: "", ye: "2025-12-31", folder: F + "18LARx2KKXk2WIedta-6EBgAztgF5PAKj", doc: D + "11AseJQkMVz53CCuh4rDNL2-Qf1LBwi6hRmAoruWJey4" },
  { name: "DOCK KINGS INC.", bn: "", slug: "dock-kings", pay: "", hst: "", wsib: "", ye: "2025-12-31", folder: F + "1kntRZ07OMtnAj1LH_wELZwevW43sexj4", doc: D + "1v1URJgavBHryspSGZiNr921umsTIPtDX7Tmj3OodE9k" },
  { name: "GOTOMARKET AGILITY INC.", bn: "", slug: "gotomarket-agility", pay: "", hst: "", wsib: "", ye: "2025-12-31", folder: F + "1-jLpF0TIZ4AUzxETxovgILnvUSzZZRxZ", doc: D + "1xwNdxp8CgmDVB4e6LA8K2s05ouIa9u69_0PQFI1NjXg" },
  { name: "DARK HORSE INTELLIGENCE INC.", bn: "750383671", pay: "Monthly", hst: "Annually", wsib: "", ye: "2025-12-31", folder: F + "12_ebmsvtGlQYbGmU9mE7Bwva0LNdc4mv", doc: D + "19dY-68qW4I3YaD9KH-CzLTy1wl1T79AHRSJXCksGq0U" },
  { name: "1001411380 ONTARIO INC. (Columbus Cafe)", bn: "758960231", pay: "", hst: "Quarterly", wsib: "", ye: "2025-12-31", folder: F + "1bxUtm6PF18DLKwarERlDDKvoEsi6Aoni", doc: D + "1gnRGEFTFRSxoPjC87ZSuGz-deg_M0Hkw10L-aZ32yPU" },
  { name: "OVITA CONSTRUCTION LTD.", bn: "752504498", pay: "", hst: "Quarterly", wsib: "", ye: "2025-11-30", folder: F + "1AqBz0TK1QcDtDVi1vrXhc4vc2v7Pumru", doc: D + "18en2-4pPYZ0ZoQqob7d9GDcUh-NvNec3c5X654QBO4Y" },
  { name: "OVITA HOLDINGS INC.", bn: "722717121", pay: "", hst: "Quarterly", wsib: "", ye: "2025-12-31", folder: F + "1ZLkgFq68jqkXQNZYWNulW_YMLNzb_9hT", doc: D + "1yLC9rMxN45DdihCN4LW-fIh4GZuYLgmNNe87bwoGFkQ" },
  { name: "ALDERSON DEVELOPMENTS LTD.", bn: "774355168", pay: "", hst: "Quarterly", wsib: "", ye: "2025-11-30", folder: F + "1-bxKE4CGXC_RDU10XdFAS8FpWmBEklOU", doc: D + "12vvP4R6H-dFnLZNUP5WPS7BBk8DHHpdXtOjPpmBnbTE" },
  { name: "ALIGN BY DESIGN HD INC.", bn: "707477733", pay: "Monthly", hst: "Quarterly", wsib: "", ye: "2025-10-31", folder: F + "1RDYytzByINcfnPMkLXnek9Hv6mcLssfM", doc: D + "1YNz4bciE7vhgdt-88PXUEuKj6GZKDf6JwjgZhjWwbd8" },
  { name: "STUDIO LELLA INC.", bn: "792026429", pay: "", hst: "Quarterly", wsib: "", ye: "2025-12-31", folder: F + "1TK6OzAZ4pD4Gms-5rhNL3YDShIbd10VD", doc: D + "1mrdmR8s80jITc3R0IUijdHKwmZ7Nh6T-flvhiMGq9_U" },
  { name: "LAING SCIENTIFIC", bn: "127437374", pay: "", hst: "Quarterly", wsib: "", ye: "2025-12-31", folder: F + "1dGeUTCbltTi0G0mEm9fH6VEuT1DE0Iwc", doc: D + "1Dv3eZ-wX2fSKStvyoUwDgWU4PKDS-4wnrg7hJblODpM" },
  { name: "ALIGN PLUMBING INC.", bn: "789978301", pay: "", hst: "Annually", wsib: "", ye: "2025-07-31", folder: F + "1FwrtszqS4vqFgXXjPYg62QzxSUVJL0Lc", doc: D + "1N7C9lqZDpEN8ASf7o4ieHpAhAPHUgz-lTP7j9XvEIKM" },
  { name: "M.M. KAPALA MEDICINE PROFESSIONAL CORPORATION", bn: "", slug: "mm-kapala-medicine", pay: "", hst: "", wsib: "", ye: "2025-06-30", folder: F + "1d8kUnetOrHb2h1b7weOTFD3yJYMyRAbX", doc: D + "1twGkrA92uJhV3LIT3-PVP4YMpjDrNOw-44JGhmJKJxk" },
  { name: "FLEMING ADVISORY INC. (fka Kaavio)", bn: "736845488", pay: "", hst: "Annually", wsib: "", ye: "2025-12-31", folder: F + "1ynQJzY3sffTICdqU8cWoenW5ZhRxz_o3", doc: D + "1jv_rIscsDekjSLqsWHpw-iD4J4A_hed-VTf8QkJ6ktQ" },
  { name: "UNIVERSAL DRYWALL (USA)", bn: "", slug: "universal-drywall-usa", pay: "", hst: "", wsib: "", ye: "", folder: F + "1y1Tg7_k8u3d3NTJs2C-dYNIjdj83UokB", doc: D + "1wGoGDChnBCusbDYoHC1ZsKfqc42JtHFqPr0N3gJuvYQ" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const payMap: Record<string, string> = { weekly: "weekly", "bi-weekly": "bi-weekly", "semi-monthly": "semi-monthly", monthly: "monthly" };
const hstMap: Record<string, string> = { annually: "annual", quarterly: "quarterly", monthly: "monthly" };

/** Derive the trade name inside parentheses AND the bare legal name, so either
 *  can match a CRM client (e.g. "1000235299 ONTARIO LTD. (The Auld Spot Pub)"). */
function matchKeys(name: string): string[] {
  const keys: string[] = [];
  const paren = name.match(/\(([^)]+)\)/);
  const bare = name.replace(/\([^)]*\)/g, "").trim();
  if (bare) keys.push(bare);
  if (paren) keys.push(paren[1].trim());
  return keys;
}

export async function ensureClientMasterColumns(): Promise<void> {
  const db = getDb();
  const have = new Set<string>();
  try {
    for (const r of [...((await db.run(sql`PRAGMA table_info(clients)`)) as any).rows ?? []]) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) { console.error("[import] table_info(clients) failed:", e instanceof Error ? e.message : e); }
  const adds: Array<[string, any]> = [
    ["payrollRpNumber", sql`ALTER TABLE clients ADD COLUMN "payrollRpNumber" text`],
    ["driveFolderUrl", sql`ALTER TABLE clients ADD COLUMN "driveFolderUrl" text`],
    ["clientInfoDocUrl", sql`ALTER TABLE clients ADD COLUMN "clientInfoDocUrl" text`],
    ["nextPayday", sql`ALTER TABLE clients ADD COLUMN "nextPayday" text`],
    // Canonical upsert key (BN9 / slug) — see docs/CLIENT_MASTER_SCHEMA.md.
    ["clientKey", sql`ALTER TABLE clients ADD COLUMN "clientKey" text`],
  ];
  for (const [col, stmt] of adds) {
    if (have.has(col)) continue;
    try { await db.run(stmt); console.log("[import] added clients column:", col); }
    catch (e) { console.error("[import] add column", col, "failed:", e instanceof Error ? e.message : e); }
  }
}

export async function importClientMaster() {
  await ensureClientMasterColumns();
  const db = getDb();
  const report = { rows: ROWS.length, matched: 0, updated: 0, vaults: 0, unmatched: [] as string[] };

  // Resolve every client ONCE so we can match on the canonical key (BN9 / slug)
  // before falling back to name — keying on identity is what makes re-runs
  // idempotent and prevents the duplicate clients we had to clean up.
  const all: any[] = await db.select().from(clients);
  const byKey = new Map<string, number>();
  for (const c of all) {
    const k = c.clientKey || (c.taxId ? bn9(c.taxId) : "");
    if (k && !byKey.has(k)) byKey.set(k, c.id);
  }

  for (const r of ROWS) {
    const key = keyForRow(r);
    let clientId: number | null = key ? (byKey.get(key) ?? null) : null;
    // Fallback: name match only when the key didn't resolve (e.g. first import
    // before clientKey is backfilled, or a BN not yet on the client record).
    if (!clientId) { for (const k of matchKeys(r.name)) { clientId = await matchClientIdByName(k); if (clientId) break; } }
    if (!clientId) { report.unmatched.push(r.name); continue; }
    report.matched++;

    const payFreq = payMap[r.pay.toLowerCase()] ?? null;
    const hstPeriod = hstMap[r.hst.toLowerCase()] ?? null;
    const yearEndMonth = /^\d{4}-(\d{2})-\d{2}$/.test(r.ye) ? MONTHS[Number(r.ye.slice(5, 7)) - 1] : null;

    const patch: Record<string, any> = {
      assignedTo: "Markie",
      driveFolderUrl: r.folder || null,
      clientInfoDocUrl: r.doc || null,
      updatedAt: new Date(),
    };
    if (key) patch.clientKey = key; // backfill the canonical key so later syncs match on it
    if (r.bn) patch.taxId = r.bn;
    if (r.hst) { patch.hasHST = true; patch.hstNumber = r.bn ? `${r.bn}RT0001` : null; if (hstPeriod) patch.hstPeriod = hstPeriod; }
    if (payFreq) { patch.hasPayroll = true; patch.payrollFrequency = payFreq; patch.payrollRpNumber = r.bn ? `${r.bn}RP0001` : null; }
    if (r.wsib) { patch.hasWSIB = true; patch.wsibAccountNumber = r.wsib; patch.wsibQuarter = "all"; }
    if (yearEndMonth) patch.yearEndMonth = yearEndMonth;
    if (r.triageEmail) patch.figgyEmail = r.triageEmail;

    await db.update(clients).set(patch).where(eq(clients.id, clientId));
    report.updated++;

    // Payment processors -> vault software logins (no secrets, just URLs).
    const procs: Record<string, string> = {};
    if (r.stripe) procs.stripe = "https://dashboard.stripe.com/login";
    if (r.paypal) procs.paypal = "https://www.paypal.com/signin";
    if (r.jobber) procs.jobber = "https://secure.getjobber.com/login";
    if (r.touchbistro) procs.touchbistro = "https://www.touchbistro.com/login";
    if (Object.keys(procs).length) {
      const existing = (await db.select().from(clientVault).where(eq(clientVault.clientId, clientId)).limit(1))[0];
      const v = { clientId, otherSoftwareLogins: JSON.stringify(procs), updatedAt: new Date() };
      if (existing) await db.update(clientVault).set(v).where(eq(clientVault.id, existing.id));
      else await db.insert(clientVault).values(v);
      report.vaults++;
    }
  }
  return report;
}
