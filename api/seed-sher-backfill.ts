/**
 * SHER-E-PUNJAB PAYROLL BACKFILL — first client of the year backfill.
 * Loads saved pay runs (per-employee) from Markie's Google payroll sheet so the
 * year totals are real. Each period's per-employee GROSS is taken straight from the
 * sheet (Gross Pay column, vacation-incl), verified to tie to the sheet's totals.
 *
 * Runs are created at status "review" (a backfill to eyeball, not a live draft).
 * Idempotent: skips a period whose pay run already exists for this client.
 *
 * Periods are added here as Markie sends snapshots of the older tabs (the raw sheet
 * read scrambles columns for older months, so screenshots are the accurate source).
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq, and } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

type Emp = { first: string; last: string; payType: "salary" | "hourly"; rate?: number; salary?: number };
const ROSTER: Emp[] = [
  { first: "Surya", last: "Bhattrai", payType: "salary", salary: 70000 },
  { first: "Upendra", last: "Bahadur Poudel", payType: "hourly", rate: 21.0 },
  { first: "Akash", last: "Dahal", payType: "hourly", rate: 17.6 },
  { first: "Rohit", last: "Dhimal", payType: "hourly", rate: 19.0 },
  { first: "Dhiren", last: "Gurung", payType: "hourly", rate: 18.0 },
  { first: "Suraj", last: "Limbu", payType: "hourly", rate: 18.0 },
  { first: "Deepak", last: "Vasisth", payType: "hourly", rate: 17.6 },
];

// payDate / period start–end (Eastern) + per-employee {hours, gross} from the sheet.
// Verified: each period's gross sum ties to the sheet's "Total Pay".
type Period = { payDate: string; start: string; end: string; lines: Record<string, { hours: number; gross: number }> };
const PERIODS: Period[] = [
  { payDate: "2026-06-26", start: "2026-06-10", end: "2026-06-23", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 77.02, gross: 1409.77 },
      [key("Rohit", "Dhimal")]: { hours: 102.74, gross: 2030.14 },
      [key("Suraj", "Limbu")]: { hours: 79.99, gross: 1497.41 },
      [key("Deepak", "Vasisth")]: { hours: 63.92, gross: 1169.99 },
  } },
  { payDate: "2026-06-12", start: "2026-05-27", end: "2026-06-09", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 71.26, gross: 1304.34 },
      [key("Rohit", "Dhimal")]: { hours: 90.92, gross: 1796.58 },
      [key("Suraj", "Limbu")]: { hours: 88.32, gross: 1653.35 },
      [key("Deepak", "Vasisth")]: { hours: 76.68, gross: 1403.55 },
  } },
];

export async function backfillSherPayroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /sher|punjab/i.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "Sher-E-Punjab client not found" };
    const clientId = client.id;

    // Ensure the roster exists (fill-only; never clobber edited rates).
    const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
    const empByKey = new Map<string, any>();
    for (const e of existing) empByKey.set(key(e.firstName, e.lastName), e);
    for (const r of ROSTER) {
      const k = key(r.first, r.last);
      const ex = empByKey.get(k);
      if (ex) {
        // Fill blank rate / pay type from the sheet (never clobber an edited value).
        const patch: Record<string, any> = {};
        if (ex.payType == null) patch.payType = r.payType;
        if (r.payType === "hourly" && (ex.hourlyRate == null) && r.rate != null) patch.hourlyRate = r.rate;
        if (r.payType === "salary" && (ex.annualSalary == null) && r.salary != null) patch.annualSalary = r.salary;
        if (Object.keys(patch).length) { patch.updatedAt = new Date(); await db.update(employees).set(patch).where(eq(employees.id, ex.id)); }
        continue;
      }
      const [ins] = await db.insert(employees).values({
        clientId, firstName: r.first, lastName: r.last, payType: r.payType,
        hourlyRate: r.payType === "hourly" ? r.rate ?? null : null,
        annualSalary: r.payType === "salary" ? r.salary ?? null : null,
        isActive: true, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (ins) empByKey.set(k, ins);
    }

    const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, clientId))) as any[];
    let runsAdded = 0;
    for (const p of PERIODS) {
      const payDate = d(p.payDate);
      const exists = allRuns.some((r) => r.payDate && new Date(r.payDate).toISOString().slice(0, 10) === p.payDate);
      if (exists) continue;
      let totalGross = 0;
      const [run] = await db.insert(payRuns).values({
        clientId, payPeriodStart: d(p.start), payPeriodEnd: d(p.end), payDate,
        frequency: "biweekly", status: "review", hoursSource: "manual",
        notes: "Backfill from Google payroll sheet", createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (!run) continue;
      for (const r of ROSTER) {
        const k = key(r.first, r.last);
        const emp = empByKey.get(k);
        if (!emp) continue;
        const ln = p.lines[k];
        const gross = round2(ln?.gross ?? 0);
        totalGross += gross;
        await db.insert(payRunLines).values({
          payRunId: run.id, employeeId: emp.id,
          regularHours: ln?.hours ?? 0, grossPay: gross,
        } as any);
      }
      await db.update(payRuns).set({ totalGross: round2(totalGross), updatedAt: new Date() } as any).where(eq(payRuns.id, run.id));
      runsAdded++;
    }
    if (runsAdded) console.log(`[sher-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[sher-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
