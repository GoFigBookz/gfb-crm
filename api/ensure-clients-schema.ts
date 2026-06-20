/**
 * FIGGY JR — CLIENTS TABLE SCHEMA GUARD
 * =============================================================================
 * The live (Railway, persistent-volume) DB predates the current schema: the
 * `clients` table is MISSING columns the app now SELECTs (figgyEmail, contactName,
 * transactionsPerMonth, engagementSignedAt, province, qboConnectionId, …). Drizzle
 * selects an explicit column list, so a single missing column makes EVERY read of
 * the table throw — which is why the Clients page showed nothing even though rows
 * exist, and why the bridge + seed silently failed.
 *
 * This adds every expected column that's missing (PRAGMA-checked, nullable, safe,
 * idempotent — mirrors bridge-bootstrap / vendor-learning). It MUST run before
 * anything reads `clients`. Extra/legacy columns already on the table (e.g. an old
 * `notes`) are harmless — we only ADD, never drop.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

// Every column the current schema.ts `clients` table expects, with a SQLite type
// (+ default where the schema has one). Core cols (id/userId/name/email) always
// exist, so they're omitted.
const COLUMNS: Array<[string, string]> = [
  ["phone", "text"], ["company", "text"], ["address", "text"], ["taxId", "text"],
  ["status", "text DEFAULT 'active'"],
  ["workflowStatus", "text DEFAULT 'new_lead'"],
  ["leadSource", "text"], ["leadSourceDetail", "text"],
  ["discoveryDate", "integer"], ["nextAction", "text"], ["nextActionDate", "integer"],
  ["estimatedMonthlyValue", "real"], ["leadScore", "integer"],
  ["painPoints", "text"], ["expectations", "text"],
  ["serviceTier", "text DEFAULT 'standard'"], ["monthlyFee", "real DEFAULT 0"],
  ["onboardingSentAt", "integer"], ["onboardingCompletedAt", "integer"], ["onboardingToken", "text"],
  ["hasHST", "integer DEFAULT 0"], ["hstNumber", "text"], ["hstPeriod", "text"],
  ["hasWSIB", "integer DEFAULT 0"], ["wsibAccountNumber", "text"], ["wsibQuarter", "text"],
  ["hasPayroll", "integer DEFAULT 0"], ["payrollFrequency", "text"], ["payrollRemitterFreq", "text DEFAULT 'regular'"], ["yearEndMonth", "text"],
  ["quoteAmount", "real"], ["quoteSentAt", "integer"], ["quoteApprovedAt", "integer"],
  ["transactionsPerMonth", "integer DEFAULT 0"],
  ["engagementSentAt", "integer"], ["engagementSignedAt", "integer"], ["engagementLetterUrl", "text"],
  ["assignedTo", "text"], ["oneDriveFolderId", "text"],
  ["payrollRpNumber", "text"], ["driveFolderUrl", "text"], ["clientInfoDocUrl", "text"], ["nextPayday", "text"],
  ["qboCustomerId", "text"], ["qboConnectionId", "integer"],
  ["industry", "text DEFAULT 'other'"], ["province", "text DEFAULT 'ON'"], ["qboAccountType", "text DEFAULT 'ca_clients'"],
  ["figgyEmail", "text"], ["contactName", "text"], ["craRacDone", "integer DEFAULT 0"],
  ["createdAt", "integer"], ["updatedAt", "integer"],
];

export async function ensureClientsColumns(): Promise<{ added: string[] }> {
  const db = getDb();
  const added: string[] = [];
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(clients)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) {
    console.error("[schema] table_info(clients) failed:", e instanceof Error ? e.message : e);
    return { added };
  }
  for (const [col, type] of COLUMNS) {
    if (have.has(col)) continue;
    try {
      await db.run(sql.raw(`ALTER TABLE clients ADD COLUMN "${col}" ${type}`));
      added.push(col);
    } catch (e) {
      console.error("[schema] add clients column", col, "failed:", e instanceof Error ? e.message : e);
    }
  }
  if (added.length) console.log("[schema] clients: added missing columns:", added.join(", "));
  return { added };
}

/** Add newer client_onboarding columns the live DB may be missing (e.g.
 *  usesTouchBistro), so intake inserts don't fail. Idempotent. */
export async function ensureOnboardingColumns(): Promise<void> {
  const db = getDb();
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(client_onboarding)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) {
    console.error("[schema] table_info(client_onboarding) failed:", e instanceof Error ? e.message : e);
    return;
  }
  const adds: Array<[string, string]> = [
    ["usesTouchBistro", "integer DEFAULT 0"],
    ["usesPayPal", "integer DEFAULT 0"],
    ["paysDividends", "integer DEFAULT 0"],
    ["hasEHT", "integer DEFAULT 0"],
    ["employeeCount", "integer DEFAULT 0"],
    ["monthsBehind", "integer DEFAULT 0"],
    ["bookkeepingFrequency", "text DEFAULT 'monthly'"],
    ["usesHubdoc", "integer DEFAULT 0"],
    ["hasJobCosting", "integer DEFAULT 0"],
    ["avgMonthlyTransactions", "integer DEFAULT 0"],
    ["invoicingResponsibility", "text DEFAULT 'none'"],
    ["billPayResponsibility", "text DEFAULT 'none'"],
  ];
  for (const [col, type] of adds) {
    if (have.has(col)) continue;
    try { await db.run(sql.raw(`ALTER TABLE client_onboarding ADD COLUMN "${col}" ${type}`)); console.log("[schema] client_onboarding: added", col); }
    catch (e) { console.error("[schema] add client_onboarding column", col, "failed:", e instanceof Error ? e.message : e); }
  }
}
