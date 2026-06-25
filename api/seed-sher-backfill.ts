/**
 * SHER-E-PUNJAB PAYROLL BACKFILL — first client of the year backfill.
 * Loads saved pay runs (per-employee) from Markie's Google payroll sheet so the
 * year totals are real. Each period's per-employee GROSS is taken straight from the
 * sheet (Gross Pay column, vacation-incl), verified to tie to the sheet's totals.
 *
 * Runs are created at status "review" (a backfill to eyeball, not a live draft).
 * Idempotent: skips a period whose pay run already exists for this client.
 *
 * FULL YEAR (Jan 08 → Jun 26 2026): pulled from the live Google workbook via clean
 * per-tab CSV (XLSX export → unzip → parse). Each period's per-employee Total Pay
 * sum ties to that tab's Totals row to the penny.
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
  { payDate: "2026-05-29", start: "2026-05-13", end: "2026-05-26", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 60.83, gross: 994.82 },
      [key("Rohit", "Dhimal")]: { hours: 111.6, gross: 2047.14 },
      [key("Suraj", "Limbu")]: { hours: 89.52, gross: 1526.05 },
      [key("Deepak", "Vasisth")]: { hours: 101.31, gross: 1854.38 },
  } },
  { payDate: "2026-05-15", start: "2026-04-29", end: "2026-05-12", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 63.47, gross: 1161.75 },
      [key("Rohit", "Dhimal")]: { hours: 103.35, gross: 2042.20 },
      [key("Dhiren", "Gurung")]: { hours: 9.86, gross: 184.58 },
      [key("Suraj", "Limbu")]: { hours: 82.18, gross: 1538.41 },
      [key("Deepak", "Vasisth")]: { hours: 92.6, gross: 1694.95 },
  } },
  { payDate: "2026-05-01", start: "2026-04-15", end: "2026-04-28", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 61.16, gross: 1119.47 },
      [key("Rohit", "Dhimal")]: { hours: 103.84, gross: 2051.88 },
      [key("Dhiren", "Gurung")]: { hours: 19.4, gross: 363.17 },
      [key("Suraj", "Limbu")]: { hours: 80.86, gross: 1513.70 },
      [key("Deepak", "Vasisth")]: { hours: 91.73, gross: 1679.03 },
  } },
  { payDate: "2026-04-17", start: "2026-04-01", end: "2026-04-14", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 57.15, gross: 927.46 },
      [key("Rohit", "Dhimal")]: { hours: 118.88, gross: 2190.99 },
      [key("Dhiren", "Gurung")]: { hours: 20.34, gross: 347.63 },
      [key("Suraj", "Limbu")]: { hours: 96, gross: 1647.36 },
      [key("Deepak", "Vasisth")]: { hours: 108.03, gross: 1977.38 },
  } },
  { payDate: "2026-04-03", start: "2026-03-18", end: "2026-03-31", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 51.37, gross: 918.91 },
      [key("Rohit", "Dhimal")]: { hours: 95.33, gross: 1705.26 },
      [key("Dhiren", "Gurung")]: { hours: 18.66, gross: 333.79 },
      [key("Suraj", "Limbu")]: { hours: 74.47, gross: 1332.12 },
      [key("Deepak", "Vasisth")]: { hours: 87.82, gross: 1570.92 },
  } },
  { payDate: "2026-03-20", start: "2026-03-04", end: "2026-03-17", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 58.31, gross: 1043.05 },
      [key("Rohit", "Dhimal")]: { hours: 103.5, gross: 1851.41 },
      [key("Dhiren", "Gurung")]: { hours: 20.26, gross: 362.41 },
      [key("Suraj", "Limbu")]: { hours: 79.2, gross: 1416.73 },
      [key("Deepak", "Vasisth")]: { hours: 95.86, gross: 1714.74 },
  } },
  { payDate: "2026-03-06", start: "2026-02-18", end: "2026-03-03", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 66.31, gross: 1186.15 },
      [key("Rohit", "Dhimal")]: { hours: 100.59, gross: 1799.35 },
      [key("Dhiren", "Gurung")]: { hours: 13.8, gross: 246.85 },
      [key("Suraj", "Limbu")]: { hours: 81.95, gross: 1465.92 },
      [key("Deepak", "Vasisth")]: { hours: 86.53, gross: 1547.85 },
  } },
  { payDate: "2026-02-20", start: "2026-02-04", end: "2026-02-17", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 66.97, gross: 1077.75 },
      [key("Rohit", "Dhimal")]: { hours: 114.73, gross: 1844.07 },
      [key("Dhiren", "Gurung")]: { hours: 20.2, gross: 361.34 },
      [key("Suraj", "Limbu")]: { hours: 90.52, gross: 1463.60 },
      [key("Deepak", "Vasisth")]: { hours: 101.1, gross: 1808.44 },
  } },
  { payDate: "2026-02-06", start: "2026-01-21", end: "2026-02-03", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 66.01, gross: 1180.79 },
      [key("Rohit", "Dhimal")]: { hours: 100.37, gross: 1795.42 },
      [key("Suraj", "Limbu")]: { hours: 80.58, gross: 1508.46 },
      [key("Deepak", "Vasisth")]: { hours: 78.19, gross: 1398.66 },
  } },
  { payDate: "2026-01-23", start: "2026-01-07", end: "2026-01-20", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 60.34, gross: 1079.36 },
      [key("Rohit", "Dhimal")]: { hours: 102.23, gross: 1828.69 },
      [key("Suraj", "Limbu")]: { hours: 79.36, gross: 1485.62 },
      [key("Deepak", "Vasisth")]: { hours: 85.46, gross: 1528.71 },
  } },
  { payDate: "2026-01-08", start: "2025-12-24", end: "2026-01-06", lines: {
      [key("Surya", "Bhattrai")]: { hours: 0, gross: 2692.31 },
      [key("Akash", "Dahal")]: { hours: 75.72, gross: 981.51 },
      [key("Rohit", "Dhimal")]: { hours: 116.16, gross: 1490.25 },
      [key("Suraj", "Limbu")]: { hours: 96.22, gross: 1341.29 },
      [key("Deepak", "Vasisth")]: { hours: 106.72, gross: 1908.98 },
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
