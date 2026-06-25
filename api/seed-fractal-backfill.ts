/**
 * FRACTAL SAAS INC. PAYROLL BACKFILL — the easy one: a single salaried employee,
 * Andrew Raines, paid the same amount every month on QuickBooks autopay ($4,500/mo =
 * $54k/yr, confirmed on the Originality payroll workbook's Fractal block, Jan–Apr; the
 * autopay amount is unchanged, so Jan→Jun are posted at $4,500 each).
 *
 * Status "review". Idempotent: skips a month whose pay run already exists. Matches the
 * client by name (/fractal/i). Reuses the existing "Andrew" employee record (fills in
 * the last name + salary) rather than creating a duplicate.
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const d = (s: string) => new Date(`${s}T12:00:00Z`);

const MONTHLY = 4500;
const PERIODS = [
  { payDate: "2026-01-31", start: "2026-01-01", end: "2026-01-31" },
  { payDate: "2026-02-28", start: "2026-02-01", end: "2026-02-28" },
  { payDate: "2026-03-31", start: "2026-03-01", end: "2026-03-31" },
  { payDate: "2026-04-30", start: "2026-04-01", end: "2026-04-30" },
  { payDate: "2026-05-31", start: "2026-05-01", end: "2026-05-31" },
  { payDate: "2026-06-30", start: "2026-06-01", end: "2026-06-30" },
];

export async function backfillFractalPayroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /fractal/i.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "Fractal SaaS client not found" };
    const clientId = client.id;

    // Reuse the existing single "Andrew" employee if present (fill last name + salary).
    const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
    let emp = existing.find((e) => norm(e.firstName) === "andrew");
    if (emp) {
      const patch: Record<string, any> = {};
      if (!emp.lastName) patch.lastName = "Raines";
      if (emp.payType == null) patch.payType = "salary";
      if (emp.annualSalary == null) patch.annualSalary = MONTHLY * 12;
      if (Object.keys(patch).length) { patch.updatedAt = new Date(); await db.update(employees).set(patch).where(eq(employees.id, emp.id)); emp = { ...emp, ...patch }; }
    } else {
      const [ins] = await db.insert(employees).values({
        clientId, firstName: "Andrew", lastName: "Raines", payType: "salary",
        annualSalary: MONTHLY * 12, isActive: true, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      emp = ins;
    }
    if (!emp) return { client: clientId, runsAdded: 0, skipped: "could not resolve Andrew" };

    const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, clientId))) as any[];
    let runsAdded = 0;
    for (const p of PERIODS) {
      if (allRuns.some((r) => r.payDate && new Date(r.payDate).toISOString().slice(0, 10) === p.payDate)) continue;
      const [run] = await db.insert(payRuns).values({
        clientId, payPeriodStart: d(p.start), payPeriodEnd: d(p.end), payDate: d(p.payDate),
        frequency: "monthly", status: "review", hoursSource: "manual",
        notes: "Backfill from Google payroll sheet", createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (!run) continue;
      await db.insert(payRunLines).values({ payRunId: run.id, employeeId: emp.id, regularHours: 0, grossPay: round2(MONTHLY) } as any);
      await db.update(payRuns).set({ totalGross: round2(MONTHLY), updatedAt: new Date() } as any).where(eq(payRuns.id, run.id));
      runsAdded++;
    }
    if (runsAdded) console.log(`[fractal-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[fractal-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
