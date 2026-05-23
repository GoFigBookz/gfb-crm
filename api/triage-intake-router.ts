/**
 * TRIAGE INTAKE ROUTER
 * Pulls triage data from Google Sheets (Make.com -> Sheet -> CRM)
 * 
 * The intake form lives at:
 *   Drive: Operations/Figgy Junior/Figgy Junior Intake Form
 *   Make.com populates this sheet automatically
 * 
 * This router:
 *   1. Reads the sheet via Google Sheets API
 *   2. Maps columns to triageQueue fields
 *   3. Inserts new rows into SQLite triage_queue table
 *   4. Skips duplicates (by sourceId or vendor+amount+date combo)
 */

import { z } from "zod";
import { Hono } from "hono";
import { getDb } from "./queries/connection";
import { triageQueue } from "../db/schema";
import { eq, and, or, like, desc, sql } from "drizzle-orm";

// Configurable via env or API call
let INTAKE_SPREADSHEET_ID = process.env.TRIAGE_INTAKE_SHEET_ID || "";
let GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || "";

// Column mapping for the intake form
// Adjust these to match your actual sheet headers
const DEFAULT_COLUMN_MAP: Record<string, string> = {
  "Timestamp": "createdAt",
  "Email": "sourceEmail",
  "Vendor": "vendorName",
  "Description": "description",
  "Amount": "amount",
  "HST": "hstAmount",
  "Total": "totalAmount",
  "Date": "transactionDate",
  "Client": "suggestedClientId",
  "Document Type": "documentType",
  "File Link": "fileUrl",
  "Notes": "aiSuggestion",
  "Category": "suggestedAccount",
};

export function setTriageIntakeConfig(spreadsheetId: string, accessToken: string) {
  INTAKE_SPREADSHEET_ID = spreadsheetId;
  GOOGLE_ACCESS_TOKEN = accessToken;
}

export function getTriageIntakeConfig() {
  return { spreadsheetId: INTAKE_SPREADSHEET_ID, hasToken: !!GOOGLE_ACCESS_TOKEN };
}

async function sheetsApiGet(path: string) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${INTAKE_SPREADSHEET_ID}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API error: ${res.status} ${err}`);
  }
  return res.json();
}

// Convert sheet value to proper type
function normalizeValue(key: string, val: string): any {
  if (!val) return null;
  val = val.trim();
  if (key === "amount" || key === "hstAmount" || key === "totalAmount") {
    return parseFloat(val.replace(/[$,]/g, "")) || 0;
  }
  if (key === "transactionDate" || key === "dueDate") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (key === "suggestedClientId" || key === "assignedClientId" || key === "vendorId") {
    return parseInt(val) || null;
  }
  if (key === "confidenceScore") {
    return parseInt(val) || 50;
  }
  return val;
}

// Main pull function
export async function pullTriageFromSheet(columnMap?: Record<string, string>): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  if (!INTAKE_SPREADSHEET_ID || !GOOGLE_ACCESS_TOKEN) {
    throw new Error("Triage intake not configured. Set TRIAGE_INTAKE_SHEET_ID and GOOGLE_ACCESS_TOKEN env vars, or call /api/triage-intake/config");
  }

  const map = columnMap || DEFAULT_COLUMN_MAP;
  const db = getDb();
  
  // Get all values from first sheet
  const sheetData = await sheetsApiGet(`/values/\'Form Responses 1\'!A:Z`);
  // Fallback to just Sheet1 if Form Responses 1 doesn't exist
  const rows = sheetData.values || [];
  if (rows.length < 2) {
    // Try Sheet1
    const fallback = await sheetsApiGet(`/values/Sheet1!A:Z`).catch(() => ({ values: [] }));
    if (fallback.values?.length >= 2) {
      rows.push(...fallback.values);
    } else {
      return { inserted: 0, skipped: 0, errors: ["Sheet is empty"] };
    }
  }

  const headers: string[] = rows[0];
  const dataRows = rows.slice(1);

  // Build header index map
  const headerToIndex: Record<string, number> = {};
  headers.forEach((h, i) => { headerToIndex[h.trim()] = i; });

  // Find which columns we care about
  const fieldMap: Record<string, string> = {}; // schema field -> sheet column name
  for (const [sheetCol, schemaField] of Object.entries(map)) {
    if (headerToIndex[sheetCol] !== undefined) {
      fieldMap[schemaField] = sheetCol;
    }
  }

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dataRows) {
    try {
      const obj: Record<string, any> = { sourceType: "manual", status: "pending", actionTaken: "none" };
      
      for (const [schemaField, sheetCol] of Object.entries(fieldMap)) {
        const idx = headerToIndex[sheetCol];
        if (idx !== undefined && row[idx]) {
          obj[schemaField] = normalizeValue(schemaField, row[idx]);
        }
      }

      // If no vendor + no amount + no description, skip empty rows
      if (!obj.vendorName && !obj.amount && !obj.description) {
        skipped++;
        continue;
      }

      // Generate a sourceId from row hash
      obj.sourceId = `sheet-${INTAKE_SPREADSHEET_ID}-${row.join("|").slice(0, 100)}`;

      // Check for duplicate by sourceId
      const existing = await db.select().from(triageQueue).where(eq(triageQueue.sourceId, obj.sourceId)).limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Also check duplicate by vendor+amount+date
      if (obj.vendorName && obj.totalAmount && obj.transactionDate) {
        const dup = await db.select().from(triageQueue).where(
          and(
            eq(triageQueue.vendorName, obj.vendorName),
            eq(triageQueue.totalAmount, obj.totalAmount),
            eq(triageQueue.transactionDate, obj.transactionDate)
          )
        ).limit(1);
        if (dup.length > 0) {
          skipped++;
          continue;
        }
      }

      // Set timestamps
      obj.createdAt = obj.createdAt ? new Date(obj.createdAt) : new Date();
      obj.updatedAt = new Date();

      await db.insert(triageQueue).values(obj);
      inserted++;
    } catch (e: any) {
      errors.push(e.message || String(e));
    }
  }

  return { inserted, skipped, errors: errors.slice(0, 10) };
}

