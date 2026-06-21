/**
 * FIGGY JR — CLIENT ACTIVATION / ENRICHMENT (shared)
 * =============================================================================
 * Markie's model (2026-06-21): a website inquiry becomes a LEAD (Leads tab only).
 * The government-registry lookup + promotion to the Client Master sheet happens
 * ONLY once the client is signed + marked ACTIVE — not while they're a lead.
 *
 * One shared path so onboarding (staff adds an active client) and the workflow
 * pipeline (lead → active) behave identically:
 *   - enrichClientFromRegistry: live gov-registry lookup, fills BLANK fields only.
 *   - activateAndSyncClient: enrich, then upsert into the Client Master tab and
 *     mark the lead's Leads-tab row "Won" (audit trail; it now lives in both).
 * All best-effort + async-safe: never throws into a request path.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq } from "drizzle-orm";
import { lookupGovRegistry } from "./gov-registry-lookup";
import { syncClientToMaster, syncLeadToMaster } from "./master-sheet-sync";

const blank = (v: any) => v === null || v === undefined || v === "";

/** Live gov-registry lookup → fill only blank registry/bio fields on the card.
 *  Returns the list of fields written (empty if nothing/disabled/failed). */
export async function enrichClientFromRegistry(clientId: number): Promise<string[]> {
  const db = getDb();
  try {
    const c = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
    if (!c) return [];
    const hit = await lookupGovRegistry(c.name, { province: c.province, knownBn: c.taxId });
    if (!hit) return [];
    const patch: Record<string, any> = { updatedAt: new Date() };
    const take = (k: string, v?: string) => { if (v && blank(c[k])) patch[k] = v; };
    take("bio", hit.bio); take("registryNumber", hit.registryNumber);
    take("incorporationDate", hit.incorporationDate); take("corpType", hit.corpType);
    take("governmentStatus", hit.governmentStatus); take("website", hit.website?.toLowerCase());
    take("address", hit.address); take("phone", hit.phone);
    if (hit.industry && (blank(c.industry) || c.industry === "other")) patch.industry = hit.industry;
    if (hit.craBusinessNumber && blank(c.taxId)) {
      patch.taxId = hit.craBusinessNumber;
      if (c.hasHST && blank(c.hstNumber)) patch.hstNumber = `${hit.craBusinessNumber}RT0001`;
    }
    const fields = Object.keys(patch).filter((k) => k !== "updatedAt");
    if (fields.length) await db.update(clients).set(patch).where(eq(clients.id, clientId));
    return fields;
  } catch (e) {
    console.error("[activation] enrich failed for client", clientId, ":", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Promote a client to the Client Master sheet (after activation): enrich from
 *  the registry, sync the finished record to Client Master, and stamp the lead's
 *  Leads-tab row as Won. Fire-and-forget safe. */
export async function activateAndSyncClient(clientId: number): Promise<void> {
  const db = getDb();
  await enrichClientFromRegistry(clientId);
  try {
    let c = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
    if (!c) return;
    // Auto-provision the Figgy triage email on activation (like task generation):
    //   markie+<clientslug>@gofig.ca  — only if one isn't set yet.
    const slug = String(c.name || c.company || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (blank(c.figgyEmail) && slug) {
      const figgyEmail = `markie+${slug}@gofig.ca`;
      await db.update(clients).set({ figgyEmail, updatedAt: new Date() }).where(eq(clients.id, clientId));
      c = { ...c, figgyEmail };
    }
    syncClientToMaster(c);
    // Mark the originating lead row Won so the Leads tab keeps an audit trail.
    syncLeadToMaster({ ...c, workflowStatus: "won" });
  } catch (e) {
    console.error("[activation] sync failed for client", clientId, ":", e instanceof Error ? e.message : e);
  }
}

/** Fire-and-forget wrapper. */
export function activateClientAsync(clientId: number): void {
  activateAndSyncClient(clientId).catch(() => {});
}
