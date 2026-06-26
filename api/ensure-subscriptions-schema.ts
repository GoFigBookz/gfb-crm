/**
 * FIRM SUBSCRIPTIONS SCHEMA GUARD — idempotent, runs on boot.
 * Markie's "what I bill vs what it costs me" ledger — per client/subscription
 * (Intuit ProAdvisor wholesale cost vs what he bills the client). Raw SQL.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureSubscriptionsSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS firm_subscriptions (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer,
      label text NOT NULL,
      provider text NOT NULL DEFAULT 'QuickBooks',
      tier text,
      monthlyCost real NOT NULL DEFAULT 0,
      monthlyBilled real NOT NULL DEFAULT 0,
      notes text,
      active integer NOT NULL DEFAULT 1,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[subscriptions] ensure table failed:", e instanceof Error ? e.message : e);
  }
}
