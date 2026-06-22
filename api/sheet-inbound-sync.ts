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
import { readMasterRange, syncLeadToMaster, resolveColumns, MASTER_FIELDS } from "./master-sheet-sync";

const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (v: any): string => { const s = String(v ?? "").trim(); return /^(n\/?a|none|null)$/i.test(s) ? "" : s; };

/** Apply an onboarding-targeted patch (e.g. platform checkboxes) to a client's
 *  latest client_onboarding row — updating only changed fields; creating a minimal
 *  onboarding record if none exists. Best-effort; never throws. */
async function applyOnboardingPatch(db: any, clientId: number, patch: Record<string, any>): Promise<void> {
  if (!patch || Object.keys(patch).length === 0) return;
  try {
    const rows = await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, clientId)).orderBy(clientOnboarding.id);
    const latest = rows[rows.length - 1] as any;
    if (latest) {
      const diff: Record<string, any> = {};
      for (const [k, v] of Object.entries(patch)) if (Number(!!latest[k]) !== Number(!!v)) diff[k] = v;
      if (Object.keys(diff).length) { diff.updatedAt = new Date(); await db.update(clientOnboarding).set(diff).where(eq(clientOnboarding.id, latest.id)); }
    } else {
      const { randomBytes } = await import("crypto");
      await db.insert(clientOnboarding).values({ clientId, token: "sheet-" + randomBytes(16).toString("hex"), status: "approved", ...patch, createdAt: new Date(), updatedAt: new Date() });
    }
  } catch (e) { console.error("[inbound] onboarding patch failed for client", clientId, ":", e instanceof Error ? e.message : e); }
}

/** Pull the Client Master tab into the CRM — HEADER-DRIVEN (columns resolved by
 *  header, same as outbound). Updates matched clients (by BN, else name) with
 *  non-empty differing sheet values; creates a client for a brand-new row. */
export async function pullClientMasterIntoCrm(): Promise<{ scanned: number; updated: number; created: number }> {
  const db = getDb();
  const report = { scanned: 0, updated: 0, created: 0 };
  const rows = await readMasterRange("'Client Master'!A1:AZ200");
  if (rows.length < 2) return report;
  const header = rows[0] || [];
  const cols = resolveColumns(header);
  const nameCol = cols.get("name") ?? 0;
  const bnCol = cols.get("craBn");

  const all = (await db.select().from(clients)).map((c: any) => ({ ...c }));
  const byBn = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const c of all) { if (c.taxId) byBn.set(norm(c.taxId), c); byName.set(norm(c.name), c); if (c.company) byName.set(norm(c.company), c); }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = clean(r[nameCol]);
    if (!name) continue;
    report.scanned++;
    const bn = bnCol != null ? clean(r[bnCol]) : "";

    // Build the sheet's view of editable fields (only non-empty cells), via the
    // shared field model's fromSheet parsers. Fields flagged `onb` target the
    // client_onboarding record (the platform checkboxes), not the clients row.
    const sv: Record<string, any> = { name };          // clients-table fields
    const onb: Record<string, any> = {};               // client_onboarding fields
    for (const f of MASTER_FIELDS) {
      const ci = cols.get(f.key); if (ci == null) continue;
      const raw = clean(r[ci]); if (!raw) continue;
      const patch = f.fromSheet(raw); if (!patch) continue;
      Object.assign(f.onb ? onb : sv, patch);
    }

    const match = (bn && byBn.get(norm(bn))) || byName.get(norm(name));
    if (match) {
      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(sv)) {
        if (String(match[k] ?? "") !== String(v ?? "")) patch[k] = v;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = new Date();
        await db.update(clients).set(patch).where(eq(clients.id, match.id));
        report.updated++;
      }
      await applyOnboardingPatch(db, match.id, onb);
    } else {
      // A client added straight into the sheet → create it in the CRM.
      const ins = await db.insert(clients).values({
        userId: 1, name, email: sv.email || "", company: sv.company || name,
        status: (sv.status as any) || "active", workflowStatus: "active", assignedTo: "Markie",
        ...sv, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning({ id: clients.id });
      if (ins[0]?.id) { report.created++; await applyOnboardingPatch(db, ins[0].id, onb); }
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
