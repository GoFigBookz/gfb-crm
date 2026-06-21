/**
 * FIGGY JR — INBOUND SHEET → CRM SYNC (the other half of bidirectional)
 * =============================================================================
 * Markie's requirement: "if the CRM crashes we can still work in the Sheets and
 * it syncs back." Outbound (CRM→sheet) runs immediately on every CRM change
 * (master-sheet-sync.ts). This is the INBOUND direction: a scheduled job reads
 * the canonical master tabs and applies edits made in the sheet back into the CRM.
 *
 * Both directions ride the SAME committed Make webhook proxy (GET to read here,
 * PUT/POST to write outbound) — the server can't reach Google directly.
 *
 * CONFLICT MODEL (last-writer-wins, safe): outbound fires the instant the CRM
 * changes, so the sheet is always current with CRM edits → an inbound pull won't
 * revert them. Inbound only APPLIES NON-EMPTY sheet cells that DIFFER from the CRM
 * (an empty cell never wipes CRM data), so a human editing the sheet propagates in
 * on the next pull. Matches existing clients by CRA BN, else exact name; a brand-new
 * row (someone added a client/lead straight in the sheet) is CREATED in the CRM.
 *
 * Best-effort + defensive: any failure logs and returns counts; never throws.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients, clientOnboarding, workflowLogs } from "../db/schema";
import { eq } from "drizzle-orm";
import { readMasterRange, syncLeadToMaster } from "./master-sheet-sync";

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (v: any): string => { const s = String(v ?? "").trim(); return /^(n\/?a|none|null)$/i.test(s) ? "" : s; };

function cadenceIn(v: string): string | null {
  const s = v.toLowerCase();
  if (!s) return null;
  if (s.includes("month")) return "monthly";
  if (s.includes("quart") || s.includes("qrtly")) return "quarterly";
  if (s.includes("annual") || s.includes("year")) return "annual";
  return null;
}
function payIn(v: string): string | null {
  const s = v.toLowerCase().replace(/\s+/g, "-");
  if (!s) return null;
  if (s.includes("bi-week")) return "bi-weekly";
  if (s.includes("week")) return "weekly";
  if (s.includes("semi")) return "semi-monthly";
  if (s.includes("month")) return "monthly";
  if (s.includes("self")) return "self";
  return null;
}
function remitIn(v: string): string | null {
  const s = v.toLowerCase();
  if (!s) return null;
  if (s.includes("threshold") || s.includes("acceler")) return "accelerated";
  if (s.includes("quart")) return "quarterly";
  if (s.includes("regular")) return "regular";
  return null;
}
function statusIn(v: string): string | null {
  const s = v.toLowerCase().trim();
  return ["active", "inactive", "prospect", "lead"].includes(s) ? s : null;
}

/** Pull the Client Master tab into the CRM. Updates matched clients (by BN, else
 *  name) with non-empty differing sheet values; creates a client for new rows. */
export async function pullClientMasterIntoCrm(): Promise<{ scanned: number; updated: number; created: number }> {
  const db = getDb();
  const report = { scanned: 0, updated: 0, created: 0 };
  const rows = await readMasterRange("'Client Master'!A2:Z200");
  if (!rows.length) return report;

  const all = (await db.select().from(clients)).map((c: any) => ({ ...c }));
  const byBn = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const c of all) { if (c.taxId) byBn.set(norm(c.taxId), c); byName.set(norm(c.name), c); if (c.company) byName.set(norm(c.company), c); }

  for (const r of rows) {
    const name = clean(r[0]);
    if (!name) continue;
    report.scanned++;
    const bn = clean(r[3]);
    const match = (bn && byBn.get(norm(bn))) || byName.get(norm(name));

    // Build the sheet's view of the editable fields (only non-empty cells).
    const sv: Record<string, any> = {};
    const set = (k: string, v: any) => { if (v !== null && v !== undefined && v !== "") sv[k] = v; };
    set("name", name);
    set("status", statusIn(clean(r[1])));
    set("industry", clean(r[2]));
    set("taxId", bn);
    set("registryNumber", clean(r[4]));
    set("incorporationDate", clean(r[5]));
    set("corpType", clean(r[6]));
    set("governmentStatus", clean(r[7]));
    set("yearEndMonth", clean(r[9]) || null);
    const hstP = cadenceIn(clean(r[10])); if (hstP) { sv.hstPeriod = hstP; sv.hasHST = true; }
    set("hstNextDue", clean(r[11]));
    set("hstNumber", clean(r[12]));
    const payF = payIn(clean(r[13])); if (payF) { sv.payrollFrequency = payF; sv.hasPayroll = true; }
    const remit = remitIn(clean(r[14])); if (remit) sv.payrollRemitterFreq = remit;
    set("payrollRpNumber", clean(r[15]));
    const wsib = clean(r[16]); if (wsib) { sv.wsibAccountNumber = wsib; sv.hasWSIB = true; }
    set("address", clean(r[19]));
    set("phone", clean(r[20]));
    set("email", clean(r[21]));
    set("website", clean(r[22]));
    set("contactName", clean(r[23]));
    set("figgyEmail", clean(r[24]));
    set("bio", clean(r[25]));

    if (match) {
      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(sv)) {
        if (k === "yearEndMonth" && !v) continue;
        if (String(match[k] ?? "") !== String(v ?? "")) patch[k] = v;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = new Date();
        await db.update(clients).set(patch).where(eq(clients.id, match.id));
        report.updated++;
      }
    } else {
      // A client added straight into the sheet → create it in the CRM.
      const ins = await db.insert(clients).values({
        userId: 1, name, email: sv.email || "", company: sv.name || name,
        status: (sv.status as any) || "active", workflowStatus: "active", assignedTo: "Markie",
        ...sv, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning({ id: clients.id });
      if (ins[0]?.id) report.created++;
    }
  }
  return report;
}

