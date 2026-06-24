/** Local smoke test: ensure rr_* schema, seed a job, verify computed schedule. Read-only-ish: cleans up after. */
import { getDb } from "../api/queries/connection";
import { ensureRevRecSchema } from "../api/ensure-revrec-schema";
import { buildProjectSchedule, rollupProject, buildRevenueCalendar, fiscalYearMonths } from "../api/revrec-core";
import { rrProjects, rrProgress, clients } from "../db/schema";
import { eq, like } from "drizzle-orm";

async function main() {
  await ensureRevRecSchema();
  console.log("[1] schema guard ran ok");

  const db = getDb();
  // find Clark Pools Owen Sound
  const cands = await db.select().from(clients).where(like(clients.name, "%Clark%")) as any[];
  console.log("[2] Clark clients:", cands.map(c => `${c.id}:${c.name}`).join(" | ") || "(none)");
  const target = cands.find(c => /owen/i.test(c.name)) ?? cands[0];
  if (!target) { console.log("no Clark client — using id 9999 sandbox"); }
  const clientId = target?.id ?? 9999;

  // seed a temp project
  const res = await db.insert(rrProjects).values({ clientId, name: "__RR_VERIFY__ Pool Build", contractValue: 100000, openingPct: 0, openingInvoiced: 0, status: "active" } as any);
  const pid = Number(res.lastInsertRowid);
  await db.insert(rrProgress).values({ projectId: pid, clientId, periodKey: "2026-01", pctComplete: 0.25, invoicedToDate: 20000 } as any);
  await db.insert(rrProgress).values({ projectId: pid, clientId, periodKey: "2026-02", pctComplete: 0.60, invoicedToDate: 70000 } as any);

  const prog = await db.select().from(rrProgress).where(eq(rrProgress.projectId, pid)) as any[];
  const sched = buildProjectSchedule({ projectId: pid, name: "Pool Build", contractValue: 100000 }, prog.map(r => ({ periodKey: r.periodKey, pctComplete: r.pctComplete, invoicedToDate: r.invoicedToDate })));
  console.log("[3] schedule:");
  for (const s of sched) console.log(`   ${s.periodKey}  ${(s.pctComplete*100).toFixed(0)}%  rev=${s.revenueThisPeriod}  earned=${s.earnedToDate}  asset=${s.contractAsset}  deferred=${s.deferredRevenue}`);
  const roll = rollupProject({ projectId: pid, name: "Pool Build", contractValue: 100000 }, sched);
  console.log("[4] rollup:", JSON.stringify(roll));
  const cal = buildRevenueCalendar(fiscalYearMonths("2026-01"), [{ projectId: pid, name: "Pool Build", schedule: sched }]);
  console.log("[5] calendar Jan/Feb:", cal.totalsByMonth[0], cal.totalsByMonth[1], "grand:", cal.grandTotal);

  // expectations
  const ok = sched[0].revenueThisPeriod === 25000 && sched[1].revenueThisPeriod === 35000 && sched[1].deferredRevenue === 10000 && roll.earnedToDate === 60000;
  console.log(ok ? "[PASS] math matches expectations" : "[FAIL] math mismatch");

  // cleanup
  await db.delete(rrProgress).where(eq(rrProgress.projectId, pid));
  await db.delete(rrProjects).where(eq(rrProjects.id, pid));
  console.log("[6] cleaned up temp rows");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
