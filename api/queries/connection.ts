import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";
import path from "path";

const fullSchema = { ...schema, ...relations };

// Use SQLite for cheap hosting (single file, zero RAM overhead)
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

let instance: any;

export function getDb() {
  if (!instance) {
    // Resolve database path relative to project root (not dist/)
    // In production, server runs from dist/, so go up one level
    const dbPath = path.resolve(process.cwd(), "data", "crm.db");
    const url = `file:${dbPath}`;
    console.log("[DB] Connecting to:", url);
    const client = createClient({ url });
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
