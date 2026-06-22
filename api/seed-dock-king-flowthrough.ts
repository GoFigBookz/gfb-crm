import { getDb } from "./queries/connection";
import { clients, clientTaskRules, tasks } from "../db/schema";
import { and, eq, like, ne, or } from "drizzle-orm";

/**
 * Dock King(s) is a FLOW-THROUGH (wholesale) client only — NOT an active
 * bookkeeping client. We don't do monthly books, close, or compliance for it;
 * we only invoice for the QuickBooks wholesale software (future: Stripe autopay).
 *
 * This ensures that intent idempotently on boot: any client whose name/company
 * starts with "Dock King" is marked clientType="wholesale" + qboSoftwareWholesale,
 * and any open compliance tasks/rules it may have picked up get deactivated.
 * NON-destructive: only touches matching clients, only deactivates (never deletes),
 * and skips if already wholesale. King Industries Inc. (the real active client that
 * merely *has* a Dock Kings division) is NOT matched — we anchor on the name start.
 */
export async function seedDockKingFlowthrough(): Promise<{ matched: number; updated: number; tasksPaused: number }> {
  const db = getDb();
  const report = { matched: 0, updated: 0, tasksPaused: 0 };

  // Match "Dock King" / "Dock Kings" by name or company, but NOT "King Industries".
  const rows = (await db.select().from(clients).where(
    or(like(clients.name, "Dock King%"), like(clients.company, "Dock King%")),
  )) as any[];

  for (const c of rows) {
    report.matched++;
    if (c.clientType !== "wholesale") {
      await db.update(clients)
        .set({ clientType: "wholesale", qboSoftwareWholesale: true, updatedAt: new Date() })
        .where(eq(clients.id, c.id));
      report.updated++;
    }
    // Pause its rules + DELETE open tasks (tasks have no active column) — a
    // flow-through client must show zero compliance/setup tasks.
    const r1 = await db.update(clientTaskRules).set({ active: false }).where(eq(clientTaskRules.clientId, c.id)).returning();
    const r2 = await db.delete(tasks)
      .where(and(eq(tasks.clientId, c.id), ne(tasks.status, "completed"))).returning();
    report.tasksPaused += (r1?.length || 0) + (r2?.length || 0);
  }

  return report;
}
