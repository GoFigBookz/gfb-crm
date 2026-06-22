/**
 * RBAC SCHEMA GUARD — idempotent, runs on boot before routers serve.
 * Adds users.restrictedToClients and the client_access grants table to the live
 * (persistent-volume) DB, which predates these columns. Mirrors ensure-clients-schema.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureRbacSchema(): Promise<void> {
  const db = getDb();
  // 1. users.restrictedToClients (default 0 = unrestricted, non-disruptive).
  try {
    const have = new Set<string>();
    const res: any = await db.run(sql`PRAGMA table_info(users)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    if (!have.has("restrictedToClients")) {
      await db.run(sql.raw(`ALTER TABLE users ADD COLUMN "restrictedToClients" integer DEFAULT 0 NOT NULL`));
    }
  } catch (e) {
    console.error("[rbac] ensure users.restrictedToClients failed:", e instanceof Error ? e.message : e);
  }
  // 2. client_access grants table.
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS client_access (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      clientId integer NOT NULL,
      createdAt integer
    )`);
  } catch (e) {
    console.error("[rbac] ensure client_access table failed:", e instanceof Error ? e.message : e);
  }
}
