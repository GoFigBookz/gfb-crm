import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { connectedAccounts } from "../db/schema";
import { eq } from "drizzle-orm";

const SHEET_ID = "1lDtTggtV6YnGENYPXEZXng6gV2wclADGUgKqntWnql8";

async function getGoogleToken(db: any) {
  const rows = await db.select().from(connectedAccounts)
    .where(eq(connectedAccounts.provider, "google"))
    .limit(1);
  return rows[0]?.accessToken || null;
}

async function readSheet(accessToken: string, sheetId: string) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.values || [];
}

function parseSheetRows(values: any[][]): any[] {
  if (values.length < 2) return [];
  const headers = values[0].map((h: string) => h.toLowerCase().trim().replace(/\s+/g, "_"));
  const rows: any[] = [];
  for (let i = 1; i < values.length; i++) {
    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j] ?? null;
    }
    rows.push(row);
  }
  return rows;
}

export const makeIntakeRouter = createRouter({
  // Pull from Google Sheet (read-only — never edits the sheet)
  pollFromSheet: publicQuery
    .mutation(async () => {
      const db = getDb();
      const token = await getGoogleToken(db);
      if (!token) {
        return { success: false, error: "No Google account connected. Connect in Integrations first." };
      }

      const values = await readSheet(token, SHEET_ID);
      const rows = parseSheetRows(values);
      const now = new Date();
      let imported = 0;

      for (const row of rows) {
        const raw = JSON.stringify(row);
        const extract = (...keys: string[]) => {
          for (const k of keys) if (row[k] != null && row[k] !== "") return String(row[k]);
          return null;
        };

        const id      = extract("id", "entry_id", "make_id", "submission_id", "timestamp");
        const client  = extract("client", "client_name", "company", "customer");
        const contact = extract("name", "contact_name", "full_name", "submitter");
        const email   = extract("email", "email_address", "contact_email");
        const phone   = extract("phone", "phone_number", "contact_phone");
        const subject = extract("subject", "topic", "title", "description", "note", "message");
        const amount  = extract("amount", "total", "value", "cost");
        const vendor  = extract("vendor", "vendor_name", "supplier", "payee");
        const docType = extract("type", "document_type", "category", "form_type");
        const url     = extract("url", "link", "file_url", "drive_url", "attachment", "file_link");

        await db.run(sql`
          INSERT INTO make_intake (
            make_id, raw_payload,
            client_name, contact_name, email, phone,
            subject, amount, vendor, document_type, file_url,
            status, created_at, updated_at
          ) VALUES (
            ${id ?? null}, ${raw},
            ${client}, ${contact}, ${email}, ${phone},
            ${subject}, ${amount ? parseFloat(amount) || null : null}, ${vendor}, ${docType}, ${url},
            'new', ${now}, ${now}
          )
          ON CONFLICT DO NOTHING
        `);
        imported++;
      }

      return { success: true, imported, totalRows: rows.length };
    }),

  // Keep webhook for direct Make.com push as backup
  receive: publicQuery
    .input(z.record(z.any()))
    .mutation(async ({ input }) => {
      const db = getDb();
      const now = new Date();

      const raw = JSON.stringify(input);
      const extract = (keys: string[]): string | null => {
        for (const k of keys) {
          const v = input[k];
          if (v != null && v !== "") return String(v);
          for (const parent of Object.values(input)) {
            if (parent && typeof parent === "object" && !Array.isArray(parent)) {
              const nested = (parent as Record<string, any>)[k];
              if (nested != null && nested !== "") return String(nested);
            }
          }
        }
        return null;
      };

      const id       = input.id || input.ID || input.Id || input.entryId || null;
      const client   = extract(["client", "clientName", "client_name", "company", "Company", "customer", "Customer"]);
      const contact  = extract(["name", "contactName", "contact_name", "fullName", "full_name", "firstName", "first_name"]);
      const email    = extract(["email", "Email", "emailAddress", "email_address", "mail"]);
      const phone    = extract(["phone", "Phone", "phoneNumber", "phone_number", "tel"]);
      const subject  = extract(["subject", "Subject", "topic", "Topic", "title", "Title", "note", "Note", "message", "Message", "description", "Description"]);
      const amount   = extract(["amount", "Amount", "total", "Total", "value", "Value", "cost", "Cost"]);
      const vendor   = extract(["vendor", "Vendor", "vendorName", "vendor_name", "supplier", "Supplier", "payee", "Payee"]);
      const docType  = extract(["type", "Type", "documentType", "document_type", "category", "Category", "formType", "form_type"]);
      const url      = extract(["url", "URL", "link", "Link", "fileUrl", "file_url", "driveUrl", "drive_url", "attachment", "Attachment"]);

      await db.run(sql`
        INSERT INTO make_intake (
          make_id, raw_payload,
          client_name, contact_name, email, phone,
          subject, amount, vendor, document_type, file_url,
          status, created_at, updated_at
        ) VALUES (
          ${id ?? null}, ${raw},
          ${client}, ${contact}, ${email}, ${phone},
          ${subject}, ${amount ? parseFloat(amount) || null : null}, ${vendor}, ${docType}, ${url},
          'new', ${now}, ${now}
        )
      `);

      return { success: true, received: true };
    }),

  list: publicQuery
    .input(z.object({
      status: z.enum(["new", "reviewed", "approved", "rejected", "posted"]).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const filters = input || {};

      let whereClause = "";
      const params: any[] = [];

      if (filters.status) {
        whereClause = "WHERE status = ?";
        params.push(filters.status);
      }

      const rows = await db.all(sql.raw(
        `SELECT * FROM make_intake ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, filters.limit || 50, filters.offset || 0]
      ));

      return rows.map((r: any) => ({
        id: r.id,
        makeId: r.make_id,
        clientName: r.client_name,
        contactName: r.contact_name,
        email: r.email,
        phone: r.phone,
        subject: r.subject,
        amount: r.amount,
        vendor: r.vendor,
        documentType: r.document_type,
        fileUrl: r.file_url,
        status: r.status,
        notes: r.notes,
        assignedClientId: r.assigned_client_id,
        rawPayload: r.raw_payload,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }),

  get: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const row = await db.get(sql`SELECT * FROM make_intake WHERE id = ${input.id}`);
      if (!row) return null;
      return {
        id: row.id,
        makeId: row.make_id,
        clientName: row.client_name,
        contactName: row.contact_name,
        email: row.email,
        phone: row.phone,
        subject: row.subject,
        amount: row.amount,
        vendor: row.vendor,
        documentType: row.document_type,
        fileUrl: row.file_url,
        status: row.status,
        notes: row.notes,
        assignedClientId: row.assigned_client_id,
        rawPayload: row.raw_payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),

  update: publicQuery
    .input(z.object({
      id: z.number(),
      status: z.enum(["new", "reviewed", "approved", "rejected", "posted"]).optional(),
      notes: z.string().optional(),
      assignedClientId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const sets: string[] = [];
      const vals: any[] = [];

      if (input.status !== undefined) { sets.push("status = ?"); vals.push(input.status); }
      if (input.notes !== undefined) { sets.push("notes = ?"); vals.push(input.notes); }
      if (input.assignedClientId !== undefined) { sets.push("assigned_client_id = ?"); vals.push(input.assignedClientId); }
      sets.push("updated_at = ?"); vals.push(new Date());

      if (sets.length === 0) return { success: false, error: "Nothing to update" };

      await db.run(sql.raw(
        `UPDATE make_intake SET ${sets.join(", ")} WHERE id = ?`,
        [...vals, input.id]
      ));

      return { success: true };
    }),

  stats: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db.all(sql`
      SELECT status, COUNT(*) as count FROM make_intake GROUP BY status
    `);
    const counts: Record<string, number> = {};
    for (const r of rows as any[]) counts[r.status] = r.count;
    return {
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      new: counts["new"] || 0,
      reviewed: counts["reviewed"] || 0,
      approved: counts["approved"] || 0,
      rejected: counts["rejected"] || 0,
      posted: counts["posted"] || 0,
    };
  }),
});
