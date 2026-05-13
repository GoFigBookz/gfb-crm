/**
 * SQLITE ↔ GOOGLE SHEETS SYNC BRIDGE
 * Bidirectional sync between SQLite (fast CRM backend) and Google Sheets (visibility + agents)
 * 
 * Direction 1: SQLite → Sheets (real-time, on every write)
 * Direction 2: Sheets → SQLite (periodic pull, e.g., every 5 min)
 */

import { getDb } from "./queries/connection";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

// Config - set these from env or Integrations page
let SPREADSHEET_ID = "";
let ACCESS_TOKEN = "";

export function setSyncConfig(spreadsheetId: string, accessToken: string) {
  SPREADSHEET_ID = spreadsheetId;
  ACCESS_TOKEN = accessToken;
}

// ─── TABLE-TO-SHEET MAP ───
// Maps SQLite table names → Google Sheet tab names
const TABLE_SHEET_MAP: Record<string, string> = {
  clients: "Clients",
  tasks: "Tasks",
  time_entries: "Time Entries",
  emails: "Emails",
  calendar_events: "Calendar Events",
  portal_tokens: "Portal Tokens",
  portal_settings: "Portal Settings",
  missing_items: "Missing Items",
  portal_files: "Portal Files",
  signature_documents: "Signature Documents",
  engagement_letters: "Engagement Letters",
  client_playbooks: "Client Playbooks",
  satisfaction_scores: "Satisfaction Scores",
  monthly_close_checklist: "Monthly Close",
  client_vault: "Client Vault",
  client_onboarding: "Client Onboarding",
  triage_findings: "Triage Findings",
  employees: "Employees",
  timesheets: "Timesheets",
  invoices: "Invoices",
  qbo_connections: "QBO Connections",
  notifications: "Notifications",
  connected_accounts: "Connected Accounts",
};

// ─── SCHEMA COLUMN MAP ───
// Maps table names to their schema table objects
const TABLE_SCHEMA_MAP: Record<string, any> = {
  clients: schema.clients,
  tasks: schema.tasks,
  time_entries: schema.timeEntries,
  emails: schema.emails,
  calendar_events: schema.calendarEvents,
  portal_tokens: schema.portalTokens,
  portal_settings: schema.portalSettings,
  missing_items: schema.missingItems,
  portal_files: schema.portalFiles,
  signature_documents: schema.signatureDocuments,
  engagement_letters: schema.engagementLetters,
  client_playbooks: schema.clientPlaybooks,
  satisfaction_scores: schema.satisfactionScores,
  monthly_close_checklist: schema.monthlyCloseChecklist,
  client_vault: schema.clientVault,
  client_onboarding: schema.clientOnboarding,
  triage_findings: schema.triageFindings,
  employees: schema.employees,
  timesheets: schema.timesheets,
  invoices: schema.invoices,
  qbo_connections: schema.qboConnections,
  notifications: schema.notifications,
  connected_accounts: schema.connectedAccounts,
};

// ─── GOOGLE SHEETS API ───

async function sheetsApi(path: string, method = "GET", body?: any) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── DIRECTION 1: SQLite → Sheets (push) ───

/**
 * Push a single record from SQLite to its Google Sheet.
 * Call this after every INSERT/UPDATE in your routers.
 * 
 * Usage in router:
 *   await pushToSheets("clients", { id: 1, name: "John", ... });
 */
export async function pushToSheets(table: string, record: Record<string, any>) {
  if (!SPREADSHEET_ID || !ACCESS_TOKEN) return;
  
  const sheetName = TABLE_SHEET_MAP[table];
  if (!sheetName) return;

  try {
    // Get existing data
    const result = await sheetsApi(`/values/${encodeURIComponent(sheetName)}!A:Z`);
    const rows = result.values || [];
    if (rows.length === 0) return;
    
    const headers = rows[0];
    const idCol = headers.indexOf("id");
    
    // Find existing row by ID
    let rowIndex = -1;
    if (idCol >= 0) {
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][idCol] === String(record.id)) {
          rowIndex = i;
          break;
        }
      }
    }

    // Build row data matching headers
    const row = headers.map((col: string) => {
      const v = record[col];
      if (v === undefined || v === null) return "";
      if (typeof v === "boolean") return v ? "1" : "0";
      if (v instanceof Date) return v.toISOString();
      return String(v);
    });

    if (rowIndex >= 0) {
      // Update existing row
      const sheetRow = rowIndex + 1;
      const colEnd = String.fromCharCode(65 + headers.length - 1);
      await sheetsApi(`/values/${encodeURIComponent(sheetName)}!A${sheetRow}:${colEnd}${sheetRow}?valueInputOption=RAW`, "PUT", { values: [row] });
    } else {
      // Append new row
      await sheetsApi(`/values/${encodeURIComponent(sheetName)}!A:Z:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", { values: [row] });
    }
  } catch (err) {
    console.error(`[SYNC] Failed to push ${table}#${record.id}:`, err);
  }
}

/**
 * Push ALL records from a table (full sync). Use for initial setup.
 */
