/**
 * FIRM (GO FIG BOOKZ) SELF-CLIENT SEED
 * =============================================================================
 * Go Fig Bookz is Markie's OWN firm and a client we book — a special "self"
 * client. This flags it `isFirm=1` so Practice Health can anchor on it (its own
 * QBO books = practice revenue / billed-vs-collected) while the client roster
 * counts exclude it.
 *
 * Defensive + idempotent:
 *  - MATCH FIRST by email (markie@gofig.ca) or a tolerant name regex (the name is
 *    often misspelled in the data — "Go Fig Bookz" / "GoFig" / numbered co.).
 *  - If a match is found, just set isFirm (and clear any stale isFirm on others).
 *  - Only CREATE the self-client when nothing matches, so we never dup a firm row
 *    that exists under a misspelled name.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq } from "drizzle-orm";
import { FIRM } from "./firm-settings";

const NAME_RE = /g[o0]\s*fig|gofig|fig\s*b[o0]{1,2}kz|figbook|12738988/i;
const FIRM_EMAIL = "markie@gofig.ca";

export async function seedFirmClient(): Promise<{ firmId: number | null; created: boolean } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const matches = cs.filter((c) => {
      const email = (c.email || "").toLowerCase();
      const name = c.name || "";
      return email === FIRM_EMAIL || NAME_RE.test(name);
    });

    // Prefer an already-flagged firm row; else the best name/email match.
    let firm = matches.find((c) => c.isFirm) || matches[0] || null;

    if (firm) {
      // Make sure exactly this one carries the flag.
      for (const c of cs) {
        if (c.isFirm && c.id !== firm.id) {
          await db.update(clients).set({ isFirm: false, updatedAt: new Date() } as any).where(eq(clients.id, c.id));
        }
      }
      if (!firm.isFirm) {
        await db.update(clients).set({ isFirm: true, updatedAt: new Date() } as any).where(eq(clients.id, firm.id));
        console.log(`[firm-client] flagged "${firm.name}" (id ${firm.id}) as the firm self-client`);
      }
      return { firmId: firm.id, created: false };
    }

    // Nothing matched — create the self-client from firm settings.
    const userId = cs[0]?.userId ?? 1;
    const inserted = (await db
      .insert(clients)
      .values({
        userId,
        name: FIRM.displayName,
        email: FIRM.email,
        phone: FIRM.phone,
        website: FIRM.website,
        company: FIRM.legalName,
        status: "active",
        clientType: "monthly",
        hstNumber: FIRM.hstNumber,
        hasHST: true,
        isFirm: true,
      } as any)
      .returning()) as any[];
    const id = inserted[0]?.id ?? null;
    console.log(`[firm-client] created firm self-client "${FIRM.displayName}" (id ${id})`);
    return { firmId: id, created: true };
  } catch (err) {
    console.error("[firm-client] failed:", err instanceof Error ? err.message : err);
  }
}
