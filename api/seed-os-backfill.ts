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
  { first: "Debbie", last: "Maritin", rate: 30.0 },
  { first: "Neil", last: "Korchak", rate: 20.0 },
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
  // Victoria Day stat in this period; line-gross sum ties to cost−tax ($21,353.47).
  { payDate: "2026-05-29", start: "2026-05-13", end: "2026-05-26", lines: {
      [key("Jammie", "Cook")]: { hours: 86.0, gross: 2772.64 },
      [key("Grace", "Dickerson")]: { hours: 84.37, gross: 1579.44 },
      [key("Dean", "Dickerson")]: { hours: 93.0, gross: 2998.32 },
      [key("Bruce", "Funston")]: { hours: 93.96, gross: 1954.47 },
      [key("Ethan", "Holt")]: { hours: 8.62, gross: 161.44 },
      [key("Isabella", "Holt")]: { hours: 16.83, gross: 290.59 },
      [key("Michael", "Kennedy")]: { hours: 106.68, gross: 2662.73 },
      [key("Alexis", "Montgomery")]: { hours: 44.26, gross: 920.69 },
      [key("Jamie", "Moseley")]: { hours: 93.93, gross: 2735.24 },
      [key("Brad", "Nickle")]: { hours: 102.5, gross: 3198.00 },
      [key("Brad", "Shaw")]: { hours: 80.0, gross: 2079.91 },
  } },
  { payDate: "2026-05-15", start: "2026-04-29", end: "2026-05-12", lines: {
      [key("Jammie", "Cook")]: { hours: 74.03, gross: 2386.73 },
      [key("Grace", "Dickerson")]: { hours: 85.53, gross: 1601.12 },
      [key("Dean", "Dickerson")]: { hours: 95.0, gross: 3062.80 },
      [key("Bruce", "Funston")]: { hours: 85.63, gross: 1781.10 },
      [key("Ethan", "Holt")]: { hours: 8.0, gross: 149.76 },
      [key("Isabella", "Holt")]: { hours: 8.0, gross: 138.11 },
      [key("Michael", "Kennedy")]: { hours: 85.63, gross: 2137.32 },
      [key("Debbie", "Maritin")]: { hours: 48.5, gross: 1513.20 },
      [key("Alexis", "Montgomery")]: { hours: 50.0, gross: 1040.00 },
      [key("Jamie", "Moseley")]: { hours: 104.08, gross: 3030.81 },
      [key("Brad", "Nickle")]: { hours: 94.0, gross: 2932.80 },
      [key("Brad", "Shaw")]: { hours: 19.55, gross: 508.30 },
  } },
  { payDate: "2026-05-01", start: "2026-04-15", end: "2026-04-28", lines: {
      [key("Jammie", "Cook")]: { hours: 101.3, gross: 3265.91 },
      [key("Grace", "Dickerson")]: { hours: 37.0, gross: 692.64 },
      [key("Dean", "Dickerson")]: { hours: 75.0, gross: 2418.00 },
      [key("Bruce", "Funston")]: { hours: 16.0, gross: 332.80 },
      [key("Ethan", "Holt")]: { hours: 4.0, gross: 74.88 },
      [key("Isabella", "Holt")]: { hours: 8.0, gross: 138.11 },
      [key("Michael", "Kennedy")]: { hours: 82.93, gross: 2069.93 },
      [key("Neil", "Korchak")]: { hours: 22.0, gross: 457.60 },
      [key("Debbie", "Maritin")]: { hours: 64.0, gross: 1996.80 },
      [key("Alexis", "Montgomery")]: { hours: 32.0, gross: 665.60 },
      [key("Jamie", "Moseley")]: { hours: 91.03, gross: 2650.79 },
      [key("Brad", "Nickle")]: { hours: 87.5, gross: 2730.00 },
  } },
  // Early-season skeleton crew; each Total Pay reconciles to reg+stat+vacation per row.
  { payDate: "2026-04-17", start: "2026-04-01", end: "2026-04-14", lines: {
      [key("Ethan", "Holt")]: { hours: 10.94, gross: 204.72 },
      [key("Isabella", "Holt")]: { hours: 9.01, gross: 215.60 },
      [key("Michael", "Kennedy")]: { hours: 64.55, gross: 1611.12 },
      [key("Neil", "Korchak")]: { hours: 7.0, gross: 145.60 },
      [key("Debbie", "Maritin")]: { hours: 50.91, gross: 1588.35 },
      [key("Alexis", "Montgomery")]: { hours: 33.04, gross: 687.23 },
      [key("Jamie", "Moseley")]: { hours: 77.36, gross: 2011.31 },
  } },
  // Winter skeleton crew (staff wages only — owner Adam Holt salary excluded, same
  // basis as the summer periods). Each row reconciles to reg+stat+vacation.
  { payDate: "2026-04-03", start: "2026-03-18", end: "2026-03-31", lines: {
      [key("Isabella", "Holt")]: { hours: 8.0, gross: 191.36 },
      [key("Debbie", "Maritin")]: { hours: 64.18, gross: 2002.42 },
      [key("Jamie", "Moseley")]: { hours: 47.15, gross: 1225.90 },
  } },
  { payDate: "2026-03-20", start: "2026-03-04", end: "2026-03-17", lines: {
      [key("Isabella", "Holt")]: { hours: 10.0, gross: 239.20 },
      [key("Debbie", "Maritin")]: { hours: 64.0, gross: 1996.80 },
      [key("Jamie", "Moseley")]: { hours: 73.0, gross: 1898.00 },
  } },
  { payDate: "2026-03-06", start: "2026-02-18", end: "2026-03-03", lines: {
      [key("Isabella", "Holt")]: { hours: 9.0, gross: 215.28 },
      [key("Debbie", "Maritin")]: { hours: 69.0, gross: 1650.48 },
      [key("Jamie", "Moseley")]: { hours: 16.0, gross: 416.00 },
  } },
  { payDate: "2026-02-20", start: "2026-02-04", end: "2026-02-17", lines: {
      [key("Isabella", "Holt")]: { hours: 12.83, gross: 306.79 },
      [key("Debbie", "Maritin")]: { hours: 42.30, gross: 1011.91 },
  } },
  { payDate: "2026-02-06", start: "2026-01-21", end: "2026-02-02", lines: {
      [key("Isabella", "Holt")]: { hours: 22.0, gross: 526.24 },
      [key("Debbie", "Maritin")]: { hours: 27.0, gross: 645.84 },
  } },
  { payDate: "2026-01-23", start: "2026-01-07", end: "2026-01-20", lines: {
      [key("Debbie", "Maritin")]: { hours: 18.0, gross: 430.56 },
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
      const ex = empByKey.get(k);
      if (ex) {
        const patch: Record<string, any> = {};
        if (ex.payType == null) patch.payType = "hourly";
        if (ex.hourlyRate == null) patch.hourlyRate = r.rate;
        if (Object.keys(patch).length) { patch.updatedAt = new Date(); await db.update(employees).set(patch).where(eq(employees.id, ex.id)); }
        continue;
      }
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