// --- Hono Router ---
export const triageIntakeRouter = new Hono();

// GET /api/triage-intake/status — check configuration
triageIntakeRouter.get("/status", async (c) => {
  const config = getTriageIntakeConfig();
  return c.json({
    configured: !!config.spreadsheetId,
    spreadsheetId: config.spreadsheetId ? config.spreadsheetId.slice(0, 10) + "..." : null,
    hasToken: config.hasToken,
  });
});

// POST /api/triage-intake/config — set spreadsheet ID and token
triageIntakeRouter.post("/config", async (c) => {
  const body = await c.req.json();
  const { spreadsheetId, accessToken } = body;
  if (!spreadsheetId) return c.json({ error: "spreadsheetId required" }, 400);
  setTriageIntakeConfig(spreadsheetId, accessToken || GOOGLE_ACCESS_TOKEN);
  return c.json({ success: true, spreadsheetId: spreadsheetId.slice(0, 10) + "..." });
});

// POST /api/triage-intake/pull — manual pull from sheet
triageIntakeRouter.post("/pull", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const result = await pullTriageFromSheet(body.columnMap);
    return c.json({ success: true, ...result });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// GET /api/triage-intake/queue — list current queue (for dashboard)
triageIntakeRouter.get("/queue", async (c) => {
  const db = getDb();
  const status = c.req.query("status") || "pending";
  const limit = parseInt(c.req.query("limit") || "50");
  
  const items = await db.select().from(triageQueue)
    .where(status === "all" ? undefined : eq(triageQueue.status, status))
    .orderBy(desc(triageQueue.createdAt))
    .limit(limit);
  
  return c.json({ items, count: items.length });
});

// POST /api/triage-intake/assign — assign client to queue item
triageIntakeRouter.post("/assign", async (c) => {
  const body = await c.req.json();
  const { id, clientId, reviewerNotes } = body;
  if (!id || !clientId) return c.json({ error: "id and clientId required" }, 400);
  
  const db = getDb();
  await db.update(triageQueue).set({
    assignedClientId: clientId,
    status: "ready_to_approve",
    reviewerNotes: reviewerNotes || null,
    updatedAt: new Date(),
  }).where(eq(triageQueue.id, id));
  
  return c.json({ success: true });
});

// POST /api/triage-intake/approve — approve and mark ready to post
triageIntakeRouter.post("/approve", async (c) => {
  const body = await c.req.json();
  const { id, notes } = body;
  if (!id) return c.json({ error: "id required" }, 400);
  
  const db = getDb();
  await db.update(triageQueue).set({
    status: "approved",
    reviewerNotes: notes || null,
    updatedAt: new Date(),
  }).where(eq(triageQueue.id, id));
  
  return c.json({ success: true });
});
