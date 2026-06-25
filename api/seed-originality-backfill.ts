/**
 * ORIGINALITY.AI PAYROLL BACKFILL — full year to date (Jan → May 2026; June not run
 * yet). Pulled from the live "Originality.AI Payroll" Google sheet (monthly tabs) via
 * clean per-tab CSV (XLSX export → unzip → parse).
 *
 * Originality runs TWO payrolls each month (confirmed by Markie):
 *   1. REGULAR pay  — each employee's "Total Month Pay" (col P). Created with the
 *      standard backfill note.
 *   2. REVENUE-SHARE bonus — the separate "Share Bonus" column (col I), run on its
 *      own in QuickBooks. Originality is the ONLY client with a revenue share. These
 *      are created as separate runs noted "Revenue share bonus".
 * The share is NEVER folded into regular pay (the form only looks that way) — so the
 * two are kept as distinct runs, never netted. Per-employee figures come straight from
 * the sheet; the sheet's monthly Totals cell is a stale SUM range (omits the newest
 * hire) so we tie to the people, not that cell.
 *
 * Status "review". Idempotent: skips a (payDate, kind) run that already exists.
 * Matches the client by name (/original/i).
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const BASE_NOTE = "Backfill from Google payroll sheet";
const SHARE_NOTE = "Revenue share bonus (backfill)";

type Emp = { first: string; last: string };
const ROSTER: Emp[] = [
  { first: "Nathan", last: "Andrade Meira" },
  { first: "Narcis", last: "Bejtic" },
  { first: "Arnav", last: "Bhagawati" },
  { first: "Thomas", last: "Bongiorno" },
  { first: "Sarah", last: "Empey" },
  { first: "Michael", last: "Fraiman" },
  { first: "Jon", last: "Gillham" },
  { first: "Maddie", last: "Lambert-Taylor" },
  { first: "Motiejus", last: "Lapp" },
  { first: "Kristin", last: "Laroque" },
  { first: "Janay", last: "Ma" },
  { first: "Liam", last: "Mc Nally" },
  { first: "Joshua", last: "Moshood" },
  { first: "Urvish", last: "Patel" },
  { first: "Jessica", last: "Sawyer" },
  { first: "Ghazale", last: "Shafie" },
  { first: "Trinh", last: "Tran" },
  { first: "Connor", last: "Watt" },
  { first: "Kayla", last: "Zhu" },];

type Period = { payDate: string; start: string; end: string; lines: Record<string, { hours: number; gross: number }> };
// REGULAR monthly pay (Total Month Pay per employee).
const BASE_PERIODS: Period[] = [
  { payDate: "2026-01-31", start: "2026-01-01", end: "2026-01-31", lines: {
      [key("Nathan", "Andrade Meira")]: { hours: 0, gross: 6833.33 },
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 8268.75 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 6562.50 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 7612.50 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 4375.00 },
      [key("Michael", "Fraiman")]: { hours: 0, gross: 2587.20 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 31275.40 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 9642.54 },
      [key("Motiejus", "Lapp")]: { hours: 0, gross: 5640.00 },
      [key("Kristin", "Laroque")]: { hours: 0, gross: 3416.67 },
      [key("Janay", "Ma")]: { hours: 0, gross: 6142.50 },
      [key("Joshua", "Moshood")]: { hours: 0, gross: 7000.00 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 6431.25 },
      [key("Urvish", "Patel")]: { hours: 0, gross: 4291.67 },
      [key("Jessica", "Sawyer")]: { hours: 0, gross: 1171.50 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 9528.75 },
      [key("Connor", "Watt")]: { hours: 0, gross: 7525.00 },
  } },
  { payDate: "2026-02-28", start: "2026-02-01", end: "2026-02-28", lines: {
      [key("Nathan", "Andrade Meira")]: { hours: 0, gross: 6833.33 },
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 8268.75 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 6562.50 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 7612.50 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 4375.00 },
      [key("Michael", "Fraiman")]: { hours: 0, gross: 1174.20 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 43453.80 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 9575.19 },
      [key("Motiejus", "Lapp")]: { hours: 0, gross: 4954.17 },
      [key("Kristin", "Laroque")]: { hours: 0, gross: 3416.67 },
      [key("Janay", "Ma")]: { hours: 0, gross: 6142.50 },
      [key("Joshua", "Moshood")]: { hours: 0, gross: 7000.00 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 6431.25 },
      [key("Urvish", "Patel")]: { hours: 0, gross: 4291.67 },
      [key("Jessica", "Sawyer")]: { hours: 0, gross: 926.10 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 9528.75 },
      [key("Connor", "Watt")]: { hours: 0, gross: 7525.00 },
      [key("Kayla", "Zhu")]: { hours: 0, gross: 29.40 },
  } },
  { payDate: "2026-03-31", start: "2026-03-01", end: "2026-03-31", lines: {
      [key("Nathan", "Andrade Meira")]: { hours: 0, gross: 6833.33 },
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 8268.75 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 6562.50 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 7612.50 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 4375.00 },
      [key("Michael", "Fraiman")]: { hours: 0, gross: 620.10 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 43478.50 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 9859.67 },
      [key("Motiejus", "Lapp")]: { hours: 0, gross: 1354.17 },
      [key("Kristin", "Laroque")]: { hours: 0, gross: 3416.67 },
      [key("Janay", "Ma")]: { hours: 0, gross: 6142.50 },
      [key("Joshua", "Moshood")]: { hours: 0, gross: 7000.00 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 6431.25 },
      [key("Urvish", "Patel")]: { hours: 0, gross: 4291.67 },
      [key("Jessica", "Sawyer")]: { hours: 0, gross: 1251.60 },
      [key("Ghazale", "Shafie")]: { hours: 0, gross: 9500.00 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 9528.75 },
      [key("Connor", "Watt")]: { hours: 0, gross: 7525.00 },
      [key("Kayla", "Zhu")]: { hours: 0, gross: 1635.90 },
  } },
  { payDate: "2026-04-30", start: "2026-04-01", end: "2026-04-30", lines: {
      [key("Nathan", "Andrade Meira")]: { hours: 0, gross: 6833.33 },
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 8268.75 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 6562.50 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 7612.50 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 4375.00 },
      [key("Michael", "Fraiman")]: { hours: 0, gross: 1199.27 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 44326.10 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 10337.80 },
      [key("Motiejus", "Lapp")]: { hours: 0, gross: 1354.17 },
      [key("Kristin", "Laroque")]: { hours: 0, gross: 3416.67 },
      [key("Janay", "Ma")]: { hours: 0, gross: 6142.50 },
      [key("Joshua", "Moshood")]: { hours: 0, gross: 7000.00 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 6431.25 },
      [key("Urvish", "Patel")]: { hours: 0, gross: 4291.67 },
      [key("Jessica", "Sawyer")]: { hours: 0, gross: 979.80 },
      [key("Ghazale", "Shafie")]: { hours: 0, gross: 7500.00 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 9528.75 },
      [key("Connor", "Watt")]: { hours: 0, gross: 7525.00 },
      [key("Kayla", "Zhu")]: { hours: 0, gross: 2330.30 },
  } },
  { payDate: "2026-05-31", start: "2026-05-01", end: "2026-05-31", lines: {
      [key("Nathan", "Andrade Meira")]: { hours: 0, gross: 6833.33 },
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 8268.75 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 6562.50 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 7612.50 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 4375.00 },
      [key("Michael", "Fraiman")]: { hours: 0, gross: 1660.97 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 31603.00 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 10494.00 },
      [key("Motiejus", "Lapp")]: { hours: 0, gross: 1354.17 },
      [key("Kristin", "Laroque")]: { hours: 0, gross: 3416.67 },
      [key("Janay", "Ma")]: { hours: 0, gross: 6142.50 },
      [key("Joshua", "Moshood")]: { hours: 0, gross: 7000.00 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 6431.25 },
      [key("Urvish", "Patel")]: { hours: 0, gross: 396.07 },
      [key("Jessica", "Sawyer")]: { hours: 0, gross: 1062.60 },
      [key("Ghazale", "Shafie")]: { hours: 0, gross: 7500.00 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 9528.75 },
      [key("Connor", "Watt")]: { hours: 0, gross: 7525.00 },
      [key("Kayla", "Zhu")]: { hours: 0, gross: 280.00 },
  } },];
// REVENUE-SHARE bonus (Share Bonus column) — separate monthly run.
const SHARE_PERIODS: Period[] = [
  { payDate: "2026-01-31", start: "2026-01-01", end: "2026-01-31", lines: {
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 3195.68 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 2536.25 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 3043.50 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 1690.83 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 5275.40 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 2975.87 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 2485.53 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 3682.64 },
      [key("Connor", "Watt")]: { hours: 0, gross: 2840.60 },
  } },
  { payDate: "2026-02-28", start: "2026-02-01", end: "2026-02-28", lines: {
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 2832.87 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 2248.31 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 2608.04 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 1498.88 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 4453.80 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 2241.86 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 2203.35 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 3264.55 },
      [key("Connor", "Watt")]: { hours: 0, gross: 2578.07 },
  } },
  { payDate: "2026-03-31", start: "2026-03-01", end: "2026-03-31", lines: {
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 2848.58 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 2260.78 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 2622.51 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 1507.19 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 4478.50 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 2526.33 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 2215.57 },
      [key("Ghazale", "Shafie")]: { hours: 0, gross: 1291.88 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 3282.65 },
      [key("Connor", "Watt")]: { hours: 0, gross: 2592.36 },
  } },
  { payDate: "2026-04-30", start: "2026-04-01", end: "2026-04-30", lines: {
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 3387.71 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 2688.66 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 3118.84 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 1792.44 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 5326.10 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 3004.47 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 2634.88 },
      [key("Ghazale", "Shafie")]: { hours: 0, gross: 3072.75 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 3903.93 },
      [key("Connor", "Watt")]: { hours: 0, gross: 3082.99 },
  } },
  { payDate: "2026-05-31", start: "2026-05-01", end: "2026-05-31", lines: {
      [key("Narcis", "Bejtic")]: { hours: 0, gross: 3563.83 },
      [key("Arnav", "Bhagawati")]: { hours: 0, gross: 2828.44 },
      [key("Thomas", "Bongiorno")]: { hours: 0, gross: 3280.99 },
      [key("Sarah", "Empey")]: { hours: 0, gross: 1885.63 },
      [key("Jon", "Gillham")]: { hours: 0, gross: 5603.00 },
      [key("Maddie", "Lambert-Taylor")]: { hours: 0, gross: 3160.67 },
      [key("Liam", "Mc Nally")]: { hours: 0, gross: 2771.87 },
      [key("Ghazale", "Shafie")]: { hours: 0, gross: 3232.50 },
      [key("Trinh", "Tran")]: { hours: 0, gross: 4106.89 },
      [key("Connor", "Watt")]: { hours: 0, gross: 3243.28 },
  } },];

export async function backfillOriginalityPayroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /original/i.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "Originality client not found" };
    const clientId = client.id;

    const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
    const empByKey = new Map<string, any>();
    for (const e of existing) empByKey.set(key(e.firstName, e.lastName), e);
    for (const r of ROSTER) {
      const k = key(r.first, r.last);
      if (empByKey.get(k)) continue;
      const [ins] = await db.insert(employees).values({
        clientId, firstName: r.first, lastName: r.last, payType: "salary",
        isActive: true, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (ins) empByKey.set(k, ins);
    }

    const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, clientId))) as any[];
    let runsAdded = 0;
    const addRuns = async (periods: Period[], note: string) => {
      for (const p of periods) {
        const exists = allRuns.some((r) => r.payDate && new Date(r.payDate).toISOString().slice(0, 10) === p.payDate && (r.notes || "") === note);
        if (exists) continue;
        let totalGross = 0;
        const [run] = await db.insert(payRuns).values({
          clientId, payPeriodStart: d(p.start), payPeriodEnd: d(p.end), payDate: d(p.payDate),
          frequency: "monthly", status: "review", hoursSource: "manual",
          notes: note, createdAt: new Date(), updatedAt: new Date(),
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
    };
    await addRuns(BASE_PERIODS, BASE_NOTE);
    await addRuns(SHARE_PERIODS, SHARE_NOTE);
    if (runsAdded) console.log(`[og-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[og-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
