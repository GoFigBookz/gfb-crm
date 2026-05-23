import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: any;

export function getDb() {
  if (!instance) {
    // If DATABASE_URL is set, use MySQL (production)
    if (env.databaseUrl && env.databaseUrl.startsWith("mysql://")) {
      console.log("[DB] Using MySQL:", env.databaseUrl.replace(/:.+@/, ":***@"));
      const mysql = require("mysql2/promise");
      const { drizzle } = require("drizzle-orm/mysql2");
      const connection = mysql.createPool(env.databaseUrl);
      instance = drizzle(connection, { schema: fullSchema, mode: "default" });
    } else {
      // Fallback to SQLite (local dev)
      const { createClient } = require("@libsql/client");
      const { drizzle } = require("drizzle-orm/libsql");
      const path = require("path");
      const cwd = process.cwd();
      const isInDist = cwd.endsWith('/dist') || cwd.endsWith('\\dist');
      const basePath = isInDist ? path.resolve(cwd, '..') : cwd;
      const dbPath = path.resolve(basePath, "data", "crm.db");
      const url = `file:${dbPath}`;
      console.log("[DB] Using SQLite:", url);
      const client = createClient({ url });
      instance = drizzle(client, { schema: fullSchema });
    }
  }
  return instance;
}
