/**
 * CHAT HISTORY SCHEMA GUARD — idempotent, runs on boot.
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
  } catch (e) {
    console.error("[chat] ensure chat_messages failed:", e instanceof Error ? e.message : e);
  }
}
