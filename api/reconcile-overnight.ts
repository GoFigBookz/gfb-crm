/**
 * OVERNIGHT TASK RECONCILE (Markie 2026-06-24)
 *
 * One idempotent pass that brings EXISTING tasks/clients into line with the
 * cleanup Markie dictated, without re-seeding from scratch:
 *
 *   1. Year-end close  → 30th of the month AFTER the fiscal year-end
 *                        (Sep → Oct 30, Dec → Jan 30 next yr).
 *   2. T4 / T4A prep   → January 20.
 *   3. HST quarterly   → the 15th of the month after the quarter (the seed
 *                        already placed the right MONTH; we only fix the day,
 *                        so fiscal-quarter clients aren't knocked off cycle).
 *   4. Align by Design → QuickBooks autopay: flag the client + retire its
 *                        payroll-run tasks (QBO does payroll, so no manual task).
 *   5. Columbus        → prospect (it's a prospect, not an active client).
 *   6. West York       → weekly payroll cadence (every Wednesday).
 *
 * Everything matches clients by NAME (prod ids differ from dev) and is safe to
 * run on every boot — re-dating is idempotent (nearest-occurrence), the Align
 * retire only ever touches rule-generated tasks, and field sets are no-ops once
 * applied.
 */

import { getDb } from "./queries/connection";
import { tasks, clients, clientTaskRules } from "../db/schema";
import { eq, and, inArray, like } from "drizzle-orm";
import { correctedDueDate } from "./task-date-rules";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function monthToNum(m: string | null | undefined): number | null {
  if (!m) return null;
  const i = MONTHS.indexOf(String(m).slice(0, 3).toLowerCase());
  return i < 0 ? null : i + 1;
}

/** Same calendar day (ignores time-of-day jitter). */
function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface ReconcileResult {
  yearEndRedated: number;
  t4Redated: number;
  hstRedated: number;
  alignTasksRetired: number;
  alignRulesRetired: number;
  alignFlagged: boolean;
  columbusProspect: boolean;
  westYorkWeekly: boolean;
  notes: string[];
}

export async function reconcileOvernight(): Promise<ReconcileResult> {
  const db = getDb();
  const out: ReconcileResult = {
    yearEndRedated: 0, t4Redated: 0, hstRedated: 0,
    alignTasksRetired: 0, alignRulesRetired: 0, alignFlagged: false,
    columbusProspect: false, westYorkWeekly: false, notes: [],
  };

  // --- 1+2+3: re-date recurring compliance tasks -------------------------------
  // Build ruleId -> ruleType and clientId -> yearEndMonth lookups.
  const allRules = await db.select({ id: clientTaskRules.id, ruleType: clientTaskRules.ruleType }).from(clientTaskRules);
  const ruleType = new Map<number, string>();
  for (const r of allRules) ruleType.set(r.id, r.ruleType);

  const allClients = await db.select({ id: clients.id, name: clients.name, yearEndMonth: clients.yearEndMonth }).from(clients);
  const yeByClient = new Map<number, number | null>();
  for (const c of allClients) yeByClient.set(c.id, monthToNum(c.yearEndMonth));

  const openTasks = await db.select().from(tasks).where(eq(tasks.completed, false));
  for (const t of openTasks) {
    const rt = t.ruleId != null ? ruleType.get(t.ruleId) : undefined;
    if (!rt) continue;
    const cur: Date | null = t.dueDate ? new Date(t.dueDate) : null;

    if (rt === "year_end") {
      const ye = t.clientId != null ? yeByClient.get(t.clientId) ?? null : null;
      const next = correctedDueDate("year_end", cur, ye);
      if (next && !sameDay(cur, next)) {
        await db.update(tasks).set({ dueDate: next, updatedAt: new Date() }).where(eq(tasks.id, t.id));
        out.yearEndRedated++;
      }
    } else if (rt === "t4_annual") {
      const next = correctedDueDate("t4_annual", cur, null);
      if (next && !sameDay(cur, next)) {
        await db.update(tasks).set({ dueDate: next, updatedAt: new Date() }).where(eq(tasks.id, t.id));
        out.t4Redated++;
      }
    } else if (rt === "hst_quarterly") {
      // Keep the seed's month/year (it's the client's fiscal quarter-after month);
      // only move the day to the 15th.
      if (cur && cur.getDate() !== 15) {
        const next = new Date(cur.getFullYear(), cur.getMonth(), 15, 12, 0, 0);
        await db.update(tasks).set({ dueDate: next, updatedAt: new Date() }).where(eq(tasks.id, t.id));
        out.hstRedated++;
      }
    }
  }

  // --- 4: Align by Design = QBO autopay ---------------------------------------
  const align = allClients.find((c) => /align by design/i.test(c.name));
  if (align) {
    await db.update(clients).set({ payrollHoursSource: "qbo_autopay", updatedAt: new Date() }).where(eq(clients.id, align.id));
    out.alignFlagged = true;
    // Retire the payroll-RUN obligations — QBO autopay handles pay + remittance.
    const payrollTypes = ["payroll_tax_prep", "payroll_remit_regular", "payroll_remit_accelerated", "payroll_remit_quarterly", "payroll_remit_monthly"];
    const alignRules = await db.select().from(clientTaskRules).where(eq(clientTaskRules.clientId, align.id));
    const retireRuleIds = alignRules.filter((r) => payrollTypes.includes(r.ruleType)).map((r) => r.id);
    if (retireRuleIds.length) {
      for (const rid of retireRuleIds) {
        const r = await db.update(clientTaskRules).set({ active: false, updatedAt: new Date() }).where(and(eq(clientTaskRules.id, rid), eq(clientTaskRules.active, true)));
        if ((r as any).rowsAffected) out.alignRulesRetired++;
      }
      // Delete only the OPEN, rule-generated instances (manual tasks have no ruleId).
      const del = await db.delete(tasks).where(and(inArray(tasks.ruleId, retireRuleIds), eq(tasks.completed, false)));
      out.alignTasksRetired = (del as any).rowsAffected ?? 0;
    }
  } else {
    out.notes.push("Align by Design not found — autopay flag skipped.");
  }

  // --- 5: Columbus = prospect -------------------------------------------------
  const columbus = allClients.find((c) => /columbus/i.test(c.name));
  if (columbus) {
    const r = await db.update(clients).set({ status: "prospect", updatedAt: new Date() }).where(and(eq(clients.id, columbus.id), eq(clients.status, "active")));
    out.columbusProspect = !!(r as any).rowsAffected;
  } else {
    out.notes.push("Columbus not found — prospect status skipped.");
  }

  // --- 6: West York = weekly (Wednesday) payroll ------------------------------
  const wy = allClients.find((c) => /west york/i.test(c.name));
  if (wy) {
    const r = await db.update(clients).set({ payrollFrequency: "weekly", updatedAt: new Date() }).where(eq(clients.id, wy.id));
    out.westYorkWeekly = !!(r as any).rowsAffected;
  } else {
    out.notes.push("West York not found — weekly cadence skipped.");
  }

  // Cat Bay onboarding was requested but no such client exists in the directory.
  if (!allClients.some((c) => /cat\s*bay/i.test(c.name))) {
    out.notes.push("Cat Bay client not in directory — onboarding status not applied (add the client first).");
  }

  return out;
}