/** Pull the Leads tab into the CRM. Matches by CRM Lead ID (col N) else email;
 *  updates lead fields, creates a lead for a new row, then stamps the CRM id back
 *  onto the sheet so future pulls match cleanly. */
export async function pullLeadsIntoCrm(): Promise<{ scanned: number; updated: number; created: number }> {
  const db = getDb();
  const report = { scanned: 0, updated: 0, created: 0 };
  const rows = await readMasterRange("'Leads'!A2:N500");
  if (!rows.length) return report;

  const all = (await db.select().from(clients)).map((c: any) => ({ ...c }));
  const byId = new Map<number, any>(all.map((c: any) => [c.id, c]));
  const byEmail = new Map<string, any>();
  for (const c of all) if (c.email) byEmail.set(norm(c.email), c);

  for (const r of rows) {
    const leadName = clean(r[1]);
    const business = clean(r[2]);
    if (!leadName && !business) continue;
    report.scanned++;
    const email = clean(r[3]);
    const crmId = Number(clean(r[13])) || 0;
    const match = (crmId && byId.get(crmId)) || (email && byEmail.get(norm(email)));

    const sv: Record<string, any> = {};
    const set = (k: string, v: any) => { if (v !== null && v !== undefined && v !== "") sv[k] = v; };
    set("name", leadName || business);
    set("company", business);
    set("email", email);
    set("phone", clean(r[4]));
    set("website", clean(r[5]));
    set("painPoints", clean(r[6]));
    set("leadSource", clean(r[7]));
    const ws = clean(r[8]); if (ws && ws !== "won") sv.workflowStatus = ws;
    const ev = Number(clean(r[9])); if (!isNaN(ev) && clean(r[9])) sv.estimatedMonthlyValue = ev;
    set("assignedTo", clean(r[10]));
    set("nextAction", clean(r[11]));
    set("notes", clean(r[12]));

    if (match) {
      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(sv)) if (String(match[k] ?? "") !== String(v ?? "")) patch[k] = v;
      if (Object.keys(patch).length) {
        patch.updatedAt = new Date();
        await db.update(clients).set(patch).where(eq(clients.id, match.id));
        report.updated++;
      }
    } else {
      const ins = await db.insert(clients).values({
        userId: 1, name: leadName || business, email: email || "", company: business || null,
        phone: sv.phone || null, website: sv.website || null,
        status: "lead", workflowStatus: (sv.workflowStatus as any) || "new_lead",
        leadSource: sv.leadSource || "sheet", painPoints: sv.painPoints || null,
        estimatedMonthlyValue: sv.estimatedMonthlyValue ?? null, assignedTo: sv.assignedTo || null,
        createdAt: new Date(), updatedAt: new Date(),
      } as any).returning({ id: clients.id });
      const id = ins[0]?.id;
      if (id) {
        report.created++;
        await db.insert(workflowLogs).values({
          clientId: id, fromStatus: null, toStatus: "new_lead",
          action: "lead_imported_from_sheet", notes: "Inbound sheet sync", createdAt: new Date(),
        });
        // Stamp the new CRM id back onto the sheet row (match by email next time).
        const lead = (await db.select().from(clients).where(eq(clients.id, id)).limit(1))[0];
        if (lead) syncLeadToMaster(lead as any);
      }
    }
  }
  return report;
}

/** Run both inbound pulls. Used on a schedule + manual trigger. */
export async function pullMasterIntoCrm(): Promise<{ clients: any; leads: any }> {
  let clientsRes: any = { scanned: 0, updated: 0, created: 0 };
  let leadsRes: any = { scanned: 0, updated: 0, created: 0 };
  try { clientsRes = await pullClientMasterIntoCrm(); }
  catch (e) { console.error("[inbound] client master pull failed:", e instanceof Error ? e.message : e); }
  try { leadsRes = await pullLeadsIntoCrm(); }
  catch (e) { console.error("[inbound] leads pull failed:", e instanceof Error ? e.message : e); }
  return { clients: clientsRes, leads: leadsRes };
}
