import { getDb } from "./queries/connection";
import { clients } from "../db/schema";
import { eq } from "drizzle-orm";

/** The firm's triage email for a client: markie+<slug>@gofig.ca (Gmail plus-
 *  addressing → all land in Markie's inbox, filterable per client). */
export function figgyEmailFor(name: string): string {
  const slug = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `markie+${slug || "client"}@gofig.ca`;
}

/** Backfill a triage email onto every client that's missing one (idempotent;
 *  never overwrites an existing one). Covers clients created via paths that don't
 *  set it (generic create / E2E seed) so a triage email is always present. */
export async function seedTriageEmails(): Promise<{ set: number }> {
  const db = getDb();
  let set = 0;
  const all = (await db.select().from(clients)) as any[];
  for (const c of all) {
    if (c.figgyEmail && String(c.figgyEmail).trim()) continue;
    const email = figgyEmailFor(c.name || c.company || `client${c.id}`);
    try { await db.update(clients).set({ figgyEmail: email, updatedAt: new Date() }).where(eq(clients.id, c.id)); set++; }
    catch (e) { console.error("[triage-email] set failed for", c.id, ":", e instanceof Error ? e.message : e); }
  }
  return { set };
}
