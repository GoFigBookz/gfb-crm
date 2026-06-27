/**
 * SMART MONEY schema guard — saved business opportunities (grants / WSIB / tax
 * credits / cost-saving / credit cards). Self-healing, idempotent (boot).
 * clientId is NULLABLE: null = Go Fig Bookz / Markie's own firm opportunities.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureOpportunitiesSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS client_opportunities (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer,                  -- NULL = the firm (Go Fig Bookz / Markie)
      category text NOT NULL,            -- grants | wsib | tax_credit | cost_saving | credit_card
      title text NOT NULL,
      summary text,
      estValue text,                     -- "up to $5,000" / "2% cash back" / "varies"
      eligibility text,
      url text,
      source text,
      status text NOT NULL DEFAULT 'suggested',  -- suggested | reviewing | applied | won | dismissed
      notes text,
      savedBy integer,
      createdAt integer,
      updatedAt integer
    )`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS client_opportunities_client ON client_opportunities (clientId, category)`);
  } catch (e) {
    console.error("[opportunities] ensure schema failed:", e instanceof Error ? e.message : e);
  }
}
