/**
 * MOTION INVEST INC. PAYROLL BACKFILL — pulled from the Motion Invest block on the
 * shared "Originality.AI Payroll" workbook (monthly tabs). Two active people:
 *   - Kelley Van Boxmeer — $6,250/month flat (salary, $75k/yr)
 *   - Ryan Gunn          — variable monthly (Jan $4,320, Feb $3,888, Mar $4,428,
 *                          Apr $4,296)
 * (Amel and Ryan Watson appear at $0 — inactive — and are skipped.)
 * Each month ties to the sheet's Motion Invest block total to the penny (e.g. Jan
 * 4,320 + 6,250 = 10,570). The sheet only carries Jan–Apr so far (May/Jun not yet
 * recorded), so those are the months loaded.
 *
 * Status "review". Idempotent: skips a month whose pay run already exists. Matches the
 * client by name (/motion\s*invest/i).
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

type Emp = { first: string; last: string; payType: "salary" | "commission"; salary?: number };
const ROSTER: Emp[] = [
  { first: "Kelley", last: "Van Boxmeer", payType: "salary", salary: 75000 },
  { first: "Ryan", last: "Gunn", payType: "commission" },
];

type Period = { payDate: string; start: string; end: string; lines: Record<string, { gross: number }> };
const PERIODS: Period[] = [
  { payDate: "2026-01-31", start: "2026-01-01", end: "2026-01-31", lines: {
      [key("Ryan", "Gunn")]: { gross: 4320 }, [key("Kelley", "Van Boxmeer")]: { gross: 6250 } } },
  { payDate: "2026-02-28", start: "2026-02-01", end: "2026-02-28", lines: {
      [key("Ryan", "Gunn")]: { gross: 3888 }, [key("Kelley", "Van Boxmeer")]: { gross: 6250 } } },
  { payDate: "2026-03-31", start: "2026-03-01", end: "2026-03-31", lines: {
      [key("Ryan", "Gunn")]: { gross: 4428 }, [key("Kelley", "Van Boxmeer")]: { gross: 6250 } } },
  { payDate: "2026-04-30", start: "2026-04-01", end: "2026-04-30", lines: {
      [key("Ryan", "Gunn")]: { gross: 4296 }, [key("Kelley", "Van Boxmeer")]: { gross: 6250 } } },
];

export async function backfillMotionInvestPayroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /motion\s*invest/i.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "Motion Invest client not found" };
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
        if (r.payType === "salary" && ex.annualSalary == null && r.salary != null) patch.annualSalary = r.salary;
        if (Object.keys(patch).length) { patch.updatedAt = new Date(); await db.update(employees).set(patch).where(eq(employees.id, ex.id)); }
        continue;
      }
      const [ins] = await db.insert(employees).values({
        clientId, firstName: r.first, lastName: r.last, payType: r.payType,
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
        frequency: "monthly", status: "review", hoursSource: "manual",
        notes: "Backfill from Google payroll sheet", createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (!run) continue;
      for (const [k, v] of Object.entries(p.lines)) {
        const emp = empByKey.get(k);
        if (!emp) continue;
        const gross = round2(v.gross);
        totalGross += gross;
        await db.insert(payRunLines).values({ payRunId: run.id, employeeId: emp.id, regularHours: 0, grossPay: gross } as any);
      }
      await db.update(payRuns).set({ totalGross: round2(totalGross), updatedAt: new Date() } as any).where(eq(payRuns.id, run.id));
      runsAdded++;
    }
    if (runsAdded) console.log(`[motioninvest-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[motioninvest-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
