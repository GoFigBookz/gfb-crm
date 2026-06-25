/**
 * DEMO DATA — an invented firm seeded into demo.db so "Try Demo Mode" shows off
 * every page with obviously-fake names and never any real client data. Runs inside
 * the demo DB context (see prepare-demo-db.ts). Idempotent: no-ops once seeded.
 */
import { getDb } from "./queries/connection";
import { eq } from "drizzle-orm";
import {
  users, clients, employees, payRuns, payRunLines, tasks,
  groupEntities, groupOwnership, groupProfit, groupFamilyBenefit,
} from "../db/schema";

const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000);

export async function seedDemoData(): Promise<void> {
  const db = getDb();

  // Fully seeded? The Apex group book is the last thing written, so use it as the
  // completion marker. (This is demo.db, never the real books.)
  const done = (await db.select().from(groupEntities).where(eq(groupEntities.groupName, "Apex Group"))) as any[];
  if (done.length) return;

  // Recover from any partial seed by clearing the demo-seeded tables (demo.db only).
  for (const tbl of [payRunLines, payRuns, employees, tasks, groupOwnership, groupProfit, groupFamilyBenefit, groupEntities, clients, users] as any[]) {
    try { await db.delete(tbl); } catch { /* table may not exist yet */ }
  }

  // Demo admin (context.ts logs demo visitors in as the first user here).
  let userId = 1;
  const u = (await db.insert(users).values({
    email: "demo@gofigbookz.app", name: "Demo Admin", role: "admin", authProvider: "local", isActive: true,
  } as any).returning()) as any[];
  userId = u[0]?.id ?? 1;

  // Fake clients — varied types so Practice Health / Payroll / Groups all populate.
  const C = (over: any) => ({
    userId, status: "active", workflowStatus: "active", clientType: "monthly",
    country: "CA", province: "ON", createdAt: new Date(), ...over,
  });
  const rows = await db.insert(clients).values([
    C({ name: "Go Fig Bookz (Demo)", email: "hello@demo.app", isFirm: true, monthlyFee: 0, hasHST: true }),
    C({ name: "Acme Pools Inc.", email: "ap@demo.app", monthlyFee: 650, hasHST: true, hasPayroll: true, yearEndMonth: "Dec", groupName: "Apex Group" }),
    C({ name: "Globex Bakery Ltd.", email: "gb@demo.app", monthlyFee: 480, hasHST: true, yearEndMonth: "Sep", groupName: "Apex Group" }),
    C({ name: "Initech Software Inc.", email: "in@demo.app", monthlyFee: 900, hasHST: true, hasPayroll: true, yearEndMonth: "Dec" }),
    C({ name: "Hooli Media Inc.", email: "hl@demo.app", clientType: "quarterly", monthlyFee: 350, hasHST: true, yearEndMonth: "Jun" }),
    C({ name: "Wayne Holdings Inc.", email: "wh@demo.app", clientType: "annual", monthlyFee: 200, yearEndMonth: "Dec", groupName: "Apex Group" }),
    C({ name: "Stark Industries Canada Inc.", email: "si@demo.app", monthlyFee: 1200, hasHST: true, hasPayroll: true, yearEndMonth: "Mar", groupName: "Apex Group" }),
  ] as any).returning() as any[];
  const byName = (n: string) => rows.find((r) => r.name === n)?.id;

  // Payroll for the three payroll clients (employees + 3 monthly runs each).
  const ROSTERS: Record<string, Array<[string, string, number]>> = {
    "Acme Pools Inc.": [["Dana", "Whitfield", 5200], ["Marco", "Reyes", 4100], ["Priya", "Singh", 3800]],
    "Initech Software Inc.": [["Sam", "Becker", 7800], ["Lena", "Ortiz", 6900]],
    "Stark Industries Canada Inc.": [["Tony", "Stratton", 9000], ["Pepper", "Posey", 7200], ["Happy", "Hogue", 5400], ["May", "Park", 4600]],
  };
  for (const [clientName, roster] of Object.entries(ROSTERS)) {
    const clientId = byName(clientName);
    if (!clientId) continue;
    const emps = await db.insert(employees).values(
      roster.map(([first, last]) => ({ clientId, firstName: first, lastName: last, isActive: true } as any)),
    ).returning() as any[];
    // Three recent monthly pay runs.
    for (let m = 2; m >= 0; m--) {
      const end = new Date(); end.setMonth(end.getMonth() - m, 28); end.setHours(0, 0, 0, 0);
      const start = new Date(end); start.setDate(1);
      const gross = roster.reduce((s, r) => s + r[2], 0);
      const run = (await db.insert(payRuns).values({
        clientId, payPeriodStart: start, payPeriodEnd: end, payDate: end,
        runType: "regular", status: "paid", hoursSource: "manual", totalGross: gross,
      } as any).returning()) as any[];
      const runId = run[0]?.id;
      await db.insert(payRunLines).values(
        roster.map(([, , amt], i) => ({ payRunId: runId, employeeId: emps[i]?.id, grossPay: amt, regularHours: 0 } as any)),
      );
    }
  }

  // A few tasks (Calendar / Tasks / month-end board).
  const t = (title: string, clientName: string | null, due: number, status = "pending") => ({
    userId, title, clientId: clientName ? byName(clientName) : null,
    dueDate: daysFromNow(due), status, priority: "medium", completed: false, createdAt: new Date(),
  });
  await db.insert(tasks).values([
    t("File HST return", "Acme Pools Inc.", 4),
    t("Run monthly payroll", "Stark Industries Canada Inc.", 1),
    t("Reconcile bank — May", "Initech Software Inc.", -2, "overdue"),
    t("Year-end working papers", "Wayne Holdings Inc.", 21),
    t("Post sales receipts", "Hooli Media Inc.", 7),
    t("Review vendor coding", "Globex Bakery Ltd.", 3),
  ] as any);

  // Control Book for the "Apex Group" (fake cap table / dividends / family).
  const G = "Apex Group";
  await db.insert(groupEntities).values([
    { groupName: G, companyName: "Stark Industries Canada Inc.", clientId: byName("Stark Industries Canada Inc."), incorporationNumber: "1000111222", businessNumber: "111222333", yearEnd: "Mar 31", address: "1 Stark Tower, Toronto ON", statusNote: "Operating", sortOrder: 1 },
    { groupName: G, companyName: "Acme Pools Inc.", clientId: byName("Acme Pools Inc."), incorporationNumber: "1000333444", businessNumber: "333444555", yearEnd: "Dec 31", address: "12 Poolside Rd, Barrie ON", statusNote: "Operating", sortOrder: 2 },
    { groupName: G, companyName: "Wayne Holdings Inc.", clientId: byName("Wayne Holdings Inc."), incorporationNumber: "1000555666", businessNumber: "555666777", yearEnd: "Dec 31", address: "1007 Mountain Dr, Gotham ON", statusNote: "Hold Co", sortOrder: 3 },
    { groupName: G, companyName: "Globex Bakery Ltd.", clientId: byName("Globex Bakery Ltd."), incorporationNumber: "1000777888", businessNumber: "777888999", yearEnd: "Sep 30", address: "5 Flour St, London ON", statusNote: "Operating", sortOrder: 4 },
  ] as any);
  await db.insert(groupOwnership).values([
    { groupName: G, companyName: "Wayne Holdings Inc.", holderName: "Sample Owner", holderType: "individual", ownershipPct: 100, shareClass: "Common" },
    { groupName: G, companyName: "Stark Industries Canada Inc.", holderName: "Sample Owner", holderType: "individual", ownershipPct: 70, shareClass: "Class A Voting" },
    { groupName: G, companyName: "Stark Industries Canada Inc.", holderName: "Jordan Lee", holderType: "individual", ownershipPct: 30, shareClass: "Class B" },
    { groupName: G, companyName: "Acme Pools Inc.", holderName: "Sample Owner", holderType: "individual", ownershipPct: 60 },
    { groupName: G, companyName: "Acme Pools Inc.", holderName: "Riley Quinn", holderType: "individual", ownershipPct: 40 },
    { groupName: G, companyName: "Globex Bakery Ltd.", holderName: "Wayne Holdings Inc.", holderType: "company", ownershipPct: 100 },
  ] as any);
  await db.insert(groupProfit).values([
    { groupName: G, companyName: "Stark Industries Canada Inc.", fiscalYear: "2025", ownershipPct: 100, ytdProfit: 412000, taxLiability: 92700 },
    { groupName: G, companyName: "Acme Pools Inc.", fiscalYear: "2025", ownershipPct: 100, ytdProfit: 86500, taxLiability: 19460 },
    { groupName: G, companyName: "Globex Bakery Ltd.", fiscalYear: "2025", ownershipPct: 100, ytdProfit: -14200, taxLiability: -3195 },
    { groupName: G, companyName: "Wayne Holdings Inc.", fiscalYear: "2025", ownershipPct: 100, ytdProfit: 5300, taxLiability: 1192 },
    { groupName: G, companyName: "Stark Industries Canada Inc.", fiscalYear: "2024", ownershipPct: 100, ytdProfit: 351000, taxLiability: 78975 },
    { groupName: G, companyName: "Acme Pools Inc.", fiscalYear: "2024", ownershipPct: 100, ytdProfit: 72000, taxLiability: 16200 },
  ] as any);
  await db.insert(groupFamilyBenefit).values([
    { groupName: G, personName: "Sample Owner", baseSalary: 9000, allocation: "Wayne Holdings Inc. (100%)" },
    { groupName: G, personName: "Alex Owner", baseSalary: 6000, allocation: "Stark Industries Canada Inc. (100%)" },
  ] as any);

  console.log("[demo-db] seeded demo firm: 7 clients, payroll, tasks, Apex Group control book");
}
