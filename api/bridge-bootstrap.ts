/**
 * BRIDGE BOOTSTRAP — makes the live QBO bridge self-configure on startup so the
 * deployed CRM needs ZERO setup (no commands, no API token, no env vars).
 *
 * What it does on every boot (idempotent, safe):
 *  1) Ensures the 3 bridge columns exist on qbo_connections (additive ALTERs).
 *  2) Binds each Clark realm to its EXISTING CRM client (matched by city) via a
 *     make_bridge connection whose bridgeUrl is a READ-ONLY Make webhook proxy.
 *
 * The webhook proxy scenarios (Make, team 2327575) are GET-only — they can read
 * QBO but cannot write — and need no token (the unguessable hook URL is the
 * capability). This is the INTERIM transport; native per-realm OAuth replaces it
 * and is the permanent, more-secure path. Until then these URLs live in code so
 * go-live is truly zero-touch (repo is private; scenarios are read-only).
 *
 * Safety: never creates a client (no duplicates), never writes to QBO, idempotent
 * by realmId, opt-out via FIGGY_BRIDGE_DISABLE=on, and wrapped so a failure can
 * never crash the server.
 */
import { getDb } from "./queries/connection";
import { clients, qboConnections } from "../db/schema";
import { eq, sql } from "drizzle-orm";

// Verified live 2026-06-11. GET-only webhook proxies; `match` is a lowercase
// substring of the existing CRM client name/company.
const BRIDGED = [
  { realmId: "9341456017349963", company: "Clark Pools and Spas Owen Sound Inc.", match: "owen sound",
    webhookUrl: "https://hook.us2.make.com/zwooriouroqy1hiqrfwfjueni6ju1uq6" },   // scenario 5359685, conn 9302460
  { realmId: "13633946244024404", company: "Clark Pools and Spas Collingwood Inc", match: "collingwood",
    webhookUrl: "https://hook.us2.make.com/2s1inh9yfy749c3o42yx6bm4hohfios3" },  // scenario 5359734, conn 9291854
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
    if (process.env.FIGGY_BRIDGE_DISABLE === "on") {
      console.log("[bridge] FIGGY_BRIDGE_DISABLE=on — columns ready, bridge left dormant.");
      return;
    }
    const all = await db.select().from(clients);
    for (const b of BRIDGED) {
      const client = all.find((c: any) => `${c.name ?? ""} ${c.company ?? ""}`.toLowerCase().includes(b.match));
      if (!client) { console.warn(`[bridge] no CRM client matched "${b.match}" — skipping ${b.company}`); continue; }
      const existing = (await db.select().from(qboConnections).where(eq(qboConnections.realmId, b.realmId)).limit(1))[0];
      const patch = {
        userId: 1, realmId: b.realmId, companyName: b.company, environment: "production" as const,
        transport: "make_bridge" as const, bridgeUrl: b.webhookUrl,
        accountType: "ca_clients" as const, clientId: client.id, isActive: true, updatedAt: new Date(),
      };
      if (existing) await db.update(qboConnections).set(patch).where(eq(qboConnections.id, existing.id));
      else await db.insert(qboConnections).values(patch);
      console.log(`[bridge] linked ${b.company} -> client #${client.id} (read-only webhook proxy)`);
    }
  } catch (e) {
    console.error("[bridge] ensureBridgeReady failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
