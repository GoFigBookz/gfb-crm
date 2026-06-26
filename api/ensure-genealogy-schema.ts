/**
 * GENEALOGY SCHEMA GUARD — idempotent, runs on boot.
 * =============================================================================
 * Purpose:  Turn the simple `family_members` table into a real, confidence-rated
 *           family tree, and add the supporting tables for the monthly auto-scan
 *           and the shareable family page.
 * What it does:
 *   - ALTERs `family_members` to add tree + accuracy + media columns (each in a
 *     try/catch so re-running is a no-op once the column exists).
 *   - Creates `genealogy_findings`   — discoveries from the monthly web scan that
 *     wait in a review inbox (NEVER auto-merged — accuracy gate).
 *   - Creates `genealogy_scan_runs`  — one row per monthly run (idempotency +
 *     history; unique-ish by userId+period in code).
 *   - Creates `family_share_links`   — tokens for the read-only public family page.
 * Privacy:  All owner-scoped (userId); personal data, walled off from clients.
 * Portability: raw SQL, SQLite today / Postgres later.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureGenealogySchema(): Promise<void> {
  const db = getDb();
  const guard = async (name: string, ddl: any) => {
    try { await db.run(ddl); } catch (e) { console.error(`[genealogy] ensure ${name} failed:`, e instanceof Error ? e.message : e); }
  };

  // Extend family_members (the table already exists from ensurePhoenixSchema).
  for (const col of [
    "confidence integer",          // 0..100 honest accuracy estimate
    "proofLevel text",             // proven | likely | clue | wall
    "fatherId integer",            // tree link -> family_members.id
    "motherId integer",
    "generation integer",          // 0 self, 1 parents, 2 grandparents ...
    "gender text",                 // m | f | other (for tree layout)
    "maidenName text",
    "occupation text",
    "deathPlace text",
    "photoUrl text",               // direct image URL (if any)
    "photoFileId text",            // Google Drive file id (pulled from Phoenix Rising)
    "sources text",                // JSON array [{label,url,type}]
    "externalLinks text",          // JSON {ancestry,familySearch,findAGrave}
    "displayOrder integer",
  ]) {
    await guard(`family_members.${col}`, sql.raw(`ALTER TABLE family_members ADD COLUMN ${col}`));
  }

  await guard("genealogy_findings", sql`CREATE TABLE IF NOT EXISTS genealogy_findings (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    scanRunId integer,
    subjectName text NOT NULL,        -- who the finding is about
    relatedTo text,                   -- existing person it connects to
    suggestedMemberId integer,        -- existing family_members.id it would update
    kind text NOT NULL,               -- new_person | new_fact | relationship | photo | source | dna
    claim text NOT NULL,              -- the discovery, in plain English
    proofLevel text,                  -- proven | likely | clue | wall
    confidence integer,               -- 0..100
    sourceType text,                  -- FamilySearch | WikiTree | Find A Grave | NGB | census | DNA ...
    sourceUrl text,
    birthDate text,
    deathDate text,
    birthplace text,
    status text NOT NULL DEFAULT 'new', -- new | accepted | dismissed
    createdAt integer,
    reviewedAt integer
  )`);

  await guard("genealogy_scan_runs", sql`CREATE TABLE IF NOT EXISTS genealogy_scan_runs (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    period text NOT NULL,             -- YYYY-MM (one scan per month)
    status text NOT NULL DEFAULT 'running', -- running | done | error | skipped
    trigger text,                     -- monthly | manual
    targetsCount integer DEFAULT 0,
    findingsCount integer DEFAULT 0,
    summary text,
    error text,
    startedAt integer,
    finishedAt integer
  )`);

  await guard("family_share_links", sql`CREATE TABLE IF NOT EXISTS family_share_links (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    token text NOT NULL,
    label text,
    includePhotos integer NOT NULL DEFAULT 1,
    active integer NOT NULL DEFAULT 1,
    viewCount integer NOT NULL DEFAULT 0,
    createdAt integer,
    revokedAt integer
  )`);
}
