import { AsyncLocalStorage } from "node:async_hooks";
import * as schema from "@db/schema";
import * as relations from "@db/relations";
import path from "path";

const fullSchema = { ...schema, ...relations };

// Use SQLite for cheap hosting (single file, zero RAM overhead)
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

// Per-request DB selection: demo requests (x-demo-mode header) run inside this
// store and resolve to a SEPARATE demo.db so they can NEVER read the real books.
export const dbContext = new AsyncLocalStorage<{ demo?: boolean }>();

let realInstance: any;
let demoInstance: any;

function dataDir() {
  // Resolve database path relative to project root (not dist/). In production the
  // server runs from dist/, so go up one level.
  const cwd = process.cwd();
  const isInDist = cwd.endsWith("/dist") || cwd.endsWith("\\dist");
  const basePath = isInDist ? path.resolve(cwd, "..") : cwd;
  return path.resolve(basePath, "data");
}

function build(file: string) {
  const dbPath = path.resolve(dataDir(), file);
  const url = `file:${dbPath}`;
  console.log("[DB] open", file, "→", url);
  return drizzle(createClient({ url }), { schema: fullSchema });
}

export function getRealDb() {
  if (!realInstance) realInstance = build("crm.db");
  return realInstance;
}

export function getDemoDb() {
  if (!demoInstance) demoInstance = build("demo.db");
  return demoInstance;
}

/** The live DB for the current request — demo.db inside a demo request, else crm.db. */
export function getDb() {
  return dbContext.getStore()?.demo ? getDemoDb() : getRealDb();
}

/** Run a function with the demo DB selected (used to prepare/seed demo.db). */
export function runInDemo<T>(fn: () => T): T {
  return dbContext.run({ demo: true }, fn);
}
