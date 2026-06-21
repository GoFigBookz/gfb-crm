/**
 * FIGGY JR — TAX-RATE REVIEW REMINDERS (boot seed, idempotent + self-renewing)
 * =============================================================================
 * Markie (2026-06-21): tax rates have no live API, so instead of pretending they
 * auto-update, schedule recurring reminders to refresh them by hand at the dates
 * the changes land — twice a year for Canada, annually for the US.
 *
 * These are FIRM-LEVEL tasks (clientId = null) that show on the task list/calendar.
 * Self-renewing: each run ensures ONE open task per reminder, dated to its NEXT
 * occurrence. When you complete it, the next run schedules the following cycle.
 *
 * WHERE THE RATES LIVE (update these when the reminder fires):
 *  - src/pages/Calculators.tsx → CA_PROVINCES (HST/GST), US_STATES (state income tax)
 *  - api/payroll-paycheck-core.ts → CPP_EI_2026 (CPP/CPP2/EI, YMPE/YAMPE/MIE, BPA,
 *    federal + ON brackets) — rename the constant to the new year too
 *  - Calculators.tsx dividend gross-up / DTC; depreciation CCA classes if changed
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { tasks } from "../db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";

type Reminder = { title: string; month: number; day: number; description: string };

// month is 1-based. Reminders are dated a couple weeks BEFORE the change takes
// effect so the rates are current the day they apply.
const REMINDERS: Reminder[] = [
  {
    title: "Update tax rates — Canada: new tax year",
    month: 12, day: 15,
    description:
      "New-year CRA constants take effect Jan 1. Update: CPP/CPP2 rates + YMPE/YAMPE + exemption, " +
      "EI rate + MIE, federal & provincial income-tax brackets + BPA + surtax/health premium, " +
      "RRSP/TFSA limits, prescribed rate. Edit api/payroll-paycheck-core.ts (CPP_EI_2026) and the " +
      "Calculators.tsx brackets. Verify against the CRA T4127 + PDOC.",
  },
  {
    title: "Update tax rates — Canada: mid-year (budgets / HST)",
    month: 6, day: 15,
    description:
      "Spring provincial budgets + sales-tax changes often take effect Jul 1 (e.g. NS HST 15%→14% " +
      "took effect Apr 1 2025). Review provincial income-tax + HST/PST/GST rates and update " +
      "CA_PROVINCES in Calculators.tsx where changed.",
  },
  {
    title: "Update tax rates — US: federal + state",
    month: 12, day: 15,
    description:
      "IRS inflation-adjusted federal brackets + Social Security wage base change Jan 1, and many " +
      "state income-tax rates change Jan 1 too. Update the US federal brackets + US_STATES rates in " +
      "Calculators.tsx. (No single live API — review IRS + state DOR.)",
  },
];

/** Next occurrence (>= today) of month/day, as a Date. */
function nextOccurrence(month: number, day: number, now = new Date()): Date {
  const y = now.getFullYear();
  const thisYear = new Date(y, month - 1, day);
  // compare date-only
  const today = new Date(y, now.getMonth(), now.getDate());
  return thisYear >= today ? thisYear : new Date(y + 1, month - 1, day);
}

export async function seedTaxRateReviewTasks(): Promise<{ ensured: number; created: number }> {
  const db = getDb();
  const report = { ensured: 0, created: 0 };
  for (const r of REMINDERS) {
    report.ensured++;
    try {
      // One OPEN firm-level task per reminder at a time (self-renews on completion).
      const open = await db.select().from(tasks)
        .where(and(isNull(tasks.clientId), eq(tasks.title, r.title), ne(tasks.status, "completed")))
        .limit(1);
      if (open[0]) continue;
      await db.insert(tasks).values({
        userId: 1,
        clientId: null,
        title: r.title,
        description: r.description,
        dueDate: nextOccurrence(r.month, r.day),
        category: "Firm — Tax rates",
        assignedTo: "Markie",
        priority: "high",
        status: "pending",
        stage: "todo",
        isRecurring: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      report.created++;
    } catch (e) {
      console.error("[tax-review] ensure failed for", r.title, ":", e instanceof Error ? e.message : e);
    }
  }
  return report;
}
