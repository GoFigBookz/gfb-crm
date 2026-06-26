/**
 * HEALTH HUB SCHEMA GUARD — idempotent, runs on boot.
 * =============================================================================
 * Purpose:  Markie's PRIVATE health hub (Phoenix Rising side). Owner-only,
 *           walled off from all client/firm data — like personal_items, these
 *           tables have NO clientId and are scoped strictly to userId.
 * Tables:   health_meds, health_supplements, health_vitals, health_labs,
 *           health_conditions.
 * Privacy:  Most sensitive PII in the app. Owner-scoped at every query. Future
 *           hardening: encrypt-at-rest (ties to the connector-key audit finding).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensureHealthSchema(): Promise<void> {
  const db = getDb();
  const guard = async (name: string, ddl: any) => {
    try { await db.run(ddl); } catch (e) { console.error(`[health] ensure ${name} failed:`, e instanceof Error ? e.message : e); }
  };

  await guard("health_meds", sql`CREATE TABLE IF NOT EXISTS health_meds (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    name text NOT NULL,
    dose text,                      -- e.g. "500 mg"
    schedule text,                  -- e.g. "twice daily with food"
    prescriber text,
    purpose text,                   -- what it's for
    startDate integer,
    active integer NOT NULL DEFAULT 1,
    notes text,
    createdAt integer,
    updatedAt integer
  )`);

  await guard("health_supplements", sql`CREATE TABLE IF NOT EXISTS health_supplements (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    name text NOT NULL,
    dose text,
    reason text,                    -- the symptom / why he takes (or should take) it
    taking integer NOT NULL DEFAULT 1,   -- 1 = currently taking, 0 = suggested/considering
    notes text,
    createdAt integer,
    updatedAt integer
  )`);

  await guard("health_vitals", sql`CREATE TABLE IF NOT EXISTS health_vitals (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    type text NOT NULL,             -- weight | glucose | bp_systolic | bp_diastolic | heart_rate | ...
    value real NOT NULL,
    unit text,                      -- lb/kg, mmol/L or mg/dL, mmHg, bpm
    measuredAt integer NOT NULL,
    source text DEFAULT 'manual',   -- manual | withings | dexcom | libre | ...
    notes text,
    createdAt integer
  )`);

  await guard("health_labs", sql`CREATE TABLE IF NOT EXISTS health_labs (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    panel text,                     -- e.g. "Lipid panel", "CBC"
    marker text NOT NULL,           -- e.g. "LDL", "HbA1c", "Vitamin D"
    value real,
    valueText text,                 -- for non-numeric results
    unit text,
    refLow real,
    refHigh real,
    flag text,                      -- low | normal | high (computed or entered)
    measuredAt integer NOT NULL,
    notes text,
    createdAt integer
  )`);

  await guard("health_conditions", sql`CREATE TABLE IF NOT EXISTS health_conditions (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    name text NOT NULL,
    kind text NOT NULL DEFAULT 'condition',  -- condition | symptom | allergy
    since integer,
    active integer NOT NULL DEFAULT 1,
    notes text,
    createdAt integer,
    updatedAt integer
  )`);
}
