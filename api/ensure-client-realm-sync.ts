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
  autoLinked: number;
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

    // 1b) AUTO-LINK unbound connections to their client by an EXACT name match.
    // Connections made via OAuth carry the real QBO companyName; bind one to the
    // client whose name/company matches exactly (normalized). Exact + UNIQUE only
    // — never a fuzzy guess, so per-client isolation can't be crossed. Ambiguous
    // or no-match connections are left unbound for a human to map.
    const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const unbound = (await db.all(
      sql.raw(`SELECT id, realmId, companyName FROM qbo_connections WHERE isActive = 1 AND clientId IS NULL AND companyName IS NOT NULL AND companyName <> ''`),
    )) as any[];
    let autoLinked = 0;
    if (unbound.length) {
      const clientRows = (await db.all(sql.raw(`SELECT id, name, company FROM clients`))) as any[];
      // Build a normalized-name → [clientId] index (both name and company).
      const idx = new Map<string, Set<number>>();
      const add = (key: string, id: number) => { if (!key) return; const s = idx.get(key) || new Set<number>(); s.add(id); idx.set(key, s); };
      for (const c of clientRows) { add(norm(c.name), Number(c.id)); add(norm(c.company), Number(c.id)); }
      for (const cn of unbound) {
        const key = norm(cn.companyName);
        const matches = idx.get(key);
        if (matches && matches.size === 1) {
          const clientId = [...matches][0];
          await db.run(sql.raw(`UPDATE qbo_connections SET clientId = ${clientId} WHERE id = ${Number(cn.id)}`));
          autoLinked += 1;
        }
      }
      if (autoLinked) console.log(`[realm-sync] auto-linked ${autoLinked} QBO connection(s) to clients by exact name match`);
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

    if (linked || autoLinked || ambiguous.length) {
      console.log(
        `[realm-sync] auto-linked ${autoLinked} connection(s); wrote realm onto ${linked} client(s); ${ambiguous.length} ambiguous; ${unmapped} active client(s) still unmapped`,
      );
    }
    return { linked, autoLinked, ambiguous, unmapped };
  } catch (e) {
    console.error("[realm-sync] failed:", e instanceof Error ? e.message : e);
  }
}
