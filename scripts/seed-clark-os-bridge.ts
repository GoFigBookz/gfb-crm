/**
 * Register the bridged clients (Clark OS + Clark CW) via the Make bridge.
 * Idempotent. Run on the deployed CRM (needs data/crm.db + FIGGY_MAKE_API_TOKEN):
 *   FIGGY_MAKE_API_TOKEN=<make api token> \
 *   node --experimental-strip-types scripts/seed-clark-os-bridge.ts
 *
 * For each realm: find/create the CRM client, then upsert ONE active
 * qbo_connections row (transport=make_bridge) bound to that realm — the single
 * isolation boundary getConnectionForClient() resolves. bridgeUrl = that realm's
 * per-realm QBO tool scenario run endpoint. Clark OS and Clark CW never mix:
 * separate realms, separate scenarios, separate connections.
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "../api/queries/connection.ts";
import { clients, qboConnections } from "../db/schema.ts";

const REGION = process.env.FIGGY_MAKE_REGION || "us2";
const runUrl = (scenarioId: number) => `https://${REGION}.make.com/api/v2/scenarios/${scenarioId}/run`;

// Verified live 2026-06-11.
const BRIDGED = [
  { realmId: "9341456017349963", company: "Clark Pools and Spas Owen Sound Inc.", scenarioId: 5347484, email: "owensound@clarkpools.example" },
  { realmId: "13633946244024404", company: "Clark Pools and Spas Collingwood Inc", scenarioId: 5347489, email: "collingwood@clarkpools.example" },
];

async function main() {
  const db = getDb();
  if (!process.env.FIGGY_MAKE_API_TOKEN) console.warn("WARNING: FIGGY_MAKE_API_TOKEN not set — live reads will fail until it is.");

  for (const b of BRIDGED) {
    // 1) Find or create the CRM client.
    let client = (await db.select().from(clients).where(eq(clients.name, b.company)).limit(1))[0];
    if (!client) {
      [client] = await db.insert(clients).values({
        userId: 1, name: b.company, email: b.email, company: b.company, status: "active", workflowStatus: "active",
      }).returning();
      console.log(`Created client #${client.id} ${b.company}`);
    } else {
      console.log(`Found client #${client.id} ${b.company}`);
    }

    // 2) Upsert the bridge connection for this realm (idempotent by realmId).
    const existing = (await db.select().from(qboConnections).where(eq(qboConnections.realmId, b.realmId)).limit(1))[0];
    const patch = {
      userId: 1, realmId: b.realmId, companyName: b.company, environment: "production" as const,
      transport: "make_bridge" as const, bridgeUrl: runUrl(b.scenarioId),
      accountType: "ca_clients" as const, clientId: client.id, isActive: true, updatedAt: new Date(),
    };
    if (existing) {
      await db.update(qboConnections).set(patch).where(eq(qboConnections.id, existing.id));
      console.log(`  Updated connection #${existing.id} -> make_bridge (scenario ${b.scenarioId}) -> client #${client.id}`);
    } else {
      const [conn] = await db.insert(qboConnections).values(patch).returning();
      console.log(`  Created connection #${conn.id} (bridge, scenario ${b.scenarioId}) -> client #${client.id}`);
    }

    // 3) Sanity: exactly one active connection for this client (isolation boundary).
    const active = await db.select().from(qboConnections).where(and(eq(qboConnections.clientId, client.id), eq(qboConnections.isActive, true)));
    console.log(`  Active connections for client #${client.id}: ${active.length} (must be 1)`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
