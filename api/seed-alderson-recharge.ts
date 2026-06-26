/**
 * SEED ALDERSON RECHARGE — config + quarterly reconcile task for the Alderson →
 * Ovita Holdings inter-company recharge (Markie 2026-06-26).
 * =============================================================================
 * Alderson pays project costs that belong to Ovita Holdings and recharges them
 * each FISCAL quarter (Nov 30 year-end → quarters end Feb / May / Aug / Nov). The
 * recharge is a taxable service → CHARGE HST (13% ON); revenue posts to "Sales" on
 * Alderson, expense to "Alderson Project Management Costs" on Holdings. It must be
 * RECONCILED to zero against the counterparty each quarter.
 *
 * This seeds: (1) the per-client recharge config so the generator prefills, and
 * (2) a quarterly recurring task (due the month after each fiscal quarter-end) so
 * Fig/ Markie generate + reconcile it every period. Idempotent; config only.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { tasks, clientTaskRules } from "../db/schema";
import { ensureRechargeSchema } from "./interco-recharge-router";

const RULE_TITLE = "Inter-company recharge + reconcile: Alderson → Ovita Holdings (fiscal quarter)";
const DESCRIPTION =
  "Generate the inter-company recharge for the fiscal quarter just ended: pull Alderson's project expenses, " +
  "build the invoice Alderson → Ovita Holdings for those costs + 13% HST (revenue → Sales; Holdings expense → " +
  "Alderson Project Management Costs), post both sides on approval, then RECONCILE the intercompany balance to " +
  "zero against the counterparty. Settlement: Holdings' payment lands in the 'Alderson Development clearing account' " +
  "as a TRANSFER on Alderson's side — reconcile that clearing account to zero each quarter. " +
  "Tool: Inter-Company → Recharge generator (drafts only; nothing posts without review).";

function localNoon(y: number, m1: number, d: number): Date {
  return new Date(y, m1 - 1, d, 12, 0, 0);
}

export async function seedAldersonRecharge(): Promise<void> {
  const db = getDb();
  try {
    await ensureRechargeSchema();

    const owner = (await db.all(sql`SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1`)) as any[];
    const fb = owner[0] ? owner : ((await db.all(sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`)) as any[]);
    const uid = fb[0]?.id;
    if (!uid) return;

    const cl = (await db.all(sql`SELECT id FROM clients WHERE lower(name) LIKE '%alderson%' OR lower(company) LIKE '%alderson%' ORDER BY id ASC LIMIT 1`)) as any[];
    const clientId = cl[0]?.id;
    if (!clientId) { console.warn("[alderson-recharge] no Alderson client — skipping"); return; }

    // (1) Prefill the recharge config (idempotent upsert). Reciprocal clearing: the
    // settlement transfer hits Alderson's "Holdings clearing account" and Holdings'
    // "Alderson Development clearing account" — both reconciled to zero each quarter.
    await db.run(sql`INSERT INTO interco_recharge_config
      (payerClientId, counterpartyName, revenueAccount, expenseAccount, payerClearingAccount, counterpartyClearingAccount, hstRatePct, chargeHst, updatedAt)
      VALUES (${clientId}, 'Ovita Holdings Inc.', 'Sales', 'Alderson Project Management Costs', 'Holdings clearing account', 'Alderson Development clearing account', 13, 1, ${Date.now()})
      ON CONFLICT(payerClientId) DO UPDATE SET
        counterpartyName='Ovita Holdings Inc.', revenueAccount='Sales',
        expenseAccount='Alderson Project Management Costs',
        payerClearingAccount='Holdings clearing account',
        counterpartyClearingAccount='Alderson Development clearing account', hstRatePct=13, chargeHst=1, updatedAt=${Date.now()}`);

    // (2) Quarterly recurring task. First instance: 30 Jun 2026 (for the fiscal Q2
    // ending 31 May 2026, which Markie is working now). Then Sep 30, Dec 31, Mar 31…
    const existing = (await db.all(sql`SELECT id FROM client_task_rules WHERE clientId=${clientId} AND title=${RULE_TITLE} LIMIT 1`)) as any[];
    if (existing.length) {
      await db.run(sql`UPDATE client_task_rules SET description=${DESCRIPTION} WHERE id=${existing[0].id}`);
      return;
    }

    const firstDue = localNoon(2026, 6, 30);
    const [rule] = await db.insert(clientTaskRules).values({
      clientId, userId: uid,
      title: RULE_TITLE, description: DESCRIPTION,
      category: "Bookkeeping", priority: "high", assignedTo: "Fig",
      ruleType: "custom", frequency: "quarterly",
      dueDayOfMonth: 30, daysBeforeDue: 0,
      active: true, nextDueDate: firstDue,
    } as any).returning();

    const ruleId = (rule as any)?.id;
    await db.insert(tasks).values({
      userId: uid, clientId,
      title: RULE_TITLE, description: DESCRIPTION,
      dueDate: firstDue, startDate: firstDue,
      category: "Bookkeeping", priority: "high", assignedTo: "Fig",
      status: "pending", completed: false,
      ruleId: ruleId ?? null, isRecurring: true, recurrenceCount: 1,
    } as any);

    console.log(`[alderson-recharge] seeded config + quarterly recharge/reconcile task (client ${clientId}, rule ${ruleId})`);
  } catch (e) {
    console.error("[alderson-recharge] seedAldersonRecharge failed:", e instanceof Error ? e.message : e);
  }
}
