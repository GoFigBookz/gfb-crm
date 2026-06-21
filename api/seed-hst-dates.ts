/**
 * Stamp each client's HST cadence + explicit "Next HST Return Due By" date from
 * Markie's HST sheet (Google Sheet 12rGz-…), keyed by CRA business number.
 * Sets clients.hasHST/hstPeriod/hstNextDue, and updates the client's open HST
 * task + HST rule due date to the sheet date. Idempotent; runs on boot AFTER
 * importClientMaster (so the dates override the cadence-computed ones).
 */
import { getDb } from "./queries/connection";
import { clients, tasks, clientTaskRules } from "../db/schema";
import { eq, and, ne, like, inArray } from "drizzle-orm";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
/** "Apr 2026" → "2026-04-30" (last day of that month). null if unparseable. */
function dueDateFromMonthYear(s: string): string | null {
  const m = /([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/.exec((s || "").trim());
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  const yr = Number(m[2]);
  if (!mo || !yr) return null;
  const last = new Date(Date.UTC(yr, mo, 0)).getUTCDate(); // day 0 of next month = last day
  return `${yr}-${String(mo).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
/** HST sheet frequency → our hstPeriod, or null = no HST. */
function periodFromHst(hst: string): "monthly" | "quarterly" | "annual" | null {
  const h = (hst || "").toLowerCase();
  if (!h || h === "n/a" || h === "no") return null;
  if (h.startsWith("month")) return "monthly";
  if (h.startsWith("qrt") || h.startsWith("quart")) return "quarterly";
  if (h.startsWith("annual")) return "annual";
  return null;
}

// From the HST sheet (cra = 9-digit CRA BN; hst = cadence; next = due month/year).
const ROWS: Array<{ cra: string; hst: string; next: string }> = [
  { cra: "781088661", hst: "Annual", next: "Mar 2024" },
  { cra: "847759909", hst: "Annual-Sep", next: "Dec 2026" },
  { cra: "793523481", hst: "Annual-Sep", next: "Dec 2026" },
  { cra: "807649798", hst: "Annual-Dec", next: "Mar 2026" },
  { cra: "774355168", hst: "Qrtly-Aug", next: "Jun 2026" },
  { cra: "707477733", hst: "Qrtly", next: "May 2026" },
  { cra: "789978301", hst: "Annual", next: "Aug 2026" },
  { cra: "770298602", hst: "Qrtly", next: "Apr 2026" },
  { cra: "715666566", hst: "Annual-Sep", next: "Dec 2026" },
  { cra: "758960231", hst: "Qrtly", next: "Jan 2026" },
  { cra: "750383671", hst: "Annual", next: "Mar 2026" },
  { cra: "803271337", hst: "Annual", next: "Mar 2026" },
  { cra: "739247070", hst: "Annual-Sep", next: "Dec 2026" },
  { cra: "736845488", hst: "Annual", next: "Mar 2026" },
  { cra: "858977705", hst: "Qrtly", next: "Apr 2026" },
  { cra: "127437374", hst: "Qrtly", next: "Apr 2026" },
  { cra: "767302490", hst: "Annual-Sep", next: "Dec 2026" },
  { cra: "763289337", hst: "Annual-Sep", next: "Dec 2026" },
  { cra: "728898321", hst: "Annual-Dec", next: "Dec 2026" },
  { cra: "786440610", hst: "Qrtly", next: "Apr 2026" },
  { cra: "752504498", hst: "Qrtly-Aug", next: "Jun 2026" },
  { cra: "722717121", hst: "Qrtly-Aug", next: "Jun 2026" },
  { cra: "728509522", hst: "Annual-Sep", next: "Dec 2026" },
  { cra: "784617565", hst: "Annual-Dec", next: "Mar 2026" },
  { cra: "792026429", hst: "Qrtly", next: "Apr 2026" },
  { cra: "718843600", hst: "Qrtly", next: "Apr 2026" },
  { cra: "741962930", hst: "Qrtly", next: "Mar 2025" },
  { cra: "877933515", hst: "Qrtly", next: "Apr 2026" },
];

export async function seedHstDates(): Promise<{ updated: number; tasks: number }> {
  const db = getDb();
  const report = { updated: 0, tasks: 0 };
  try {
    const all = (await db.select({ id: clients.id, taxId: clients.taxId }).from(clients)) as any[];
    const byTax = new Map<string, number>();
    for (const c of all) {
      const t = String(c.taxId || "").replace(/\D/g, "");
      if (t) byTax.set(t.slice(0, 9), c.id);
    }
    for (const r of ROWS) {
      const clientId = byTax.get(r.cra);
      if (!clientId) continue;
      const period = periodFromHst(r.hst);
      const due = dueDateFromMonthYear(r.next);
      const patch: Record<string, any> = { updatedAt: new Date() };
<<<<<<< HEAD
      if (period) {
        patch.hasHST = true;
        patch.hstPeriod = period;
        patch.hstNumber = `${r.cra}RT0001`;   // CRA HST account = BN + RT0001
      }
=======
      if (period) { patch.hasHST = true; patch.hstPeriod = period; }
>>>>>>> origin/main
      if (due) patch.hstNextDue = due;
      if (Object.keys(patch).length <= 1) continue;
      await db.update(clients).set(patch).where(eq(clients.id, clientId));
      report.updated++;

      // Stamp the sheet date onto the client's open HST task + HST rule.
      if (due) {
        const dueTs = new Date(`${due}T09:00:00Z`);
        const r1: any = await db.update(tasks).set({ dueDate: dueTs })
          .where(and(eq(tasks.clientId, clientId), ne(tasks.status, "completed"), like(tasks.title, "%HST%")));
        report.tasks += Number(r1?.rowsAffected ?? r1?.changes ?? 0);
        await db.update(clientTaskRules).set({ nextDueDate: dueTs })
          .where(and(eq(clientTaskRules.clientId, clientId), inArray(clientTaskRules.ruleType, ["hst_monthly", "hst_quarterly", "hst_annual"])));
      }
    }
    console.log(`[seed] HST dates: ${report.updated} clients, ${report.tasks} HST tasks dated`);
  } catch (e) {
    console.error("[seed] seedHstDates failed (non-fatal):", e instanceof Error ? e.message : e);
  }
  return report;
}
