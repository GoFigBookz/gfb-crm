import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { checkSecret } from "./lib/admin-auth";

export const migrateRouter = createRouter({
  runGovData: publicQuery
    .input(z.object({ token: z.string(), migration: z.enum(["gov_data", "connectors", "triage_queue"]).default("gov_data") }))
    .mutation(async ({ input }) => {
      if (!checkSecret(input.token, "MIGRATE_TOKEN")) {
        throw new Error("Invalid token");
      }

      const db = getDb();
      const fs = await import("node:fs");
      const path = await import("node:path");

      const filename = input.migration === "connectors" ? "update_connectors.sql" : input.migration === "triage_queue" ? "migrations/20260523_triage_queue.sql" : "update_gov_data.sql";
      const sqlPath = path.join(process.cwd(), "db", filename);
      const sql = fs.readFileSync(sqlPath, "utf-8");

      // Split into statements and execute
      const statements = sql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith("--"));

      const results = [];
      for (const stmt of statements) {
        try {
          const result = await db.run(stmt + ";");
          results.push({ ok: true, stmt: stmt.slice(0, 60), changes: result.changes });
        } catch (err) {
          results.push({ ok: false, stmt: stmt.slice(0, 60), error: String(err) });
        }
      }

      return {
        success: true,
        executed: results.length,
        results,
      };
    }),
});
