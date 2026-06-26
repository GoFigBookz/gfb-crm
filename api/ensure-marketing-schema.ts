/**
 * MARKETING (SKYE) SCHEMA GUARD — idempotent, runs on boot.
 * Skye's home: a per-platform cleanup/setup checklist + a content-post pipeline.
 * Firm-level. Raw SQL → Postgres-portable.
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureMarketingSchema(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS marketing_items (
      id integer PRIMARY KEY AUTOINCREMENT,
      kind text NOT NULL DEFAULT 'post',
      platform text,
      title text NOT NULL,
      body text,
      status text NOT NULL DEFAULT 'idea',
      scheduledFor text,
      archived integer NOT NULL DEFAULT 0,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) {
    console.error("[marketing] ensure table failed:", e instanceof Error ? e.message : e);
  }
}

/** Seed the platform cleanup checklist Markie named (idempotent — only if empty). */
export async function seedMarketing(): Promise<void> {
  const db = getDb();
  const have = (await db.all(sql`SELECT COUNT(*) AS n FROM marketing_items WHERE kind = 'platform'`)) as any[];
  if (Number(have[0]?.n || 0) > 0) return;
  const now = Date.now();
  const tasks: { platform: string; title: string }[] = [
    { platform: "linkedin", title: "Clean up LinkedIn profile + company page (bio, banner, services)" },
    { platform: "linkedin", title: "Start a regular LinkedIn posting cadence" },
    { platform: "proadvisor", title: "Clean up Intuit ProAdvisor profile (services, badge, reviews)" },
    { platform: "instagram", title: "Clean up Instagram (bio, highlights, grid)" },
    { platform: "instagram", title: "Start Instagram postings" },
    { platform: "facebook", title: "Clean up Facebook business page" },
    { platform: "facebook", title: "Start Facebook postings" },
    { platform: "website", title: "Reposition website — drop 'small business' wording (decide new positioning/tagline)" },
    { platform: "google", title: "Claim / tidy Google Business Profile" },
  ];
  for (const t of tasks) {
    await db.run(sql`INSERT INTO marketing_items (kind, platform, title, status, createdAt, updatedAt)
      VALUES ('platform', ${t.platform}, ${t.title}, 'todo', ${now}, ${now})`);
  }
  console.log(`[marketing] seeded ${tasks.length} platform tasks`);
}
