/**
 * QBO CONNECTION RELINK — I/O sweep over orphaned (clientId = null) connections.
 * For each active connection not bound to a CRM client, name-match it (isolation-safe,
 * exactly-one rule) and fill in clientId. NEVER overwrites an existing clientId. Runs
 * on boot (zero-touch on next deploy) and on demand via /api/qbo/relink. Read-mostly:
 * the only write is setting clientId on a previously-NULL connection.
 */
import { getDb } from "./queries/connection";
import { clients, qboConnections } from "../db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { matchConnectionToClient, type RelinkClient } from "./qbo-relink-core";

export interface RelinkOutcome {
  linked: Array<{ connectionId: number; companyName: string; clientId: number; clientName: string }>;
  ambiguous: Array<{ connectionId: number; companyName: string; candidates: string[] }>;
  unmatched: Array<{ connectionId: number; companyName: string }>;
}

export async function relinkUnmappedConnections(): Promise<RelinkOutcome> {
  const db = getDb();
  const out: RelinkOutcome = { linked: [], ambiguous: [], unmatched: [] };
  try {
    const allConns = await db.select().from(qboConnections);
    const orphans = (allConns as any[]).filter((c) => c.clientId == null && c.isActive);
    if (!orphans.length) return out;
    // A client that ALREADY has a connection must not get a second one (getConnectionForClient
    // treats 2+ as ambiguous → un-queryable). Exclude taken clients so a similar-named orphan
    // (e.g. "Go Fig Bookz USA" vs the firm) can't steal an already-bound client.
    const taken = new Set((allConns as any[]).filter((c) => c.clientId != null).map((c) => c.clientId));
    const allClients = ((await db.select({ id: clients.id, name: clients.name, company: clients.company, status: clients.status }).from(clients)) as RelinkClient[])
      .filter((c) => !taken.has(c.id));
    for (const conn of orphans as any[]) {
      const m = matchConnectionToClient(conn.companyName || "", allClients);
      if (m.result === "matched") {
        await db.update(qboConnections).set({ clientId: m.clientId, updatedAt: new Date() }).where(eq(qboConnections.id, conn.id));
        out.linked.push({ connectionId: conn.id, companyName: conn.companyName, clientId: m.clientId, clientName: m.clientName });
        console.log(`[qbo-relink] linked connection #${conn.id} (${conn.companyName}) -> client #${m.clientId} (${m.clientName})`);
      } else if (m.result === "ambiguous") {
        out.ambiguous.push({ connectionId: conn.id, companyName: conn.companyName, candidates: m.candidates });
        console.warn(`[qbo-relink] AMBIGUOUS connection #${conn.id} (${conn.companyName}) -> ${m.candidates.join(", ")} — left unlinked`);
      } else {
        out.unmatched.push({ connectionId: conn.id, companyName: conn.companyName });
      }
    }
  } catch (e) {
    console.error("[qbo-relink] sweep failed (non-fatal):", e instanceof Error ? e.message : e);
  }
  return out;
}
