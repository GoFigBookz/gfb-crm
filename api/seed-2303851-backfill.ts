/**
 * 2303851 ONTARIO INC PAYROLL BACKFILL — the simple one: a single salaried employee,
 * Stacey Gillham ($8,333.33/month = $100k/yr). Per Markie: post the full monthly
 * salary Jan → May, then a HALF pay for June (period Jun 1–15) because her last day
 * was June 15th — that clears out 2303851 for the year. (The Motion-Invest / Seahorse
 * lines that appear under the "2303851 Totals" rollup on the shared sheet belong to
 * other entities and are NOT part of this client.)
 *
 * Status "review". Idempotent: skips a period whose pay run already exists. Matches the
 * client by name (/2303851/).
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

const EMP = { first: "Stacey", last: "Gillham" };
const MONTHLY = 8333.33;
const HALF = round2(MONTHLY / 2); // 4166.67 — final half-month to her last day (Jun 15)

type Period = { payDate: string; start: string; end: string; gross: number };
const PERIODS: Period[] = [
  { payDate: "2026-01-31", start: "2026-01-01", end: "2026-01-31", gross: MONTHLY },
  { payDate: "2026-02-28", start: "2026-02-01", end: "2026-02-28", gross: MONTHLY },
  { payDate: "2026-03-31", start: "2026-03-01", end: "2026-03-31", gross: MONTHLY },
  { payDate: "2026-04-30", start: "2026-04-01", end: "2026-04-30", gross: MONTHLY },
  { payDate: "2026-05-31", start: "2026-05-01", end: "2026-05-31", gross: MONTHLY },
  { payDate: "2026-06-15", start: "2026-06-01", end: "2026-06-15", gross: HALF },
];

export async function backfill2303851Payroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /2303851/.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "2303851 client not found" };
    const clientId = client.id;

    const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
    let emp = existing.find((e) => key(e.firstName, e.lastName) === key(EMP.first, EMP.last));
    if (!emp) {
      const [ins] = await db.insert(employees).values({
        clientId, firstName: EMP.first, lastName: EMP.last, payType: "salary",
        annualSalary: 100000, isActive: true, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      emp = ins;
    } else if (emp.annualSalary == null) {
      await db.update(employees).set({ payType: emp.payType ?? "salary", annualSalary: 100000, updatedAt: new Date() }).where(eq(employees.id, emp.id));
    }
    if (!emp) return { client: clientId, runsAdded: 0, skipped: "could not create employee" };

    const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, clientId))) as any[];
    let runsAdded = 0;
    for (const p of PERIODS) {
      if (allRuns.some((r) => r.payDate && new Date(r.payDate).toISOString().slice(0, 10) === p.payDate)) continue;
      const gross = round2(p.gross);
      const [run] = await db.insert(payRuns).values({
        clientId, payPeriodStart: d(p.start), payPeriodEnd: d(p.end), payDate: d(p.payDate),
        frequency: "monthly", status: "review", hoursSource: "manual",
        notes: "Backfill from Google payroll sheet", createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (!run) continue;
      await db.insert(payRunLines).values({ payRunId: run.id, employeeId: emp.id, regularHours: 0, grossPay: gross } as any);
      await db.update(payRuns).set({ totalGross: gross, updatedAt: new Date() } as any).where(eq(payRuns.id, run.id));
      runsAdded++;
    }
    if (runsAdded) console.log(`[2303851-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[2303851-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
