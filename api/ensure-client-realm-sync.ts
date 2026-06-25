/**
 * CLIENT ↔ QBO REALM ID SYNC (Markie, 2026-06-25).
 * =============================================================================
 * "We somehow lost the QuickBooks realm ID for all my clients. Find it, add it
 *  back on the client master, and sync it to their file properly."
 *
 * The realm IDs were never actually lost from the system — they live on
 * `qbo_connections.realmId` (Markie connected every client via OAuth). What went
 * missing is the realm ID being VISIBLE on each client's file/master list. This
 * guard denormalizes it back onto the client record so it shows everywhere and
 * can never silently disappear again — it's re-derived from the live connection
 * on every boot.
 *
 * For each ACTIVE QBO connection bound to a client:
 *   - write its realmId onto clients.qboRealmId
 *   - backfill clients.qboConnectionId if it's missing
 * Idempotent; only writes when a value actually changed. Per-client isolation is
 * preserved (one connection → one client; ambiguous clients are left untouched
 * and reported, never guessed).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

async function columnExists(db: any, table: string, column: string): Promise<boolean> {
  const info = await db.all(sql.raw(`PRAGMA table_info(${table})`));
  return (info as any[]).some((c) => c.name === column);
}

export async function ensureClientRealmSync(): Promise<{
  linked: number;
  ambiguous: number[];
  unmapped: number;
} | void> {
  try {
    const db = getDb();

    // 1) Make sure the column exists (self-heal schema drift).
    if (!(await columnExists(db, "clients", "qboRealmId"))) {
      await db.run(sql.raw(`ALTER TABLE clients ADD COLUMN qboRealmId text`));
      console.log("[realm-sync] added clients.qboRealmId column");
    }

    // 2) Pull active connections that are bound to a client.
    const conns = (await db.all(
      sql.raw(
        `SELECT id, realmId, clientId FROM qbo_connections WHERE isActive = 1 AND clientId IS NOT NULL`,
      ),
    )) as any[];

    // Group by client so we never guess when a client has 2+ active connections.
    const byClient = new Map<number, { id: number; realmId: string }[]>();
    for (const c of conns) {
      const cid = Number(c.clientId);
      if (!cid || !c.realmId) continue;
      const list = byClient.get(cid) || [];
      list.push({ id: Number(c.id), realmId: String(c.realmId) });
      byClient.set(cid, list);
    }

    let linked = 0;
    const ambiguous: number[] = [];
    for (const [clientId, list] of byClient) {
      if (list.length > 1) {
        // Distinct realms → genuinely ambiguous; leave it for a human. (Same
        // realm twice is fine — just use it.)
        const realms = new Set(list.map((l) => l.realmId));
        if (realms.size > 1) {
          ambiguous.push(clientId);
          continue;
        }
      }
      const { id: connId, realmId } = list[0];
      const res = await db.run(
        sql.raw(
          `UPDATE clients
             SET qboRealmId = '${realmId}',
                 qboConnectionId = COALESCE(qboConnectionId, ${connId})
           WHERE id = ${clientId}
             AND (qboRealmId IS NULL OR qboRealmId <> '${realmId}' OR qboConnectionId IS NULL)`,
        ),
      );
      if ((res as any)?.rowsAffected) linked += 1;
    }

    // 3) Count active clients still without a realm (so the UI can flag them).
    const unmappedRows = (await db.all(
      sql.raw(
        `SELECT COUNT(*) AS n FROM clients
          WHERE status = 'active' AND (qboRealmId IS NULL OR qboRealmId = '')
            AND clientType <> 'wholesale'`,
      ),
    )) as any[];
    const unmapped = Number(unmappedRows?.[0]?.n || 0);

    if (linked || ambiguous.length) {
      console.log(
        `[realm-sync] linked ${linked} client(s) to their QBO realm; ${ambiguous.length} ambiguous; ${unmapped} active client(s) still unmapped`,
      );
    }
    return { linked, ambiguous, unmapped };
  } catch (e) {
    console.error("[realm-sync] failed:", e instanceof Error ? e.message : e);
  }
}
