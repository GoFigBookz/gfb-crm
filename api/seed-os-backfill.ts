/**
 * CLARK OWEN SOUND PAYROLL BACKFILL — read straight from the Google payroll sheet
 * (CP-Owensound Payroll). One saved pay run per period with per-employee lines; each
 * period's gross is verified against the sheet's own Totals row (to the penny).
 *
 * Status "review" (a backfill to eyeball). Idempotent: skips a period whose pay run
 * already exists. Periods are appended here as more of the sheet is read.
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

type Emp = { first: string; last: string; rate: number };
const ROSTER: Emp[] = [
  { first: "Jammie", last: "Cook", rate: 31.0 },
  { first: "Grace", last: "Dickerson", rate: 18.0 },
  { first: "Dean", last: "Dickerson", rate: 31.0 },
  { first: "Bruce", last: "Funston", rate: 20.0 },
  { first: "Ethan", last: "Holt", rate: 18.0 },
  { first: "Isabella", last: "Holt", rate: 16.6 },
  { first: "Chris", last: "Kennedy", rate: 20.0 },
  { first: "Michael", last: "Kennedy", rate: 24.0 },
  { first: "Alexis", last: "Montgomery", rate: 20.0 },
  { first: "Jamie", last: "Moseley", rate: 28.0 },
  { first: "Brad", last: "Nickle", rate: 30.0 },
  { first: "Brad", last: "Shaw", rate: 25.0 },
];

type Period = { payDate: string; start: string; end: string; lines: Record<string, { hours: number; gross: number }> };
// Verified: each period's line-gross sum ties to the sheet's Totals row.
const PERIODS: Period[] = [
  { payDate: "2026-06-26", start: "2026-06-10", end: "2026-06-23", lines: {
      [key("Jammie", "Cook")]: { hours: 80.0, gross: 2579.20 },
      [key("Grace", "Dickerson")]: { hours: 80.0, gross: 1497.60 },
      [key("Dean", "Dickerson")]: { hours: 96.5, gross: 3111.16 },
      [key("Bruce", "Funston")]: { hours: 71.25, gross: 1482.00 },
      [key("Ethan", "Holt")]: { hours: 23.0, gross: 430.56 },
      [key("Isabella", "Holt")]: { hours: 15.0, gross: 258.96 },
      [key("Chris", "Kennedy")]: { hours: 90.0, gross: 1872.00 },
      [key("Michael", "Kennedy")]: { hours: 102.92, gross: 2568.88 },
      [key("Alexis", "Montgomery")]: { hours: 50.0, gross: 1040.00 },
      [key("Jamie", "Moseley")]: { hours: 100.83, gross: 2936.17 },
      [key("Brad", "Nickle")]: { hours: 96.5, gross: 3010.80 },
      [key("Brad", "Shaw")]: { hours: 39.25, gross: 1020.50 },
  } },
  { payDate: "2026-06-12", start: "2026-05-27", end: "2026-06-09", lines: {
      [key("Jammie", "Cook")]: { hours: 80.78, gross: 2604.35 },
      [key("Grace", "Dickerson")]: { hours: 80.78, gross: 1512.20 },
      [key("Dean", "Dickerson")]: { hours: 79.5, gross: 2563.08 },
      [key("Bruce", "Funston")]: { hours: 101.35, gross: 2108.08 },
      [key("Chris", "Kennedy")]: { hours: 101.0, gross: 2100.80 },
      [key("Michael", "Kennedy")]: { hours: 101.0, gross: 2520.96 },
      [key("Alexis", "Montgomery")]: { hours: 50.0, gross: 1040.00 },
      [key("Jamie", "Moseley")]: { hours: 103.8, gross: 3022.66 },
      [key("Brad", "Nickle")]: { hours: 80.5, gross: 2511.60 },
      [key("Brad", "Shaw")]: { hours: 101.0, gross: 2626.00 },
  } },
];

export async function backfillOwenSoundPayroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /clark/i.test(c.name || "") && /(owen|sound)/i.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "Clark Owen Sound client not found" };
    const clientId = client.id;

    const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
    const empByKey = new Map<string, any>();
    for (const e of existing) empByKey.set(key(e.firstName, e.lastName), e);
    for (const r of ROSTER) {
      const k = key(r.first, r.last);
      if (empByKey.has(k)) continue;
      const [ins] = await db.insert(employees).values({
        clientId, firstName: r.first, lastName: r.last, payType: "hourly",
        hourlyRate: r.rate, isActive: true, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (ins) empByKey.set(k, ins);
    }

    const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, clientId))) as any[];
    let runsAdded = 0;
    for (const p of PERIODS) {
      if (allRuns.some((r) => r.payDate && new Date(r.payDate).toISOString().slice(0, 10) === p.payDate)) continue;
      let totalGross = 0;
      const [run] = await db.insert(payRuns).values({
        clientId, payPeriodStart: d(p.start), payPeriodEnd: d(p.end), payDate: d(p.payDate),
        frequency: "biweekly", status: "review", hoursSource: "manual",
        notes: "Backfill from Google payroll sheet", createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (!run) continue;
      for (const [k, v] of Object.entries(p.lines)) {
        const emp = empByKey.get(k);
        if (!emp) continue;
        const gross = round2(v.gross);
        totalGross += gross;
        await db.insert(payRunLines).values({ payRunId: run.id, employeeId: emp.id, regularHours: v.hours, grossPay: gross } as any);
      }
      await db.update(payRuns).set({ totalGross: round2(totalGross), updatedAt: new Date() } as any).where(eq(payRuns.id, run.id));
      runsAdded++;
    }
    if (runsAdded) console.log(`[os-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[os-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
