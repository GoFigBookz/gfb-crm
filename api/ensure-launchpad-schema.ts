/**
 * LAUNCHPAD SCHEMA GUARD — idempotent, runs on boot.
 * Markie's new + launched business opportunities (his own ventures pipeline),
 * scoped to the owner like Phoenix Rising. Raw SQL → Postgres-portable.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureLaunchpadSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS launchpad_opportunities (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer NOT NULL,
      name text NOT NULL,
      stage text NOT NULL DEFAULT 'idea',
      category text,
      notes text,
      nextStep text,
      potentialValue text,
      link text,
      pinned integer NOT NULL DEFAULT 0,
      archived integer NOT NULL DEFAULT 0,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[launchpad] ensure table failed:", e instanceof Error ? e.message : e);
  }
}

/** Seed Markie's launchpad ideas (idempotent by name). Markie 2026-06-28: add
 *  "QuickBooks Training" as a new revenue stream to park in the Launchpad. */
export async function seedLaunchpadIdeas(): Promise<void> {
  const db = getDb();
  try {
    const owner = (await db.all(sql`SELECT id FROM users WHERE email IN ('markie.antle@gmail.com','markie@gofig.ca') OR role = 'admin' ORDER BY (role = 'admin') DESC, id ASC LIMIT 1`)) as any[];
    const userId = owner[0]?.id;
    if (!userId) return;
    const ideas = [
      {
        name: "QuickBooks Training (new revenue stream)",
        category: "Revenue stream",
        notes: "Offer QuickBooks training as a paid service — onboarding new business owners, teaching staff to use QBO properly, fixing-then-teaching cleanup clients. Ties to the bookkeeping team manual + QBO manual already being built (reuse that content as the curriculum). Markie's idea 2026-06-28.",
        nextStep: "Decide format (1:1, group, recorded course) + pricing; build a curriculum from the QBO manual.",
        potentialValue: "recurring",
      },
    ];
    for (const o of ideas) {
      const exists = (await db.all(sql`SELECT id FROM launchpad_opportunities WHERE userId = ${userId} AND name = ${o.name} LIMIT 1`)) as any[];
      if (exists[0]) continue;
      const now = Date.now();
      await db.run(sql`INSERT INTO launchpad_opportunities (userId, name, stage, category, notes, nextStep, potentialValue, pinned, archived, createdAt, updatedAt)
        VALUES (${userId}, ${o.name}, 'idea', ${o.category}, ${o.notes}, ${o.nextStep}, ${o.potentialValue}, 0, 0, ${now}, ${now})`);
    }
  } catch (e) {
    console.error("[launchpad] seed ideas failed:", e instanceof Error ? e.message : e);
  }
}
