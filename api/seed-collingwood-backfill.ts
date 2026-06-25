/**
 * CLARK COLLINGWOOD PAYROLL BACKFILL — read straight from the live Google payroll
 * sheet ("CP-Collingwood Payroll & Cap Table"). One saved pay run per period with
 * per-employee lines so Collingwood's year-to-date gross is real "at a glance".
 *
 * Each period's per-employee gross is the sheet's own "Total Pay" column (regular +
 * stat + vacation + phone allowance). VERIFIED: the per-employee "Total Regular Pay"
 * sums tie to the sheet's Totals row to the penny each period
 * (Jun 26 $19,073.25, Jun 12 $20,446.39, May 29 $17,682.36, May 15 $16,522.02),
 * and the two salaried owners are exact ($2,330.77 / $3,100.00 incl. phone).
 *
 * Status "review" (a backfill to eyeball). Idempotent: skips a period whose pay run
 * already exists. CLIENT_ID 7 = Clark Pools and Spas Collingwood (verified by name).
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const CLIENT_ID = 7;
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

type Emp = { first: string; last: string; payType: "salary" | "hourly"; rate?: number; salary?: number };
const ROSTER: Emp[] = [
  { first: "Chris", last: "Hawton", payType: "salary", salary: 60000 },
  { first: "Brendan", last: "Essex", payType: "salary", salary: 80000 },
  { first: "Matteo", last: "Companion", payType: "hourly", rate: 18.0 },
  { first: "Logan", last: "Greig", payType: "hourly", rate: 24.0 },
  { first: "Chris", last: "Haight", payType: "hourly", rate: 27.0 },
  { first: "Corey", last: "Hawton", payType: "hourly", rate: 26.5 },
  { first: "Justin", last: "Koutsomichos", payType: "hourly", rate: 23.0 },
  { first: "Dave", last: "Lally", payType: "hourly", rate: 24.0 },
  { first: "Aidan", last: "MacDonald", payType: "hourly", rate: 21.0 },
  { first: "Justin", last: "Pool", payType: "hourly", rate: 22.0 },
  { first: "Adrian", last: "Robbeson", payType: "hourly", rate: 24.0 },
  { first: "Chris", last: "Thompson", payType: "hourly", rate: 24.0 },
  { first: "Lisa", last: "Venditti", payType: "hourly", rate: 25.0 },
  { first: "Alan", last: "Weaver", payType: "hourly", rate: 35.0 },
];

// hours = Total Hours; gross = Total Pay (the sheet's own paid column).
type Period = { payDate: string; start: string; end: string; lines: Record<string, { hours: number; gross: number }> };
const PERIODS: Period[] = [
  { payDate: "2026-06-26", start: "2026-06-10", end: "2026-06-23", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 3100.00 },
      [key("Matteo", "Companion")]: { hours: 88.78, gross: 1598.04 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 90.67, gross: 1742.17 },
      [key("Corey", "Hawton")]: { hours: 90.63, gross: 2424.78 },
      [key("Justin", "Koutsomichos")]: { hours: 83.83, gross: 1951.17 },
      [key("Dave", "Lally")]: { hours: 67.15, gross: 1611.60 },
      [key("Aidan", "MacDonald")]: { hours: 92.98, gross: 1975.58 },
      [key("Justin", "Pool")]: { hours: 0, gross: 0.00 },
      [key("Adrian", "Robbeson")]: { hours: 92.37, gross: 2239.96 },
      [key("Chris", "Thompson")]: { hours: 37.98, gross: 934.60 },
      [key("Lisa", "Venditti")]: { hours: 86.45, gross: 2184.33 },
      [key("Alan", "Weaver")]: { hours: 73.50, gross: 2595.58 },
  } },
  { payDate: "2026-06-12", start: "2026-05-27", end: "2026-06-09", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 3100.00 },
      [key("Matteo", "Companion")]: { hours: 64.63, gross: 1163.34 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 90.43, gross: 2464.69 },
      [key("Corey", "Hawton")]: { hours: 84.78, gross: 2269.75 },
      [key("Justin", "Koutsomichos")]: { hours: 101.62, gross: 2360.34 },
      [key("Dave", "Lally")]: { hours: 84.85, gross: 2036.40 },
      [key("Aidan", "MacDonald")]: { hours: 54.67, gross: 1171.07 },
      [key("Justin", "Pool")]: { hours: 38.06, gross: 837.32 },
      [key("Adrian", "Robbeson")]: { hours: 97.00, gross: 2351.08 },
      [key("Chris", "Thompson")]: { hours: 66.78, gross: 1625.80 },
      [key("Lisa", "Venditti")]: { hours: 93.80, gross: 2368.08 },
      [key("Alan", "Weaver")]: { hours: 56.00, gross: 1983.08 },
  } },
  // Victoria Day stat in this period (stat pay folded into each Total Pay).
  { payDate: "2026-05-29", start: "2026-05-13", end: "2026-05-26", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 3100.00 },
      [key("Matteo", "Companion")]: { hours: 88.95, gross: 1601.10 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 87.78, gross: 2393.14 },
      [key("Corey", "Hawton")]: { hours: 96.90, gross: 2590.93 },
      [key("Justin", "Koutsomichos")]: { hours: 76.68, gross: 1786.72 },
      [key("Dave", "Lally")]: { hours: 87.95, gross: 2110.80 },
      [key("Justin", "Pool")]: { hours: 23.13, gross: 508.86 },
      [key("Adrian", "Robbeson")]: { hours: 94.72, gross: 2296.36 },
      [key("Chris", "Thompson")]: { hours: 62.27, gross: 1517.50 },
      [key("Lisa", "Venditti")]: { hours: 89.23, gross: 2253.83 },
      [key("Alan", "Weaver")]: { hours: 71.50, gross: 2525.58 },
  } },
  { payDate: "2026-05-15", start: "2026-04-29", end: "2026-05-12", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 3100.00 },
      [key("Matteo", "Companion")]: { hours: 99.85, gross: 1797.30 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 72.95, gross: 1587.73 },
      [key("Corey", "Hawton")]: { hours: 101.19, gross: 2704.62 },
      [key("Justin", "Koutsomichos")]: { hours: 88.15, gross: 2050.53 },
      [key("Dave", "Lally")]: { hours: 90.02, gross: 2160.48 },
      [key("Adrian", "Robbeson")]: { hours: 126.92, gross: 2697.16 },
      [key("Chris", "Thompson")]: { hours: 58.73, gross: 1432.60 },
      [key("Lisa", "Venditti")]: { hours: 88.28, gross: 2230.08 },
      [key("Alan", "Weaver")]: { hours: 68.00, gross: 2403.08 },
  } },
  // Earlier 2026 periods (Jan 23 → May 01) — each ties to the sheet cost−tax to the penny.
  { payDate: "2026-05-01", start: "2026-04-15", end: "2026-04-28", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 83.73, gross: 1507.14 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 79.78, gross: 2077.42 },
      [key("Justin", "Koutsomichos")]: { hours: 87.25, gross: 2006.75 },
      [key("Dave", "Lally")]: { hours: 96.23, gross: 2309.52 },
      [key("Adrian", "Robbeson")]: { hours: 90.07, gross: 2094.69 },
      [key("Chris", "Thompson")]: { hours: 37.07, gross: 912.76 },
      [key("Lisa", "Venditti")]: { hours: 45.35, gross: 1156.83 },
  } },
  { payDate: "2026-04-17", start: "2026-04-01", end: "2026-04-14", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 13.58, gross: 244.44 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 53.15, gross: 1391.69 },
      [key("Justin", "Koutsomichos")]: { hours: 30, gross: 690.00 },
      [key("Dave", "Lally")]: { hours: 21.55, gross: 517.20 },
      [key("Adrian", "Robbeson")]: { hours: 16.22, gross: 396.14 },
      [key("Chris", "Thompson")]: { hours: 0, gross: 23.08 },
      [key("Lisa", "Venditti")]: { hours: 37.51, gross: 960.91 },
  } },
  { payDate: "2026-04-03", start: "2026-03-18", end: "2026-03-31", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 0, gross: 0.00 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 70.28, gross: 1905.18 },
      [key("Adrian", "Robbeson")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Thompson")]: { hours: 0, gross: 23.08 },
      [key("Lisa", "Venditti")]: { hours: 68.27, gross: 1798.10 },
  } },
  { payDate: "2026-03-20", start: "2026-03-04", end: "2026-03-17", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 0, gross: 0.00 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 92.75, gross: 2506.93 },
      [key("Adrian", "Robbeson")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Thompson")]: { hours: 0, gross: 23.08 },
      [key("Lisa", "Venditti")]: { hours: 77.78, gross: 2045.36 },
  } },
  { payDate: "2026-03-06", start: "2026-02-18", end: "2026-03-03", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 0, gross: 0.00 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 91.48, gross: 2472.91 },
      [key("Adrian", "Robbeson")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Thompson")]: { hours: 0, gross: 23.08 },
      [key("Lisa", "Venditti")]: { hours: 79.71, gross: 2095.62 },
  } },
  { payDate: "2026-02-20", start: "2026-02-04", end: "2026-02-17", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 0, gross: 0.00 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 89.17, gross: 2411.05 },
      [key("Adrian", "Robbeson")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Thompson")]: { hours: 0, gross: 23.08 },
      [key("Lisa", "Venditti")]: { hours: 79.18, gross: 2081.84 },
  } },
  { payDate: "2026-02-06", start: "2026-01-21", end: "2026-02-03", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 0, gross: 0.00 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 85.13, gross: 2302.86 },
      [key("Adrian", "Robbeson")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Thompson")]: { hours: 0, gross: 23.08 },
      [key("Lisa", "Venditti")]: { hours: 75.33, gross: 1981.66 },
  } },
  { payDate: "2026-01-23", start: "2026-01-07", end: "2026-01-20", lines: {
      [key("Chris", "Hawton")]: { hours: 0, gross: 2330.77 },
      [key("Brendan", "Essex")]: { hours: 0, gross: 2330.77 },
      [key("Matteo", "Companion")]: { hours: 0, gross: 0.00 },
      [key("Logan", "Greig")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Haight")]: { hours: 0, gross: 23.08 },
      [key("Corey", "Hawton")]: { hours: 87.65, gross: 2370.35 },
      [key("Adrian", "Robbeson")]: { hours: 0, gross: 23.08 },
      [key("Chris", "Thompson")]: { hours: 0, gross: 23.08 },
      [key("Lisa", "Venditti")]: { hours: 69.33, gross: 1825.66 },
  } },
];

export async function backfillCollingwoodPayroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const client = (await db.select().from(clients).where(eq(clients.id, CLIENT_ID)).limit(1))[0] as any;
    if (!client) return { client: null, runsAdded: 0, skipped: "client 7 not found" };
    if (!/colling/i.test(client.name || "")) return { client: null, runsAdded: 0, skipped: `client 7 is "${client.name}", not Collingwood` };
    const clientId = client.id;

    const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
    const empByKey = new Map<string, any>();
    for (const e of existing) empByKey.set(key(e.firstName, e.lastName), e);
    for (const r of ROSTER) {
      const k = key(r.first, r.last);
      const ex = empByKey.get(k);
      if (ex) {
        const patch: Record<string, any> = {};
        if (ex.payType == null) patch.payType = r.payType;
        if (r.payType === "hourly" && ex.hourlyRate == null && r.rate != null) patch.hourlyRate = r.rate;
        if (r.payType === "salary" && ex.annualSalary == null && r.salary != null) patch.annualSalary = r.salary;
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
    if (runsAdded) console.log(`[cw-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[cw-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
