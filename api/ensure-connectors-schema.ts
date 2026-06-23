/**
 * CONNECTORS SCHEMA GUARD — idempotent, runs on boot.
 * The live connected_accounts table predates several columns the code selects
 * (accountLabel, providerAccountId, scopes, syncEnabled, …). A missing column
 * makes every `select()` on the table throw "no such column" — which broke the
 * TouchBistro import (and would hit Integrations/connectors too). This adds any
 * missing columns. Mirrors ensure-rbac-schema.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureConnectorsSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS connected_accounts (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      clientId integer,
      provider text NOT NULL,
      createdAt integer
    )`);
  } catch (e) {
    console.error("[connectors] ensure connected_accounts table failed:", e instanceof Error ? e.message : e);
  }
  try {
    const have = new Set<string>();
    const res: any = await db.run(sql`PRAGMA table_info(connected_accounts)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    const cols: [string, string][] = [
      ["providerAccountId", "text"],
      ["accountLabel", "text DEFAULT 'Primary' NOT NULL"],
      ["accountEmail", "text"],
      ["accessToken", "text"],
      ["refreshToken", "text"],
      ["expiresAt", "integer"],
      ["scopes", "text"],
      ["isActive", "integer DEFAULT 1 NOT NULL"],
      ["syncEnabled", `text DEFAULT '{"email":true,"calendar":true,"files":true,"tasks":true}'`],
      ["lastSyncedAt", "integer"],
      ["createdAt", "integer"],
      ["updatedAt", "integer"],
    ];
    for (const [name, type] of cols) {
      if (have.has(name)) continue;
      try { await db.run(sql.raw(`ALTER TABLE connected_accounts ADD COLUMN "${name}" ${type}`)); }
      catch (e) { console.error(`[connectors] add column ${name} failed:`, e instanceof Error ? e.message : e); }
    }
  } catch (e) {
    console.error("[connectors] ensure connected_accounts columns failed:", e instanceof Error ? e.message : e);
  }
}
