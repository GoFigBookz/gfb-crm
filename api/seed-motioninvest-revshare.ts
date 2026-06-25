/**
 * MOTION INVEST INC — REVENUE-SHARE BONUS (quarterly, net-profit based).
 *
 * Model (Markie 2026-06-25): Kelley Van Boxmeer gets 10% and Ryan Gunn gets 1% of
 * NET PROFIT, tracked off the Motion Invest P&L ("PnL 2019-2024 - MotionInvest", the
 * Net Profit (CAD) row). It's paid QUARTERLY, the month AFTER quarter-end (Q1→Apr 30,
 * Q2→Jul 31, Q3→Oct 31, Q4→Jan 31), which gives Kelley time to finish the sheet. Loss
 * months are NETTED into the period and carried as an ONGOING cumulative balance — a
 * losing quarter reduces the balance owed rather than clawing back pay already made.
 * A reconciliation happens each January.
 *
 * Implementation: each quarter carries its net profit; the cumulative share EARNED is
 * pct × cumulative-net-profit, and a quarter's payout = max(0, earned-to-date − paid-
 * to-date). Runs are created as separate "Revenue share bonus" runs (status review),
 * one per quarter, ONLY once the quarter's pay date has arrived. Idempotent.
 *
 * Opening balance is 0 at Jan 2026 (per the annual January reconciliation). When a new
 * quarter closes and the sheet is updated, append it to QUARTERS.
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

// Revenue-share recipients and their cut of net profit.
const SHARERS = [
  { first: "Kelley", last: "Van Boxmeer", pct: 0.10 },
  { first: "Ryan", last: "Gunn", pct: 0.01 },
];

// Quarter net profit (CAD) from the Motion Invest P&L "Net Profit (CAD)" row.
type Quarter = { label: string; payDate: string; start: string; end: string; netProfit: number };
const QUARTERS: Quarter[] = [
  // Q1 2026: Jan -2,724.56 + Feb -150.36 + Mar 4,478.11
  { label: "Q1 2026", payDate: "2026-04-30", start: "2026-01-01", end: "2026-03-31", netProfit: 1603.19 },
  // Q2 2026: Apr -4,910.86 + May 4,440.91 + Jun 3,023.78
  { label: "Q2 2026", payDate: "2026-07-31", start: "2026-04-01", end: "2026-06-30", netProfit: 2553.83 },
];

export async function backfillMotionInvestRevShare(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /motion\s*invest/i.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "Motion Invest client not found" };
    const clientId = client.id;

    const existing = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
    const empByKey = new Map<string, any>();
    for (const e of existing) empByKey.set(key(e.firstName, e.lastName), e);
    // Ensure the two sharers exist (the regular Motion Invest backfill normally creates them).
    for (const s of SHARERS) {
      const k = key(s.first, s.last);
      if (empByKey.get(k)) continue;
      const [ins] = await db.insert(employees).values({
        clientId, firstName: s.first, lastName: s.last,
        payType: s.last === "Van Boxmeer" ? "salary" : "commission",
        isActive: true, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (ins) empByKey.set(k, ins);
    }

    const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, clientId))) as any[];
    const now = new Date();
    let runsAdded = 0;
    let cumNet = 0;
    const paidByKey = new Map<string, number>(); // cumulative share already allocated per sharer
    for (const q of QUARTERS) {
      cumNet = round2(cumNet + q.netProfit);
      const note = `Revenue share bonus (${q.label})`;
      const due = d(q.payDate) <= now;
      const exists = allRuns.some((r) => (r.notes || "") === note);
      // Compute this quarter's payout per sharer from the running balance.
      const lines: { emp: any; amount: number }[] = [];
      for (const s of SHARERS) {
        const k = key(s.first, s.last);
        const earned = round2(cumNet * s.pct);
        const prior = paidByKey.get(k) || 0;
        const payout = round2(Math.max(0, earned - prior));
        paidByKey.set(k, prior + payout);
        const emp = empByKey.get(k);
        if (emp && payout > 0) lines.push({ emp, amount: payout });
      }
      if (!due || exists || !lines.length) continue;
      let totalGross = 0;
      const [run] = await db.insert(payRuns).values({
        clientId, payPeriodStart: d(q.start), payPeriodEnd: d(q.end), payDate: d(q.payDate),
        frequency: "quarterly", status: "review", hoursSource: "manual",
        notes: note, createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      if (!run) continue;
      for (const ln of lines) {
        totalGross += ln.amount;
        await db.insert(payRunLines).values({ payRunId: run.id, employeeId: ln.emp.id, regularHours: 0, grossPay: ln.amount } as any);
      }
      await db.update(payRuns).set({ totalGross: round2(totalGross), updatedAt: new Date() } as any).where(eq(payRuns.id, run.id));
      runsAdded++;
    }
    if (runsAdded) console.log(`[mi-revshare] added ${runsAdded} quarterly run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[mi-revshare] failed:", err instanceof Error ? err.message : err);
  }
}
