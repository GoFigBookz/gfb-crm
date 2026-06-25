/**
 * CHAT HISTORY SCHEMA GUARD — idempotent, runs on boot.
 * Creates chat_messages AND backfills any column an older table is missing.
 * `CREATE TABLE IF NOT EXISTS` alone won't add columns, so a live DB with an
 * older chat_messages (e.g. no `agent`/`clientId`) would make BOTH the save
 * (insert) and the load (select of the full column list) throw — and the chat
 * would vanish on refresh. The ALTER backfill fixes that.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureChatSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS chat_messages (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      conversationId text NOT NULL,
      agent text,
      role text NOT NULL,
      content text NOT NULL,
      clientId integer,
      createdAt integer
    )`);
    const info: any = await db.run(sql.raw("PRAGMA table_info(chat_messages)"));
    const have = new Set<string>();
    for (const r of (info?.rows ?? info ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    const want: Array<[string, string]> = [["agent", "text"], ["clientId", "integer"], ["createdAt", "integer"]];
    for (const [col, type] of want) {
      if (!have.has(col)) {
        try { await db.run(sql.raw(`ALTER TABLE chat_messages ADD COLUMN "${col}" ${type}`)); } catch { /* exists */ }
      }
    }
  } catch (e) {
    console.error("[chat] ensure chat_messages failed:", e instanceof Error ? e.message : e);
  }
}
