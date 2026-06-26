/**
 * PHOENIX RISING extra schema — Family History (genealogy) + Estate plan.
 * =============================================================================
 * Purpose:  Two more PRIVATE Phoenix Rising sections (owner-only, no clientId).
 *           family_members = genealogy/family history (+ family medical history).
 *           estate_items    = the "if something happens to me" binder for whoever
 *                             administers Markie's estate (business + personal).
 * Privacy:  Owner-scoped at every query; walled off from client/firm data.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

export async function ensurePhoenixSchema(): Promise<void> {
  const db = getDb();
  const guard = async (name: string, ddl: any) => {
    try { await db.run(ddl); } catch (e) { console.error(`[phoenix] ensure ${name} failed:`, e instanceof Error ? e.message : e); }
  };

  await guard("family_members", sql`CREATE TABLE IF NOT EXISTS family_members (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    name text NOT NULL,
    relation text,                  -- father, mother, grandfather, sibling, child, …
    side text,                      -- maternal | paternal | self | spouse
    birthDate text,                 -- free text (full date often unknown)
    deathDate text,
    living integer NOT NULL DEFAULT 1,
    birthplace text,
    notes text,                     -- stories, origins, occupation
    medicalNotes text,              -- family medical history (ties to the health hub)
    createdAt integer,
    updatedAt integer
  )`);

<<<<<<< HEAD
  await guard("side_products", sql`CREATE TABLE IF NOT EXISTS side_products (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    name text NOT NULL,
    category text,
    qtyOnHand integer NOT NULL DEFAULT 0,
    givenAway integer NOT NULL DEFAULT 0,
    unitCost real DEFAULT 0,
    minPrice real DEFAULT 0,         -- the floor Markie needs back per unit
    targetPrice real DEFAULT 0,      -- what he'd like to get
    discreet integer NOT NULL DEFAULT 0,
    notes text,
    active integer NOT NULL DEFAULT 1,
    createdAt integer,
    updatedAt integer
  )`);

  await guard("side_sales", sql`CREATE TABLE IF NOT EXISTS side_sales (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    productId integer NOT NULL,
    qty integer NOT NULL DEFAULT 1,
    unitPrice real NOT NULL DEFAULT 0,
    channel text,                    -- marketplace, word-of-mouth, …
    soldAt integer NOT NULL,
    notes text,
    createdAt integer
  )`);

=======
>>>>>>> origin/main
  await guard("estate_items", sql`CREATE TABLE IF NOT EXISTS estate_items (
    id integer PRIMARY KEY AUTOINCREMENT,
    userId integer NOT NULL,
    category text NOT NULL,         -- will | executor | business | accounts | assets | debts | insurance | digital | wishes | contacts | other
    title text NOT NULL,
    detail text,                    -- the instructions / description
    location text,                  -- where the document/key/asset is
    contact text,                   -- person + how to reach them
    status text DEFAULT 'open',     -- open | done (e.g. 'will notarized' once handled)
    sortOrder integer DEFAULT 0,
    createdAt integer,
    updatedAt integer
  )`);
}
