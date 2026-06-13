/**
 * BRIDGE BOOTSTRAP — self-configures the live QBO bridge on startup.
 *
 * Transport = Make's scenario-RUN API (responsive) against the per-realm QBO tool
 * scenarios (Clark OS 5347484 / Clark CW 5347489) — proven to return QBO JSON
 * synchronously. (The earlier webhook approach returned async "Accepted" and is
 * abandoned.) Needs one env var: FIGGY_MAKE_API_TOKEN. Native per-realm OAuth is
 * the permanent replacement.
 */
import { getDb } from "./queries/connection";
import { clients, qboConnections } from "../db/schema";
import { eq, sql } from "drizzle-orm";

// TRANSPORT = no-token Make WEBHOOK PROXIES (read-only, GET-only) I built in
// team 2327575. Each is an instant webhook scenario:
//   CustomWebHook (parses {url,method,qs_query,body}) -> quickbooks:MakeApiCall
//   (that realm's connection, method=GET) -> WebhookRespond {{2.body}} (200).
// The WebhookRespond module makes the call SYNCHRONOUS, so the CRM gets the bare
// QBO JSON back on the same request — no Make API token, no env var. The hook
// UDIDs are capability secrets committed here (private repo) so go-live is truly
// zero-touch. `qboRequestViaMake` auto-detects the hook.* host and POSTs the flat
// {url,method,qs_query,body} with no auth. (The earlier scenario-RUN API path
// needed FIGGY_MAKE_API_TOKEN — abandoned in favour of these. Native per-realm
// OAuth remains the permanent replacement.)
const BRIDGED = [
  { realmId: "9341456017349963", company: "Clark Pools and Spas Owen Sound Inc.", match: "owen sound", bridgeUrl: "https://hook.us2.make.com/zwooriouroqy1hiqrfwfjueni6ju1uq6" }, // hook 2441572 / scenario 5359685 / conn 9302460
  { realmId: "13633946244024404", company: "Clark Pools and Spas Collingwood Inc", match: "collingwood", bridgeUrl: "https://hook.us2.make.com/2s1inh9yfy749c3o42yx6bm4hohfios3" }, // hook 2441594 / scenario 5359734 / conn 9291854
];

async function ensureColumns(db: any): Promise<void> {
  // Find existing columns first (don't rely on catching "duplicate column").
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(qbo_connections)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) { console.error("[bridge] table_info(qbo_connections) failed:", e instanceof Error ? e.message : e); }

  // Add nullable columns (NOT NULL on ALTER is what was failing on the live DB).
  // The schema marks them notNull for types; the DEFAULT covers existing rows.
  // clientId was ALSO missing on the live table — without it every connection
  // lookup (which selects clientId) crashed.
  const adds: Array<[string, any]> = [
    ["clientId", sql`ALTER TABLE qbo_connections ADD COLUMN "clientId" integer`],
    ["transport", sql`ALTER TABLE qbo_connections ADD COLUMN transport text DEFAULT 'native'`],
    ["bridgeUrl", sql`ALTER TABLE qbo_connections ADD COLUMN "bridgeUrl" text`],
    ["bridgeSecret", sql`ALTER TABLE qbo_connections ADD COLUMN "bridgeSecret" text`],
  ];
  for (const [col, stmt] of adds) {
    if (have.has(col)) continue;
    try { await db.run(stmt); console.log("[bridge] added column:", col); }
    catch (e) { console.error("[bridge] add column", col, "failed:", e instanceof Error ? e.message : e); }
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
        transport: "make_bridge" as const, bridgeUrl: b.bridgeUrl,
        accountType: "ca_clients" as const, clientId: client.id, isActive: true, updatedAt: new Date(),
      };
      if (existing) await db.update(qboConnections).set(patch).where(eq(qboConnections.id, existing.id));
      else await db.insert(qboConnections).values(patch);
      console.log(`[bridge] linked ${b.company} -> client #${client.id} (scenario-run API)`);
    }
  } catch (e) {
    console.error("[bridge] ensureBridgeReady failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
