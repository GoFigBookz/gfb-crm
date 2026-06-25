/**
 * THE AULD SPOT PUB PAYROLL BACKFILL — full year (Jan 08 → Jun 26 2026).
 * Pulled from the live Google workbook via clean per-tab CSV (XLSX export → unzip →
 * parse). Auld is a TouchBistro pub with a fluid roster; the sheet uses two slightly
 * different column layouts across the year, so columns are read by header name. Each
 * period's per-employee "Total Gross Pay" sum ties to that tab's Totals row to the
 * penny. The "Jun 26" tab had stale date cells, corrected to its real pay date/period.
 *
 * Status "review" (a backfill to eyeball). Idempotent: skips a period whose pay run
 * already exists. Matches the client by name (/auld/i).
 */
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, payRunLines } from "../db/schema";
import { eq } from "drizzle-orm";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
const key = (first: string, last: string) => `${norm(last)}|${norm(first)}`;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

type Emp = { first: string; last: string; rate: number | null };
const ROSTER: Emp[] = [
  { first: "James", last: "Allard", rate: 20 },
  { first: "Bhima", last: "Bhattarai", rate: 17.6 },
  { first: "Heather", last: "Capstick", rate: 18 },
  { first: "Maddy", last: "Cooper", rate: 17.6 },
  { first: "Eric", last: "Cressos", rate: 18 },
  { first: "Kimberly", last: "Daly", rate: 17.6 },
  { first: "Karma", last: "Dozang", rate: 20 },
  { first: "Paige", last: "Ferlatte", rate: 17.6 },
  { first: "Charlotte", last: "Fowler", rate: 17.6 },
  { first: "Breanna", last: "Fox", rate: 18 },
  { first: "Lee Anne", last: "Hrabi", rate: 17.6 },
  { first: "Robert", last: "Jacobson", rate: 30 },
  { first: "Bonnie", last: "Malone", rate: 17.6 },
  { first: "Amal", last: "Ragh", rate: 21 },
  { first: "Bryah", last: "Risdon", rate: 17.6 },
  { first: "Lauren", last: "Temple", rate: 17.6 },
  { first: "Jayvi Tri", last: "Tsan", rate: 20 },
  { first: "Leah", last: "Young", rate: 17.6 },];

