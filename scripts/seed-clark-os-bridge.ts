/**
 * STEP 2 — Register Clark OS as a connected client via the Make bridge.
 * Idempotent. Run on the deployed CRM (needs data/crm.db + the bridge webhook):
 *   FIGGY_CLARKOS_BRIDGE_URL=https://hook.us2.make.com/xxxx \
 *   FIGGY_BRIDGE_SECRET=... \
 *   node --experimental-strip-types scripts/seed-clark-os-bridge.ts
 *
 * Creates/updates ONE active qbo_connections row (transport=make_bridge) bound
 * to the Clark OS realm and the CRM client — the single isolation boundary
 * getConnectionForClient() resolves. Never touches Clark CW.
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "../api/queries/connection.ts";
import { clients, qboConnections } from "../db/schema.ts";

const REALM_ID = "9341456017349963"; // Clark Pools and Spas Owen Sound Inc.
const COMPANY = "Clark Pools and Spas Owen Sound Inc.";
const BRIDGE_URL = process.env.FIGGY_CLARKOS_BRIDGE_URL || "";

async function main() {
  const db = getDb();

  // 1) Find or create the CRM client.
  let client = (await db.select().from(clients).where(eq(clients.name, COMPANY)).limit(1))[0];
  if (!client) {
    [client] = await db.insert(clients).values({
      userId: 1, name: COMPANY, email: "owensound@clarkpools.example", company: COMPANY,
      status: "active", workflowStatus: "active",
    }).returning();
    console.log(`Created client #${client.id} ${COMPANY}`);
  } else {
    console.log(`Found client #${client.id} ${COMPANY}`);
  }

  // 2) Upsert the bridge connection for this realm (idempotent by realmId).
  const existing = (await db.select().from(qboConnections).where(eq(qboConnections.realmId, REALM_ID)).limit(1))[0];
  const patch = {
    userId: 1, realmId: REALM_ID, companyName: COMPANY, environment: "production" as const,
    transport: "make_bridge" as const, bridgeUrl: BRIDGE_URL || null,
    accountType: "ca_clients" as const, clientId: client.id, isActive: true, updatedAt: new Date(),
  };
  if (existing) {
    await db.update(qboConnections).set(patch).where(eq(qboConnections.id, existing.id));
    console.log(`Updated connection #${existing.id} -> make_bridge, client #${client.id}`);
  } else {
    const [conn] = await db.insert(qboConnections).values(patch).returning();
    console.log(`Created connection #${conn.id} (Clark OS bridge) -> client #${client.id}`);
  }

  // 3) Sanity: exactly one active connection for this client (isolation boundary).
  const active = await db.select().from(qboConnections).where(and(eq(qboConnections.clientId, client.id), eq(qboConnections.isActive, true)));
  console.log(`Active connections for client #${client.id}: ${active.length} (must be 1)`);
  if (!BRIDGE_URL) console.warn("WARNING: FIGGY_CLARKOS_BRIDGE_URL not set — set it (or bridgeUrl) before live reads.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
