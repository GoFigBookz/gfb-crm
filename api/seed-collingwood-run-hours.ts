/**
 * SEED CLARK COLLINGWOOD RUN HOURS — one-shot helper so Markie can run payroll
 * TODAY without the Jobber import. Loads the pay period's hours (provided by
 * Markie 2026-06-24) into his OPEN draft pay run for Clark Collingwood (client 7),
 * confirms each rate from the employee card, and forces the correct phone
 * allowance per his confirmed list.
 *
 * SAFE / NON-DESTRUCTIVE:
 *  - Only ever touches a run whose status is "draft" for client 7 (verified to be
 *    Collingwood). Once the run is reviewed/approved it is left alone.
 *  - Regular hours are FILL-ONLY (a line Markie already typed is never overwritten);
 *    gross is then recomputed from the final hours × the card rate.
 *  - Phone allowance is SET to the confirmed value (fix the missing/wrong ones).
 *  - Idempotent: re-running on a draft run reproduces the same numbers.
 *
 * This is a stop-gap. The durable path is the Jobber id mapping (mapJobberWorker).
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

const CLIENT_ID = 7;
const PHONE = 23.08;
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;

// This period's REGULAR hours per employee (from Markie's pasted run, 2026-06-24).
// Salaried staff (Hawton/Essex) are paid by salary, not hours — handled separately.
const HOURS: Record<string, number> = {
  [key("Matteo", "Companion")]: 64.63,
  [key("Logan", "Greig")]: 0,
  [key("Chris", "Haight")]: 90.43,
  [key("Corey", "Hawton")]: 84.78,
  [key("Justin", "Koutsomichos")]: 101.62,
  [key("Dave", "Lally")]: 84.85,
  [key("Aidan", "MacDonald")]: 54.67,
  [key("Justin", "Pool")]: 38.06,
  [key("Adrian", "Robbeson")]: 97.0,
  [key("Chris", "Thompson")]: 66.78,
  [key("Lisa", "Venditti")]: 93.8,
  [key("Alan", "Weaver")]: 56.0,
};
// Confirmed $23.08/pay phone allowance (everyone else = none). Matches Markie's run.
const PHONE_ENTITLED = new Set([
  key("Chris", "Hawton"), key("Brendan", "Essex"), key("Logan", "Greig"),
  key("Chris", "Haight"), key("Corey", "Hawton"), key("Justin", "Koutsomichos"),
  key("Aidan", "MacDonald"), key("Adrian", "Robbeson"), key("Chris", "Thompson"),
  key("Lisa", "Venditti"), key("Alan", "Weaver"),
]);
// Biweekly (26 pays/yr) for the salaried gross estimate.
const PERIODS_PER_YEAR = 26;

export async function seedCollingwoodRunHours(): Promise<{ run: number | null; filled: number; phoneSet: number; skipped: string } | void> {
  const db = getDb();
  try {
    const client = (await db.select().from(clients).where(eq(clients.id, CLIENT_ID)).limit(1))[0] as any;
    if (!client) return { run: null, filled: 0, phoneSet: 0, skipped: "client 7 not found" };
    if (!/colling/i.test(client.name || "")) return { run: null, filled: 0, phoneSet: 0, skipped: `client 7 is "${client.name}", not Collingwood` };

    // The open draft run for this client (most recent by period end). Only drafts —
    // never a reviewed/approved/posted run.
    const draft = (await db.select().from(payRuns)
      .where(and(eq(payRuns.clientId, CLIENT_ID), eq(payRuns.status, "draft")))
      .orderBy(desc(payRuns.payPeriodEnd)).limit(1))[0] as any;
    if (!draft) return { run: null, filled: 0, phoneSet: 0, skipped: "no draft run for Collingwood" };

    const emps = (await db.select().from(employees).where(eq(employees.clientId, CLIENT_ID))) as any[];
    const empById = new Map(emps.map((e) => [e.id, e]));
    const lines = (await db.select().from(payRunLines).where(eq(payRunLines.payRunId, draft.id))) as any[];

    let filled = 0, phoneSet = 0;
    for (const l of lines) {
      const e = empById.get(l.employeeId);
      if (!e) continue;
      const k = key(e.firstName, e.lastName);
      const patch: any = {};

      if ((e.payType || "") === "salary") {
        // Salaried — estimate gross from annual salary; don't touch hours.
        const g = round2((e.annualSalary || 0) / PERIODS_PER_YEAR);
        if (g > 0 && (l.grossPay ?? 0) === 0) patch.grossPay = g;
      } else if (k in HOURS) {
        const target = HOURS[k];
        const reg = (l.regularHours ?? 0) === 0 ? target : l.regularHours; // fill-only
        if (reg !== (l.regularHours ?? 0)) { patch.regularHours = reg; filled++; }
        const rate = e.hourlyRate ?? 0;
        const g = round2(reg * rate);
        if (g !== (l.grossPay ?? 0)) patch.grossPay = g;
      }

      // Phone allowance — set to the confirmed value (fixes missing/wrong ones).
      const entitled = PHONE_ENTITLED.has(k);
      const targetPhone = entitled ? PHONE : 0;
      if ((l.phoneAllowance ?? 0) !== targetPhone) { patch.phoneAllowance = targetPhone; phoneSet++; }

      if (Object.keys(patch).length) {
        patch.updatedAt = new Date();
        await db.update(payRunLines).set(patch).where(eq(payRunLines.id, l.id));
      }
    }

    // Recompute the run totals so the footer/whole-pay box is correct.
    const fresh = (await db.select().from(payRunLines).where(eq(payRunLines.payRunId, draft.id))) as any[];
    const totalGross = round2(fresh.reduce((s, l) => s + (l.grossPay || 0), 0));
    await db.update(payRuns).set({ totalGross, updatedAt: new Date() } as any).where(eq(payRuns.id, draft.id));

    if (filled || phoneSet) console.log(`[seed-collingwood-run] run ${draft.id}: filled ${filled} hours, set ${phoneSet} phone`);
    return { run: draft.id, filled, phoneSet, skipped: "" };
  } catch (err) {
    console.error("[seed-collingwood-run] failed:", err instanceof Error ? err.message : err);
  }
}