type Period = { payDate: string; start: string; end: string; lines: Record<string, { hours: number; gross: number }> };
// Verified: each period's line-gross sum ties to the tab's Totals row (Total Gross Pay).
const PERIODS: Period[] = [
  { payDate: "2026-06-26", start: "2026-06-10", end: "2026-06-23", lines: {
      [key("James", "Allard")]: { hours: 76.27, gross: 1586.42 },
      [key("Bhima", "Bhattarai")]: { hours: 74.58, gross: 1365.11 },
      [key("Heather", "Capstick")]: { hours: 70.78, gross: 1325.00 },
      [key("Eric", "Cressos")]: { hours: 56.87, gross: 1064.61 },
      [key("Karma", "Dozang")]: { hours: 26.65, gross: 554.32 },
      [key("Paige", "Ferlatte")]: { hours: 52.16, gross: 954.74 },
      [key("Breanna", "Fox")]: { hours: 85.22, gross: 1595.32 },
      [key("Lee Anne", "Hrabi")]: { hours: 63.91, gross: 1169.81 },
      [key("Robert", "Jacobson")]: { hours: 93.37, gross: 2913.14 },
      [key("Bonnie", "Malone")]: { hours: 55.82, gross: 1021.73 },
      [key("Amal", "Ragh")]: { hours: 89.44, gross: 1953.37 },
      [key("Bryah", "Risdon")]: { hours: 52.71, gross: 964.80 },
      [key("Lauren", "Temple")]: { hours: 14.71, gross: 269.25 },
      [key("Jayvi Tri", "Tsan")]: { hours: 42.68, gross: 887.74 },
  } },
  { payDate: "2026-06-12", start: "2026-05-27", end: "2026-06-09", lines: {
      [key("James", "Allard")]: { hours: 76.84, gross: 1598.27 },
      [key("Bhima", "Bhattarai")]: { hours: 69.6, gross: 1273.96 },
      [key("Heather", "Capstick")]: { hours: 49.09, gross: 918.96 },
      [key("Eric", "Cressos")]: { hours: 62.78, gross: 1175.24 },
      [key("Karma", "Dozang")]: { hours: 28.94, gross: 601.95 },
      [key("Paige", "Ferlatte")]: { hours: 48.67, gross: 890.86 },
      [key("Breanna", "Fox")]: { hours: 84.96, gross: 1590.45 },
      [key("Lee Anne", "Hrabi")]: { hours: 45.88, gross: 839.79 },
      [key("Robert", "Jacobson")]: { hours: 85.52, gross: 2668.22 },
      [key("Bonnie", "Malone")]: { hours: 80.87, gross: 1480.24 },
      [key("Amal", "Ragh")]: { hours: 69.36, gross: 1514.82 },
      [key("Bryah", "Risdon")]: { hours: 61.35, gross: 1122.95 },
      [key("Jayvi Tri", "Tsan")]: { hours: 36.14, gross: 751.71 },
  } },
  { payDate: "2026-05-29", start: "2026-05-13", end: "2026-05-26", lines: {
      [key("James", "Allard")]: { hours: 85.75, gross: 1850.37 },
      [key("Bhima", "Bhattarai")]: { hours: 80.85, gross: 1529.82 },
      [key("Heather", "Capstick")]: { hours: 63.84, gross: 1195.13 },
      [key("Maddy", "Cooper")]: { hours: 18.38, gross: 336.42 },
      [key("Eric", "Cressos")]: { hours: 52.15, gross: 976.20 },
      [key("Karma", "Dozang")]: { hours: 26.37, gross: 548.48 },
      [key("Paige", "Ferlatte")]: { hours: 57.62, gross: 1054.67 },
      [key("Breanna", "Fox")]: { hours: 80.86, gross: 1586.91 },
      [key("Lee Anne", "Hrabi")]: { hours: 69.09, gross: 1329.41 },
      [key("Robert", "Jacobson")]: { hours: 112.84, gross: 3638.23 },
      [key("Bonnie", "Malone")]: { hours: 82.19, gross: 1588.17 },
      [key("Amal", "Ragh")]: { hours: 89.98, gross: 2064.64 },
      [key("Bryah", "Risdon")]: { hours: 44.55, gross: 815.51 },
      [key("Jayvi Tri", "Tsan")]: { hours: 52.99, gross: 1176.65 },
  } },
  { payDate: "2026-05-15", start: "2026-04-29", end: "2026-05-12", lines: {
      [key("James", "Allard")]: { hours: 84.92, gross: 1766.34 },
      [key("Bhima", "Bhattarai")]: { hours: 74.98, gross: 1372.43 },
      [key("Heather", "Capstick")]: { hours: 46.35, gross: 867.67 },
      [key("Maddy", "Cooper")]: { hours: 35.88, gross: 656.75 },
      [key("Eric", "Cressos")]: { hours: 57.94, gross: 1084.64 },
      [key("Kimberly", "Daly")]: { hours: 30.1, gross: 550.95 },
      [key("Karma", "Dozang")]: { hours: 19.14, gross: 398.11 },
      [key("Paige", "Ferlatte")]: { hours: 47.63, gross: 871.82 },
      [key("Breanna", "Fox")]: { hours: 68.09, gross: 1274.64 },
      [key("Lee Anne", "Hrabi")]: { hours: 53.17, gross: 973.22 },
      [key("Robert", "Jacobson")]: { hours: 86.4, gross: 2695.68 },
      [key("Bonnie", "Malone")]: { hours: 65.68, gross: 1202.21 },
      [key("Amal", "Ragh")]: { hours: 84.93, gross: 1854.87 },
      [key("Bryah", "Risdon")]: { hours: 33.3, gross: 609.52 },
      [key("Jayvi Tri", "Tsan")]: { hours: 33.92, gross: 705.54 },
  } },
  { payDate: "2026-05-01", start: "2026-04-15", end: "2026-04-28", lines: {
      [key("James", "Allard")]: { hours: 63.24, gross: 1315.39 },
      [key("Bhima", "Bhattarai")]: { hours: 68.16, gross: 1247.60 },
      [key("Heather", "Capstick")]: { hours: 47.38, gross: 886.95 },
      [key("Maddy", "Cooper")]: { hours: 23.54, gross: 430.88 },
      [key("Eric", "Cressos")]: { hours: 43.92, gross: 822.18 },
      [key("Kimberly", "Daly")]: { hours: 36.62, gross: 670.29 },
      [key("Karma", "Dozang")]: { hours: 27.58, gross: 573.66 },
      [key("Paige", "Ferlatte")]: { hours: 47.63, gross: 871.82 },
      [key("Breanna", "Fox")]: { hours: 59.23, gross: 1108.79 },
      [key("Lee Anne", "Hrabi")]: { hours: 56.34, gross: 1031.25 },
      [key("Robert", "Jacobson")]: { hours: 88.08, gross: 2748.10 },
      [key("Bonnie", "Malone")]: { hours: 63.1, gross: 1154.98 },
      [key("Amal", "Ragh")]: { hours: 96.49, gross: 2107.34 },
      [key("Bryah", "Risdon")]: { hours: 31.39, gross: 574.56 },
      [key("Jayvi Tri", "Tsan")]: { hours: 40.77, gross: 848.02 },
  } },
  { payDate: "2026-04-17", start: "2026-04-01", end: "2026-04-14", lines: {
      [key("James", "Allard")]: { hours: 96.18, gross: 2095.36 },
      [key("Bhima", "Bhattarai")]: { hours: 76.03, gross: 1460.79 },
      [key("Heather", "Capstick")]: { hours: 72.21, gross: 1426.81 },
      [key("Eric", "Cressos")]: { hours: 50.35, gross: 942.52 },
      [key("Kimberly", "Daly")]: { hours: 36.7, gross: 701.55 },
      [key("Karma", "Dozang")]: { hours: 13.04, gross: 271.26 },
      [key("Paige", "Ferlatte")]: { hours: 52.79, gross: 966.26 },
      [key("Breanna", "Fox")]: { hours: 82.55, gross: 1615.57 },
      [key("Lee Anne", "Hrabi")]: { hours: 47.56, gross: 929.72 },
      [key("Robert", "Jacobson")]: { hours: 104.34, gross: 3392.22 },
      [key("Bonnie", "Malone")]: { hours: 77.93, gross: 1483.38 },
      [key("Amal", "Ragh")]: { hours: 86.43, gross: 1981.00 },
      [key("Bryah", "Risdon")]: { hours: 53.95, gross: 987.58 },
      [key("Jayvi Tri", "Tsan")]: { hours: 56.25, gross: 1169.90 },
  } },
  { payDate: "2026-04-03", start: "2026-03-18", end: "2026-03-31", lines: {
      [key("James", "Allard")]: { hours: 63.76, gross: 1326.21 },
      [key("Bhima", "Bhattarai")]: { hours: 66.67, gross: 1220.33 },
      [key("Heather", "Capstick")]: { hours: 65.86, gross: 1232.90 },
      [key("Eric", "Cressos")]: { hours: 58.56, gross: 1096.24 },
      [key("Kimberly", "Daly")]: { hours: 74.33, gross: 1360.54 },
      [key("Karma", "Dozang")]: { hours: 25.05, gross: 521.04 },
      [key("Paige", "Ferlatte")]: { hours: 42.87, gross: 784.69 },
      [key("Breanna", "Fox")]: { hours: 63.62, gross: 1190.97 },
      [key("Lee Anne", "Hrabi")]: { hours: 23.83, gross: 436.18 },
      [key("Robert", "Jacobson")]: { hours: 92.08, gross: 2872.90 },
      [key("Bonnie", "Malone")]: { hours: 56, gross: 1025.02 },
      [key("Amal", "Ragh")]: { hours: 73.17, gross: 1598.03 },
      [key("Bryah", "Risdon")]: { hours: 16.04, gross: 293.60 },
      [key("Jayvi Tri", "Tsan")]: { hours: 41.72, gross: 867.78 },
  } },
  { payDate: "2026-03-20", start: "2026-03-04", end: "2026-03-17", lines: {
      [key("James", "Allard")]: { hours: 66.59, gross: 1385.07 },
      [key("Bhima", "Bhattarai")]: { hours: 67.19, gross: 1229.85 },
      [key("Heather", "Capstick")]: { hours: 68.55, gross: 1283.26 },
      [key("Eric", "Cressos")]: { hours: 65.03, gross: 1217.36 },
      [key("Kimberly", "Daly")]: { hours: 30.83, gross: 564.31 },
      [key("Karma", "Dozang")]: { hours: 24.89, gross: 517.71 },
      [key("Paige", "Ferlatte")]: { hours: 29.55, gross: 540.88 },
      [key("Breanna", "Fox")]: { hours: 81.65, gross: 1528.49 },
      [key("Lee Anne", "Hrabi")]: { hours: 86.61, gross: 1585.31 },
      [key("Robert", "Jacobson")]: { hours: 108.82, gross: 3395.18 },
      [key("Bonnie", "Malone")]: { hours: 66.55, gross: 1218.13 },
      [key("Amal", "Ragh")]: { hours: 89.43, gross: 1953.15 },
      [key("Bryah", "Risdon")]: { hours: 23.77, gross: 435.09 },
      [key("Jayvi Tri", "Tsan")]: { hours: 40.86, gross: 849.89 },
  } },
  { payDate: "2026-03-06", start: "2026-02-18", end: "2026-03-03", lines: {
      [key("James", "Allard")]: { hours: 83.57, gross: 1738.26 },
      [key("Bhima", "Bhattarai")]: { hours: 67.75, gross: 1240.10 },
      [key("Heather", "Capstick")]: { hours: 73.82, gross: 1381.91 },
      [key("Eric", "Cressos")]: { hours: 37.63, gross: 704.43 },
      [key("Kimberly", "Daly")]: { hours: 66.34, gross: 1214.29 },
      [key("Karma", "Dozang")]: { hours: 7.64, gross: 158.91 },
      [key("Paige", "Ferlatte")]: { hours: 62.56, gross: 1145.10 },
      [key("Breanna", "Fox")]: { hours: 28.19, gross: 527.72 },
      [key("Lee Anne", "Hrabi")]: { hours: 61.82, gross: 1131.55 },
      [key("Robert", "Jacobson")]: { hours: 97.35, gross: 3037.32 },
      [key("Bonnie", "Malone")]: { hours: 53.76, gross: 984.02 },
      [key("Amal", "Ragh")]: { hours: 87.49, gross: 1910.78 },
      [key("Bryah", "Risdon")]: { hours: 47.85, gross: 875.85 },
      [key("Jayvi Tri", "Tsan")]: { hours: 52.89, gross: 1100.11 },
  } },
  { payDate: "2026-02-20", start: "2026-02-04", end: "2026-02-17", lines: {
      [key("James", "Allard")]: { hours: 88.77, gross: 1915.78 },
      [key("Bhima", "Bhattarai")]: { hours: 81.02, gross: 1542.29 },
      [key("Heather", "Capstick")]: { hours: 70.54, gross: 1320.54 },
      [key("Eric", "Cressos")]: { hours: 41.74, gross: 781.31 },
      [key("Kimberly", "Daly")]: { hours: 55.61, gross: 1017.87 },
      [key("Paige", "Ferlatte")]: { hours: 53.55, gross: 980.11 },
      [key("Breanna", "Fox")]: { hours: 78.55, gross: 1541.16 },
      [key("Lee Anne", "Hrabi")]: { hours: 68.9, gross: 1344.46 },
      [key("Robert", "Jacobson")]: { hours: 113.39, gross: 3631.84 },
      [key("Bonnie", "Malone")]: { hours: 61.54, gross: 1200.20 },
      [key("Amal", "Ragh")]: { hours: 92.13, gross: 2111.04 },
      [key("Bryah", "Risdon")]: { hours: 15.71, gross: 287.58 },
      [key("Jayvi Tri", "Tsan")]: { hours: 45.1, gross: 938.09 },
  } },
  { payDate: "2026-02-06", start: "2026-01-21", end: "2026-02-03", lines: {
      [key("James", "Allard")]: { hours: 64.16, gross: 1334.53 },
      [key("Bhima", "Bhattarai")]: { hours: 66.95, gross: 1225.45 },
      [key("Heather", "Capstick")]: { hours: 62.38, gross: 1167.75 },
      [key("Eric", "Cressos")]: { hours: 50.08, gross: 937.50 },
      [key("Kimberly", "Daly")]: { hours: 41.49, gross: 759.43 },
      [key("Paige", "Ferlatte")]: { hours: 28.56, gross: 522.76 },
      [key("Breanna", "Fox")]: { hours: 62.38, gross: 1167.75 },
      [key("Lee Anne", "Hrabi")]: { hours: 65.19, gross: 1193.24 },
      [key("Robert", "Jacobson")]: { hours: 87.22, gross: 2721.26 },
      [key("Bonnie", "Malone")]: { hours: 63.77, gross: 1167.25 },
      [key("Amal", "Ragh")]: { hours: 85.51, gross: 1867.54 },
      [key("Bryah", "Risdon")]: { hours: 37.06, gross: 678.35 },
      [key("Jayvi Tri", "Tsan")]: { hours: 45.72, gross: 950.98 },
  } },
  { payDate: "2026-01-23", start: "2026-01-07", end: "2026-01-20", lines: {
      [key("James", "Allard")]: { hours: 69.78, gross: 1451.42 },
      [key("Bhima", "Bhattarai")]: { hours: 67.84, gross: 1241.74 },
      [key("Heather", "Capstick")]: { hours: 59.58, gross: 1115.34 },
      [key("Eric", "Cressos")]: { hours: 51.78, gross: 969.32 },
      [key("Kimberly", "Daly")]: { hours: 51.76, gross: 947.42 },
      [key("Paige", "Ferlatte")]: { hours: 32.71, gross: 598.72 },
      [key("Breanna", "Fox")]: { hours: 62.46, gross: 1169.25 },
      [key("Lee Anne", "Hrabi")]: { hours: 60.52, gross: 1107.76 },
      [key("Robert", "Jacobson")]: { hours: 77.15, gross: 2407.08 },
      [key("Bonnie", "Malone")]: { hours: 60.66, gross: 1110.32 },
      [key("Amal", "Ragh")]: { hours: 82.96, gross: 1811.85 },
      [key("Bryah", "Risdon")]: { hours: 33.54, gross: 613.92 },
      [key("Jayvi Tri", "Tsan")]: { hours: 47.56, gross: 989.25 },
  } },
  { payDate: "2026-01-08", start: "2025-12-24", end: "2026-01-06", lines: {
      [key("James", "Allard")]: { hours: 100.55, gross: 2195.27 },
      [key("Bhima", "Bhattarai")]: { hours: 60.46, gross: 1171.04 },
      [key("Heather", "Capstick")]: { hours: 42.22, gross: 866.78 },
      [key("Eric", "Cressos")]: { hours: 48.75, gross: 912.58 },
      [key("Kimberly", "Daly")]: { hours: 38.71, gross: 708.63 },
      [key("Paige", "Ferlatte")]: { hours: 48.47, gross: 887.24 },
      [key("Charlotte", "Fowler")]: { hours: 26.91, gross: 572.51 },
      [key("Breanna", "Fox")]: { hours: 50, gross: 935.96 },
      [key("Lee Anne", "Hrabi")]: { hours: 84.28, gross: 1608.29 },
      [key("Robert", "Jacobson")]: { hours: 24.22, gross: 755.72 },
      [key("Bonnie", "Malone")]: { hours: 51.73, gross: 946.83 },
      [key("Amal", "Ragh")]: { hours: 113.85, gross: 2600.22 },
      [key("Bryah", "Risdon")]: { hours: 20.37, gross: 427.94 },
      [key("Jayvi Tri", "Tsan")]: { hours: 49.73, gross: 1034.29 },
  } },];

export async function backfillAuldPayroll(): Promise<{ client: number | null; runsAdded: number; skipped: string } | void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const client = cs.find((c) => /auld/i.test(c.name || ""));
    if (!client) return { client: null, runsAdded: 0, skipped: "Auld Spot client not found" };
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
        if (ex.hourlyRate == null && r.rate != null) patch.hourlyRate = r.rate;
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
    if (runsAdded) console.log(`[auld-backfill] added ${runsAdded} run(s)`);
    return { client: clientId, runsAdded, skipped: "" };
  } catch (err) {
    console.error("[auld-backfill] failed:", err instanceof Error ? err.message : err);
  }
}
