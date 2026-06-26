/**
 * SEED ALDERSON RECURRING — a quarterly reminder for Liv to email Rocco asking for
 * the Alderson Developments bank account activity for the last quarter.
 * =============================================================================
 * Why: the Alderson account is NOT paperless — the statement is mailed, so Rocco
 * has to physically print the transactions and send them (sometimes CSV, sometimes
 * PDF). Markie needs that to reconcile the Alderson bank account (a holding account
 * for a project). So we remind Liv to request it the first week of the month after
 * each quarter — on the 3rd, or the next business day if the 3rd is a weekend.
 * Cadence: quarterly. First instance: 3 Sep 2026 (covers Jun/Jul/Aug). Then Dec 3,
 * Mar 3, Jun 3, …
 * Mechanism: a clientTaskRules row (the recurring rule) + the first materialized
 * task linked by ruleId — so when Liv marks it done, the app generates the next
 * quarter's instance automatically (generateNextTaskInstance). Idempotent (guards
 * on the rule title for the Alderson client).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { tasks, clientTaskRules } from "../db/schema";

const RULE_TITLE = "Email Rocco — request Alderson bank account activity (last quarter)";
const DESCRIPTION =
<<<<<<< HEAD
  "Email Rocco to request the Alderson Developments bank account activity for the LAST QUARTER — whatever " +
  "form he has it in (the statement is mailed to him, so he's the only one who receives it). We do ALL the " +
  "conversion/processing on our end — never ask the client to format or export anything. We need this to " +
  "reconcile the Alderson bank account (a holding account for a project). Send on the 3rd of the month; if " +
  "the 3rd is a weekend or holiday, send the next business day. This quarter covers the three months just ended.";
=======
  "Email Rocco to request the Alderson Developments bank account activity for the LAST QUARTER. " +
  "ASK FOR THE CSV / EXCEL EXPORT (not a printed PDF) — CSV imports into the Recon Matcher instantly and " +
  "for free, whereas a PDF needs paid AI reading. The Alderson account is NOT paperless (the statement is " +
  "mailed), so Rocco prints/exports the transactions and sends them. We need this to reconcile the Alderson " +
  "bank account (a holding account for a project). Send on the 3rd of the month; if the 3rd is a weekend or " +
  "holiday, send the next business day. This quarter covers the three months just ended.";
>>>>>>> origin/main

/** Local-noon Date for a y-m-d (avoids UTC-midnight drifting a day back in Ontario). */
function localNoon(y: number, m1: number, d: number): Date {
  return new Date(y, m1 - 1, d, 12, 0, 0);
}

export async function seedAldersonRecurring(): Promise<void> {
  const db = getDb();
  try {
    const owner = (await db.all(sql`SELECT id FROM users WHERE role='admin' ORDER BY id ASC LIMIT 1`)) as any[];
    const fb = owner[0] ? owner : ((await db.all(sql`SELECT id FROM users ORDER BY id ASC LIMIT 1`)) as any[]);
    const uid = fb[0]?.id;
    if (!uid) return;

    const cl = (await db.all(sql`SELECT id FROM clients WHERE lower(name) LIKE '%alderson%' OR lower(company) LIKE '%alderson%' ORDER BY id ASC LIMIT 1`)) as any[];
    const clientId = cl[0]?.id;
    if (!clientId) { console.warn("[alderson] no Alderson client found — skipping recurring task seed"); return; }

    // Idempotent: if the rule already exists, refresh its description (so the
    // "ask for CSV not PDF" guidance lands even on a prior install) and stop.
    const existing = (await db.all(sql`SELECT id FROM client_task_rules WHERE clientId=${clientId} AND title=${RULE_TITLE} LIMIT 1`)) as any[];
    if (existing.length) {
      await db.run(sql`UPDATE client_task_rules SET description=${DESCRIPTION} WHERE id=${existing[0].id}`);
      return;
    }

    const firstDue = localNoon(2026, 9, 3); // 3 Sep 2026 (a Thursday) — covers Jun/Jul/Aug

    const [rule] = await db.insert(clientTaskRules).values({
      clientId, userId: uid,
      title: RULE_TITLE, description: DESCRIPTION,
      category: "Client Request", priority: "high", assignedTo: "Liv",
      ruleType: "custom", frequency: "quarterly",
      dueDayOfMonth: 3, daysBeforeDue: 0,
      active: true, nextDueDate: firstDue,
    } as any).returning();

    const ruleId = (rule as any)?.id;
    // Materialize the first instance now so it shows on the board / calendar.
    await db.insert(tasks).values({
      userId: uid, clientId,
      title: RULE_TITLE, description: DESCRIPTION,
      dueDate: firstDue, startDate: firstDue,
      category: "Client Request", priority: "high", assignedTo: "Liv",
      status: "pending", completed: false,
      ruleId: ruleId ?? null, isRecurring: true, recurrenceCount: 1,
    } as any);

    console.log(`[alderson] seeded quarterly 'request bank activity' rule + first task (client ${clientId}, rule ${ruleId})`);
  } catch (e) {
    console.error("[alderson] seedAldersonRecurring failed:", e instanceof Error ? e.message : e);
  }
}
