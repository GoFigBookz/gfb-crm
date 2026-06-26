/**
 * FIRM REGISTERS SCHEMA GUARD — idempotent, runs on boot.
 * The three registers the Figgy Operating System names but the app didn't have:
 *   - decision    → Decision Register   (important decisions + rationale)
 *   - improvement → Improvement Register (process-improvement ideas, open/done)
 *   - prompt      → Prompt Library       (reusable prompts per agent)
 * One small table, distinguished by `kind`. Firm-wide (owner-scoped). Raw SQL so
 * it ports straight to Postgres. Kept separate from brain_records so register
 * text never leaks into Brain answer retrieval.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureRegistersSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS firm_registers (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      kind text NOT NULL,            -- 'decision' | 'improvement' | 'prompt'
      title text NOT NULL,
      body text,
      tags text,                     -- comma-separated (e.g. agent name, area)
      status text NOT NULL DEFAULT 'open',  -- improvements: open|done; others: open
      author text,                   -- who logged it (Markie or an agent name)
      active integer NOT NULL DEFAULT 1,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[registers] ensure table failed:", e instanceof Error ? e.message : e);
  }
}
