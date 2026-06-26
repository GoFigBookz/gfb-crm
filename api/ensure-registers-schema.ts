/**
 * FIRM REGISTERS / KNOWLEDGE-ASSET LIBRARY SCHEMA GUARD — idempotent, runs on boot.
 * "Everything becomes a numbered, reusable asset" (Markie 2026-06-26):
 *   decision→DEC  improvement→IMP  prompt→PR  research→RES  system→SYS
 *   client_process→GF  idea→IDE  lesson→LL
 * Each row gets a typed code (e.g. DEC-0001). The Decision Register adds structured
 * reason / alternatives / outcome so "why did we decide X?" is answerable years later.
 * One table, distinguished by `kind`. Firm-wide (owner-scoped). Raw SQL.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureRegistersSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS firm_registers (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      kind text NOT NULL,            -- decision|improvement|prompt|research|system|client_process|idea|lesson
      code text,                     -- typed asset id, e.g. DEC-0001, RES-0042
      title text NOT NULL,
      body text,
      reason text,                   -- decisions: the rationale (why)
      alternatives text,             -- decisions: options considered
      outcome text,                  -- decisions: approved|rejected|deferred + note
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
  // Add the asset/decision columns to any pre-existing table (idempotent — ignore "duplicate column").
  for (const col of ["code text", "reason text", "alternatives text", "outcome text"]) {
    try { await db.run(sql.raw(`ALTER TABLE firm_registers ADD COLUMN ${col}`)); } catch { /* column already exists */ }
  }
}
