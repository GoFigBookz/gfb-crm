/**
 * MARK CLIENT-RUN PAYROLL — Markie 2026-06-24.
 * Some clients RUN THEIR OWN payroll (or it's external). We don't process those per
 * period — they're a YEAR-END reconciliation only. This seed flips the named clients
 * to payrollFrequency "self" + payrollExternal, which:
 *   - removes them from the Payroll page (isPayrollClient excludes "self"), and
 *   - creates the annual "Year-end payroll reconciliation" task (get their data,
 *     tie out to year-end).
 * Idempotent + matched by name. Safe to run on boot.
 */
import { getDb } from "./queries/connection";
import { clients, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { createRecurringTasksForClient } from "./client-task-creator";

// Clients Markie confirmed run their own payroll.
const PATTERNS = [/selective\s*painting/i, /studio\s*lel/i, /aline\s*plumbing/i];

export async function markClientRunPayroll(): Promise<{ updated: string[]; skipped: string } | void> {
  const db = getDb();
  try {
    const owner = (await db.select().from(users).where(eq(users.email, "markie.antle@gmail.com")).limit(1))[0]
      || (await db.select().from(users).limit(1))[0];
    const userId = (owner as any)?.id;
    if (!userId) return { updated: [], skipped: "no user" };

    const cs = (await db.select().from(clients)) as any[];
    const updated: string[] = [];
    for (const c of cs) {
      if ((c.clientType || "") === "wholesale") continue;
      if (!PATTERNS.some((p) => p.test(c.name || ""))) continue;
      const needsUpdate = c.payrollFrequency !== "self" || !c.payrollExternal || !c.hasPayroll;
      if (needsUpdate) {
        await db.update(clients).set({ hasPayroll: true, payrollFrequency: "self", payrollExternal: true, updatedAt: new Date() } as any).where(eq(clients.id, c.id));
      }
      // Ensure the year-end reconciliation task exists (deduped by title inside).
      await createRecurringTasksForClient(
        c.id, userId,
        { hasPayroll: true, payrollFrequency: "self", payrollExternal: true },
        c.name, c.assignedTo || "Markie",
      );
      updated.push(c.name);
    }
    if (updated.length) console.log(`[client-run-payroll] set self + year-end recon for: ${updated.join(", ")}`);
    return { updated, skipped: "" };
  } catch (err) {
    console.error("[client-run-payroll] failed:", err instanceof Error ? err.message : err);
  }
}