export async function pushFullTable(table: string) {
  if (!SPREADSHEET_ID || !ACCESS_TOKEN) return;
  
  const db = getDb();
  const tableRef = TABLE_SCHEMA_MAP[table];
  if (!tableRef) {
    console.warn(`[SYNC] Table ${table} not found in schema`);
    return;
  }

  const sheetName = TABLE_SHEET_MAP[table];
  if (!sheetName) return;

  try {
    // Get all records from SQLite
    const records = await db.select().from(tableRef);
    if (records.length === 0) return;

    // Get sheet headers
    const result = await sheetsApi(`/values/${encodeURIComponent(sheetName)}!A1:Z1`);
    const headers = (result.values && result.values[0]) || [];
    if (headers.length === 0) {
      console.warn(`[SYNC] Sheet ${sheetName} has no headers`);
      return;
    }

    // Clear existing data (keep headers, clear row 2 onwards)
    try {
      await sheetsApi(`:batchUpdate`, "POST", {
        requests: [{
          updateCells: {
            range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 0 },
            fields: "userEnteredValue"
          }
        }]
      });
    } catch {
      // Fallback: just append
    }

    // Write all records in batches of 50
    for (let i = 0; i < records.length; i += 50) {
      const batch = records.slice(i, i + 50);
      const rows = batch.map((r: any) => headers.map((col: string) => {
        const v = r[col];
        if (v === undefined || v === null) return "";
        if (typeof v === "boolean") return v ? "1" : "0";
        if (v instanceof Date) return v.toISOString();
        return String(v);
      }));
      
      await sheetsApi(`/values/${encodeURIComponent(sheetName)}!A2:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", { values: rows });
    }
    
    console.log(`[SYNC] Pushed ${records.length} records from ${table} to Sheets`);
  } catch (err) {
    console.error(`[SYNC] Full push failed for ${table}:`, err);
  }
}

/** Push all tables (initial sync) */
export async function pushAllTables() {
  console.log("[SYNC] Starting full push to Google Sheets...");
  for (const table of Object.keys(TABLE_SHEET_MAP)) {
    await pushFullTable(table);
    // Rate limit: 1.5 second between tables
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("[SYNC] Full push complete");
}

// ─── DIRECTION 2: Sheets → SQLite (pull) ───

/** Pull changes from a Google Sheet back into SQLite */
export async function pullTable(table: string) {
  if (!SPREADSHEET_ID || !ACCESS_TOKEN) return;
  
  const sheetName = TABLE_SHEET_MAP[table];
  if (!sheetName) return;

  const db = getDb();
  const tableRef = TABLE_SCHEMA_MAP[table];
  if (!tableRef) return;

  try {
    const result = await sheetsApi(`/values/${encodeURIComponent(sheetName)}!A:Z`);
    const rows = result.values || [];
    if (rows.length < 2) return; // Just headers or empty
    
    const headers = rows[0];
    
    // Process each row
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record: Record<string, any> = {};
      headers.forEach((h: string, idx: number) => {
        record[h] = row[idx] || null;
      });
      
      if (!record.id) continue;
      
      // Auto-convert types
      record.id = parseInt(record.id) || 0;
      if (record.clientId) record.clientId = parseInt(record.clientId) || 0;
      if (record.userId) record.userId = parseInt(record.userId) || 0;
      if (record.hours) record.hours = parseFloat(record.hours) || 0;
      if (record.score) record.score = parseInt(record.score) || 0;
      if (record.monthlyFee) record.monthlyFee = parseFloat(record.monthlyFee) || 0;
      if (record.amount) record.amount = parseFloat(record.amount) || 0;
      if (record.completed === "1" || record.completed === "true" || record.completed === 1) record.completed = true;
      if (record.completed === "0" || record.completed === "false" || record.completed === 0) record.completed = false;
      if (record.isActive === "1" || record.isActive === "true") record.isActive = true;
      if (record.isActive === "0" || record.isActive === "false") record.isActive = false;
      
      // Check if exists in SQLite
      const existing = await db.select().from(tableRef).where(eq(tableRef.id, record.id)).limit(1);
      
      const { id, ...updateData } = record;
      
      if (existing[0]) {
        // Remove nulls from update to avoid overwriting
        const cleanUpdate: Record<string, any> = {};
        for (const [k, v] of Object.entries(updateData)) {
          if (v !== null) cleanUpdate[k] = v;
        }
        if (Object.keys(cleanUpdate).length > 0) {
          await db.update(tableRef).set(cleanUpdate).where(eq(tableRef.id, record.id));
          count++;
        }
      }
    }
    
    console.log(`[SYNC] Pulled ${count} updated rows from ${sheetName}`);
  } catch (err) {
    console.error(`[SYNC] Pull failed for ${table}:`, err);
  }
}

/** Pull all tables from Sheets into SQLite */
export async function pullAllTables() {
  console.log("[SYNC] Starting pull from Google Sheets...");
  for (const table of Object.keys(TABLE_SHEET_MAP)) {
    await pullTable(table);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("[SYNC] Pull complete");
}

// ─── AUTO SYNC SCHEDULER ───

let syncRunning = false;

/** Start automatic bidirectional sync */
export function startAutoSync(pushIntervalMs = 120000, pullIntervalMs = 300000) {
  if (syncRunning) return;
  syncRunning = true;
  
  console.log(`[SYNC] Auto-sync started: push every ${pushIntervalMs/1000}s, pull every ${pullIntervalMs/1000}s`);
  
  // Push to Sheets (every 2 minutes by default)
  setInterval(() => {
    pushAllTables().catch((err) => console.error("[SYNC] Auto-push failed:", err));
  }, pushIntervalMs);
  
  // Pull from Sheets (every 5 minutes by default)
  setInterval(() => {
    pullAllTables().catch((err) => console.error("[SYNC] Auto-pull failed:", err));
  }, pullIntervalMs);
}

export function getSyncStatus() {
  return { running: syncRunning, spreadsheetId: SPREADSHEET_ID, tables: Object.keys(TABLE_SHEET_MAP).length };
}
