/**
 * BRIDGE BOOTSTRAP — makes the live QBO bridge self-configure on startup so the
 * deployed CRM needs ZERO manual commands. Idempotent and safe to run every boot.
 *
 * What it does:
 *  1) Ensures the 3 bridge columns exist on qbo_connections (additive ALTERs).
 *  2) When FIGGY_MAKE_API_TOKEN is set (i.e. you're going live), binds each Clark
 *     realm to its EXISTING CRM client (matched by city) via a make_bridge
 *     connection.
 *
 * Safety: never creates a client (so it can't duplicate your client list), never
 * writes to QBO, idempotent by realmId, and wrapped so a failure can never crash
 * the server (logs and moves on).
 */
import { getDb } from "./queries/connection";
import { clients, qboConnections } from "../db/schema";
import { eq, sql } from "drizzle-orm";

const REGION = process.env.FIGGY_MAKE_REGION || "us2";
const runUrl = (scenarioId: number) => `https://${REGION}.make.com/api/v2/scenarios/${scenarioId}/run`;

// Verified live 2026-06-11. `match` is a lowercase substring of the existing
// CRM client's name/company (clients are "Clark Pools Owen Sound" / "...Collingwood").
const BRIDGED = [
  { realmId: "9341456017349963", company: "Clark Pools and Spas Owen Sound Inc.", scenarioId: 5347484, match: "owen sound" },
  { realmId: "13633946244024404", company: "Clark Pools and Spas Collingwood Inc", scenarioId: 5347489, match: "collingwood" },
];

async function ensureColumns(db: any): Promise<void> {
  for (const stmt of [
    "ALTER TABLE qbo_connections ADD COLUMN transport text DEFAULT 'native' NOT NULL",
    "ALTER TABLE qbo_connections ADD COLUMN bridgeUrl text",
    "ALTER TABLE qbo_connections ADD COLUMN bridgeSecret text",
  ]) {
    try { await db.run(sql.raw(stmt)); } catch { /* column already exists — fine */ }
  }
}

export async function ensureBridgeReady(): Promise<void> {
  const db = getDb();
  try {
    await ensureColumns(db);
    if (!process.env.FIGGY_MAKE_API_TOKEN) {
      console.log("[bridge] columns ready; FIGGY_MAKE_API_TOKEN not set — bridge stays dormant.");
      return;
    }
    const all = await db.select().from(clients);
    for (const b of BRIDGED) {
      const client = all.find((c: any) => `${c.name ?? ""} ${c.company ?? ""}`.toLowerCase().includes(b.match));
      if (!client) { console.warn(`[bridge] no CRM client matched "${b.match}" — skipping ${b.company}`); continue; }
      const existing = (await db.select().from(qboConnections).where(eq(qboConnections.realmId, b.realmId)).limit(1))[0];
      const patch = {
        userId: 1, realmId: b.realmId, companyName: b.company, environment: "production" as const,
        transport: "make_bridge" as const, bridgeUrl: runUrl(b.scenarioId),
        accountType: "ca_clients" as const, clientId: client.id, isActive: true, updatedAt: new Date(),
      };
      if (existing) await db.update(qboConnections).set(patch).where(eq(qboConnections.id, existing.id));
      else await db.insert(qboConnections).values(patch);
      console.log(`[bridge] linked ${b.company} -> client #${client.id} (scenario ${b.scenarioId})`);
    }
  } catch (e) {
    console.error("[bridge] ensureBridgeReady failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
