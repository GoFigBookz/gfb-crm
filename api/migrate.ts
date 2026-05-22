/**
 * SAFE DATABASE MIGRATIONS
 * Runs on startup to add missing columns without breaking existing data.
 * For SQLite — ALTER TABLE ADD COLUMN is safe and non-destructive.
 */

import { getDb } from "./queries/connection";

interface Migration {
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    name: "004_add_due_time_to_tasks",
    sql: `ALTER TABLE tasks ADD COLUMN dueTime TEXT;`,
  },
  {
    name: "004_add_due_time_to_recurring_tasks",
    sql: `ALTER TABLE recurring_tasks ADD COLUMN dueTime TEXT;`,
  },
  {
    name: "004_add_due_time_to_client_task_rules",
    sql: `ALTER TABLE client_task_rules ADD COLUMN dueTime TEXT;`,
  },
];

/**
 * Check if a column exists in a table
 */
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const db = getDb();
  try {
    // SQLite stores table schema in sqlite_master
    const result = await db.all(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='${tableName}'
    `);
    if (result.length === 0) return false;
    const schema = result[0].sql as string;
    return schema.includes(columnName);
  } catch {
    return false;
  }
}

/**
 * Run a single migration if it hasn't been applied
 */
async function runMigration(migration: Migration): Promise<{ applied: boolean; error?: string }> {
  const db = getDb();

  // Check if migration was already recorded
  try {
    const existing = await db.all(
      `SELECT name FROM _migrations WHERE name = ?`,
      [migration.name]
    );
    if (existing.length > 0) {
      return { applied: false };
    }
  } catch {
    // _migrations table might not exist yet, that's fine
  }

  try {
    await db.run(migration.sql);

    // Record migration
    await db.run(
      `INSERT INTO _migrations (name, appliedAt) VALUES (?, ?)`,
      [migration.name, Date.now()]
    );

    console.log(`[MIGRATION] Applied: ${migration.name}`);
    return { applied: true };
  } catch (err: any) {
    // If error is "duplicate column name", it's already there — skip
    if (err.message?.includes("duplicate column name")) {
      console.log(`[MIGRATION] Skipped (already exists): ${migration.name}`);
      return { applied: false };
    }
    console.error(`[MIGRATION] Failed: ${migration.name}`, err.message);
    return { applied: false, error: err.message };
  }
}

/**
 * Initialize migrations table
 */
async function initMigrationsTable(): Promise<void> {
  const db = getDb();
  await db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      appliedAt INTEGER NOT NULL
    )
  `);
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<{ applied: number; errors: string[] }> {
  const results = { applied: 0, errors: [] as string[] };

  await initMigrationsTable();

  for (const migration of MIGRATIONS) {
    const result = await runMigration(migration);
    if (result.applied) results.applied++;
    if (result.error) results.errors.push(`${migration.name}: ${result.error}`);
  }

  if (results.applied > 0) {
    console.log(`[MIGRATION] ${results.applied} migration(s) applied`);
  }
  if (results.errors.length > 0) {
    console.error(`[MIGRATION] ${results.errors.length} error(s):`, results.errors);
  }

  return results;
}

/**
 * Quick check: are all expected columns present?
 */
export async function checkSchemaHealth(): Promise<{ healthy: boolean; missing: string[] }> {
  const checks = [
    { table: "tasks", column: "dueTime" },
    { table: "recurring_tasks", column: "dueTime" },
    { table: "client_task_rules", column: "dueTime" },
  ];

  const missing: string[] = [];
  for (const check of checks) {
    const exists = await columnExists(check.table, check.column);
    if (!exists) missing.push(`${check.table}.${check.column}`);
  }

  return { healthy: missing.length === 0, missing };
}
