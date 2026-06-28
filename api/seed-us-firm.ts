/**
 * US FIRM STRUCTURE — Go Fig Bookz USA + its US clients (Markie, 2026-06-28).
 * =============================================================================
 * Markie: "Go Fig Bookz USA is definitely my firm and needs to be tracked separately.
 * Universal Drywall and Unimax are US clients — treat them as US clients under that firm."
 *
 * This idempotent reconciler:
 *  1. Ensures a "Go Fig Bookz USA" CRM client exists (US, us_clients, its own card).
 *     Once it exists, the relink sweep auto-binds the orphaned QBO realm
 *     "Go Fig Bookz USA" (#17) to it — the Canadian firm is already taken, so the new
 *     US entity is the unique match.
 *  2. Marks Universal Drywall + Unimax as US clients (country US, us_clients) grouped
 *     under the US firm so they surface together.
 *  3. Tags the US realms' connection accountType = us_clients.
 *
 * isFirm = true: Go Fig Bookz USA is its OWN firm (different income, issues, taxes), not
 * a client and not part of the Canadian firm. Practice Health now supports multiple firms
 * (one per country) and the US firm anchors its own US view. seedFirmClient manages the
 * Canadian firm only and never clears a US firm's flag.
 * Safe: idempotent, name-matched (exactly-one), only creates the one missing entity.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients, qboConnections } from "../db/schema";
import { eq } from "drizzle-orm";

const US_FIRM_NAME = "Go Fig Bookz USA";
const US_FIRM_GROUP = "Go Fig Bookz USA";
const US_FIRM_REALM = "123145947533149"; // the QBO realm shown as "Go Fig Bookz USA"

export interface UsFirmOutcome {
  firmClientId: number | null;
  firmCreated: boolean;
  reclassified: Array<{ id: number; name: string }>;
  notes: string[];
}

export async function ensureUsFirmStructure(): Promise<UsFirmOutcome> {
  const db = getDb();
  const out: UsFirmOutcome = { firmClientId: null, firmCreated: false, reclassified: [], notes: [] };
  try {
    const cs = (await db.select().from(clients)) as any[];

    // 1) Find or create the Go Fig Bookz USA client. Match a go-fig name that ALSO
    //    says USA/US, so we never grab the Canadian firm.
    const usFirm = cs.find((c) => /g[o0]\s*fig|gofig|fig\s*b[o0]{1,2}kz|figbook/i.test(c.name || "") && /\b(usa|u\.s\.a?|united states)\b/i.test(`${c.name || ""} ${c.company || ""}`));
    let firmId = usFirm?.id ?? null;
    if (!firmId) {
      const userId = cs[0]?.userId ?? 1;
      const inserted = (await db.insert(clients).values({
        userId, name: US_FIRM_NAME, company: US_FIRM_NAME, status: "active",
        clientType: "monthly", country: "US", qboAccountType: "us_clients",
        groupName: US_FIRM_GROUP, hasHST: false, isFirm: true,
      } as any).returning()) as any[];
      firmId = inserted[0]?.id ?? null;
      out.firmCreated = true;
      out.notes.push(`Created "${US_FIRM_NAME}" client (id ${firmId}).`);
      console.log(`[us-firm] created "${US_FIRM_NAME}" client id ${firmId}`);
    } else {
      // Make sure it carries the US classification + group AND is its own firm entity.
      await db.update(clients).set({ country: "US", qboAccountType: "us_clients", groupName: US_FIRM_GROUP, isFirm: true, updatedAt: new Date() } as any).where(eq(clients.id, firmId));
    }
    out.firmClientId = firmId;

    // 2) Reclassify the US clients (distinctive substring = unambiguous; never matches
    //    "Universal Construction Group", which has no "drywall").
    const usClientTargets: Array<{ re: RegExp; label: string }> = [
      { re: /drywall/i, label: "Universal Drywall" },
      { re: /unimax/i, label: "Unimax" },
    ];
    for (const t of usClientTargets) {
      const hits = cs.filter((c) => t.re.test(`${c.name || ""} ${c.company || ""}`) && c.id !== firmId);
      if (hits.length === 0) { out.notes.push(`No CRM client matched ${t.label} — skipped.`); continue; }
      if (hits.length > 1) { out.notes.push(`Ambiguous: ${t.label} matched ${hits.length} clients — left as-is.`); continue; }
      const c = hits[0];
      await db.update(clients).set({ country: "US", qboAccountType: "us_clients", groupName: US_FIRM_GROUP, updatedAt: new Date() } as any).where(eq(clients.id, c.id));
      out.reclassified.push({ id: c.id, name: c.name });
      console.log(`[us-firm] reclassified ${c.name} (id ${c.id}) -> US / us_clients / group "${US_FIRM_GROUP}"`);
    }

    // 3) Tag the US realms' connection accountType so the multi-account model is correct.
    //    (The clientId bind for the firm realm happens in the relink sweep that runs next.)
    try {
      const usRealms = [US_FIRM_REALM, "9130357660929466" /* Unimax Construction Group LLC */];
      for (const realm of usRealms) {
        const conn = (await db.select().from(qboConnections).where(eq(qboConnections.realmId, realm)).limit(1))[0] as any;
        if (conn && conn.accountType !== "us_clients") {
          await db.update(qboConnections).set({ accountType: "us_clients", updatedAt: new Date() }).where(eq(qboConnections.id, conn.id));
        }
      }
    } catch (e) { out.notes.push(`connection accountType tag skipped: ${e instanceof Error ? e.message : e}`); }
  } catch (e) {
    console.error("[us-firm] ensureUsFirmStructure failed (non-fatal):", e instanceof Error ? e.message : e);
    out.notes.push(`error: ${e instanceof Error ? e.message : e}`);
  }
  return out;
}
