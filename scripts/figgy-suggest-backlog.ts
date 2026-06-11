/**
 * STEP 3 — Run the Account Brain over a backlog of documents and post READ-ONLY,
 * traffic-lit suggestions into the Triage review queue. Posters stay OFF; this
 * NEVER writes to QBO — it only reads vendor history and inserts triage_findings.
 *
 * Usage (on deployed CRM, after seed-clark-os-bridge + bridge webhook live):
 *   node --experimental-strip-types scripts/figgy-suggest-backlog.ts <clientId> <candidates.json>
 * candidates.json = [{ "vendorName": "...", "invoiceNumber": "...", "total": 123.45,
 *                      "txnDate": "2026-05-12", "rowId": "RQ-001" }, ...]
 */
import { readFileSync } from "fs";
import { eq, and } from "drizzle-orm";
import { getDb } from "../api/queries/connection.ts";
import { qboConnections, triageFindings } from "../db/schema.ts";
import { ensureValidToken } from "../api/qbo-router.ts";
import { qboResolveVendor, qboVendorHistory } from "../api/qbo-vendor-brain.ts";
import { decideCoding, decideDedup } from "../api/qbo-vendor-brain-core.ts";

type Candidate = { vendorName: string; invoiceNumber?: string; total?: number; txnDate?: string; rowId?: string };

const triageToSeverity = { green: "info", yellow: "warning", red: "critical" } as const;

async function connForClient(clientId: number) {
  const db = getDb();
  const rows = await db.select().from(qboConnections).where(and(eq(qboConnections.clientId, clientId), eq(qboConnections.isActive, true)));
  if (rows.length === 0) throw new Error(`No active QBO connection for client ${clientId}`);
  if (rows.length > 1) throw new Error(`Ambiguous (${rows.length}) connections for client ${clientId} — refusing to guess`);
  return ensureValidToken(rows[0]);
}

async function postFinding(clientId: number, c: Candidate, fields: {
  triage: "green" | "yellow" | "red"; confidence: number; title: string; rationale: string;
  suggestedAccount?: string | null; suggestedAccountId?: string | null; suggestedTaxCode?: string | null; dedup?: any;
}) {
  const db = getDb();
  const sourceData = JSON.stringify({
    rowId: c.rowId, vendor: c.vendorName, amount: c.total, date: c.txnDate, invoiceNumber: c.invoiceNumber,
    triage: fields.triage, confidence: fields.confidence, rationale: fields.rationale,
    suggestedAccount: fields.suggestedAccount, suggestedAccountId: fields.suggestedAccountId,
    suggestedTaxCode: fields.suggestedTaxCode, dedup: fields.dedup ?? null,
  });
  // Dedup by rowId so re-runs don't pile up.
  if (c.rowId) {
    const dup = (await db.select().from(triageFindings).where(eq(triageFindings.sourceData, sourceData)).limit(1))[0];
    if (dup) return { id: dup.id, deduped: true };
  }
  const [row] = await db.insert(triageFindings).values({
    agentName: "Figgy Jr · Account Brain", agentVersion: "p0",
    clientId, findingType: "review", severity: triageToSeverity[fields.triage],
    title: fields.title, description: fields.rationale,
    suggestedAction: fields.suggestedAccount ? `Code to ${fields.suggestedAccount}` : "Needs an account",
    sourceData, confidence: fields.confidence / 100, status: "new",
  }).returning();
  return { id: row.id, deduped: false };
}

async function main() {
  const clientId = Number(process.argv[2]);
  const path = process.argv[3];
  if (!clientId || !path) { console.error("usage: figgy-suggest-backlog.ts <clientId> <candidates.json>"); process.exit(2); }
  const candidates: Candidate[] = JSON.parse(readFileSync(path, "utf8"));
  const conn = await connForClient(clientId);
  console.log(`Brain over ${candidates.length} docs for client #${clientId} (realm ${conn.realmId}, ${conn.transport})\n`);

  for (const c of candidates) {
    const resolution = await qboResolveVendor(conn, c.vendorName);
    if (resolution.status !== "resolved") {
      const r = await postFinding(clientId, c, { triage: "red", confidence: 0, title: `Vendor ${resolution.status}: ${c.vendorName}`, rationale: `Could not ${resolution.status === "ambiguous" ? "uniquely identify" : "find"} this vendor in QBO — needs a human to pick.` });
      console.log(`  🔴 ${c.vendorName}: vendor ${resolution.status} -> finding #${r.id}${r.deduped ? " (existing)" : ""}`);
      continue;
    }
    const since = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
    const history = await qboVendorHistory(conn, resolution.vendorId, since);
    const coding = decideCoding(history);
    const dedup = decideDedup({ invoiceNumber: c.invoiceNumber, total: c.total, txnDate: c.txnDate },
      history.map((h) => ({ docNumber: h.docNumber, amount: h.amount, date: h.date, txnId: h.txnId })));

    if (dedup.isDuplicate) {
      const r = await postFinding(clientId, c, { triage: "red", confidence: 99, title: `Possible duplicate: ${c.vendorName}`, rationale: `Looks like a duplicate of existing ${dedup.reason === "invoice_match" ? `invoice #${dedup.matchedDocNumber}` : "transaction"} (${dedup.reason}). Confirm before recording.`, dedup });
      console.log(`  🔴 ${c.vendorName}: DUPLICATE (${dedup.reason}) -> finding #${r.id}${r.deduped ? " (existing)" : ""}`);
      continue;
    }
    const emoji = coding.triage === "green" ? "🟢" : coding.triage === "yellow" ? "🟡" : "🔴";
    const r = await postFinding(clientId, c, {
      triage: coding.triage, confidence: coding.confidence,
      title: coding.status === "suggested" ? `Coding: ${c.vendorName} → ${coding.suggestedAccountName}` : `Needs decision: ${c.vendorName}`,
      rationale: coding.rationale, suggestedAccount: coding.suggestedAccountName,
      suggestedAccountId: coding.suggestedAccountId, suggestedTaxCode: coding.suggestedTaxCode,
    });
    console.log(`  ${emoji} ${c.vendorName}: ${coding.confidence}% ${coding.triage} -> finding #${r.id}${r.deduped ? " (existing)" : ""}`);
  }
  console.log("\nDone. Open Triage → New to review. Nothing was posted to QBO.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
