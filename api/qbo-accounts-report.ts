/**
 * QBO ACCOUNTS — pull the chart of accounts for EVERY connected client (through
 * the CRM's own connections, so it covers all of them, not just the few with a
 * Make tool) and export the bank/credit-card accounts to a report.
 * (Markie 2026-06-25: "pull it from all of the QuickBooks… one-shot, not half-ass.")
 *
 * - syncAllClientAccounts(): runs doSyncAccounts across every active connection
 *   (captures name, GL number = AcctNum, last-4, type, balance into qbo_accounts).
 *   Defensive per connection — one client's failure never stops the rest.
 * - writeBankCcReportToSheet(): writes a "Bank & CC Accounts" tab to the master
 *   workbook from qbo_accounts (bank + credit cards), one row per account.
 * - runAccountsReport(): both, in order. Triggered by an admin button.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { qboConnections, qboAccounts, clients } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { doSyncAccounts } from "./qbo-router";
import { sheetsApi, CANONICAL_MASTER_SHEET_ID } from "./master-sheet-sync";

const TAB = "Bank & CC Accounts";

/** Make sure the GL-number + last-4 columns exist on qbo_accounts. */
async function ensureAccountColumns(db: any): Promise<void> {
  const info = await db.all(sql.raw(`PRAGMA table_info(qbo_accounts)`));
  const have = new Set((info as any[]).map((c) => c.name));
  if (!have.has("acctNum")) await db.run(sql.raw(`ALTER TABLE qbo_accounts ADD COLUMN acctNum text`));
  if (!have.has("last4")) await db.run(sql.raw(`ALTER TABLE qbo_accounts ADD COLUMN last4 text`));
}

export type AccountsSyncResult = { synced: number; failed: number; clients: number; errors: string[] };

/** Pull the chart of accounts for every active connection bound to a client. */
export async function syncAllClientAccounts(): Promise<AccountsSyncResult> {
  const db = getDb();
  await ensureAccountColumns(db);
  const conns = await db.select().from(qboConnections).where(eq(qboConnections.isActive, true));
  let synced = 0, failed = 0; const errors: string[] = [];
  const clientIds = new Set<number>();
  for (const conn of conns as any[]) {
    if (conn.clientId == null) continue;
    clientIds.add(conn.clientId);
    try {
      const r = await doSyncAccounts(conn.id);
      synced += r.recordsSynced || 0;
    } catch (e) {
      failed += 1;
      if (errors.length < 20) errors.push(`${conn.companyName || conn.realmId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { synced, failed, clients: clientIds.size, errors };
}

/** Write the bank + credit-card accounts (across all clients) to the report tab. */
export async function writeBankCcReportToSheet(): Promise<{ rows: number } | { error: string }> {
  try {
    const db = getDb();
    // Join accounts → connection → client name. Bank + Credit Card only.
    const rows = (await db.all(sql.raw(
      `SELECT c.company AS company, c.name AS name, a.name AS acctName, a.accountType AS type,
              a.accountSubType AS subType, a.acctNum AS gl, a.last4 AS last4, a.qboAccountId AS qboId,
              a.currentBalance AS bal
         FROM qbo_accounts a
         JOIN qbo_connections q ON q.id = a.connectionId
         LEFT JOIN clients c ON c.id = q.clientId
        WHERE a.accountType IN ('Bank','Credit Card') AND (a.active IS NULL OR a.active = 1)
        ORDER BY COALESCE(c.company, c.name), a.accountType, a.name`,
    ))) as any[];

    const header = ["Client", "Account Name", "Type", "Last 4", "GL #", "QBO Acct ID", "Balance"];
    const values = [header, ...rows.map((r) => [
      r.company || r.name || "—", r.acctName || "", r.type || "", r.last4 || "", r.gl || "", String(r.qboId || ""),
      r.bal != null ? String(r.bal) : "",
    ])];

    // Ensure the tab exists (ignore "already exists"), then write.
    await sheetsApi(`spreadsheets/${CANONICAL_MASTER_SHEET_ID}:batchUpdate`, "POST",
      { requests: [{ addSheet: { properties: { title: TAB } } }] }).catch(() => {});
    await sheetsApi(`spreadsheets/${CANONICAL_MASTER_SHEET_ID}/values/${encodeURIComponent(`'${TAB}'!A1:G2000`)}:clear`, "POST", {}).catch(() => {});
    await sheetsApi(`spreadsheets/${CANONICAL_MASTER_SHEET_ID}/values/${encodeURIComponent(`'${TAB}'!A1`)}?valueInputOption=RAW`, "PUT", { values });
    return { rows: rows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** One-shot: sync every client's accounts, then write the bank/CC report. */
export async function runAccountsReport(): Promise<{ sync: AccountsSyncResult; sheet: { rows: number } | { error: string } }> {
  const sync = await syncAllClientAccounts();
  const sheet = await writeBankCcReportToSheet();
  console.log(`[accounts-report] synced ${sync.synced} accounts across ${sync.clients} client(s); ${sync.failed} failed; sheet:`, JSON.stringify(sheet));
  return { sync, sheet };
}
