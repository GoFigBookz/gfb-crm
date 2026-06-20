import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { payRuns, payRunLines, employees, clients } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { estimateFromGross, estimateFromNet, salaryPerPeriod, round2 } from "./payroll-core";

/**
 * Per-client special handling, keyed by a case-insensitive name match. Lets the
 * payroll page show the right surface: West York = autopay-in-QBO + paystubs
 * auto-emailed by an existing Apps Script (we surface, not rebuild); Selective =
 * flat-rate monthly estimator. Everyone else = manual entry.
 */
const WEST_YORK_META = {
  kind: "qbo_autopay" as const,
  note: "Payroll runs on AUTOPAY inside QuickBooks. Paystubs are auto-emailed weekly by a Google Apps Script (sendWeeklyPaystubs) — Wednesdays ~1:00 PM.",
  recipients: ["baronedina16@gmail.com", "joeyorkwest@gmail.com"],
  cadence: "Weekly · Wednesday 1:00 PM",
  sourceFolderId: "12Lh_HwFI2e25Dv8SqjaHAkmqX4czIpwj",
  archiveFolderId: "10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj",
  driveFolderUrl: "https://drive.google.com/drive/folders/10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj",
};

function payrollKind(name: string | null | undefined): { kind: string; note?: string; meta?: any } {
  const n = (name || "").toLowerCase();
  if (n.includes("west york")) return { kind: "qbo_autopay", note: WEST_YORK_META.note, meta: WEST_YORK_META };
  if (n.includes("selective")) return { kind: "estimator", note: "Monthly flat-rate estimator: enter gross (or net) and Figgy fills CPP/EI/tax + the CRA remittance." };
  if (n.includes("originality")) return { kind: "clockify", note: "Hourly staff hours come from Clockify; salaried staff are entered manually." };
  if (n.includes("clark")) return { kind: "jobber", note: "Employee hours come from Jobber timesheets (import coming in Phase 3)." };
  return { kind: "manual" };
}

async function recomputeRunTotals(runId: number) {
  const db = getDb();
  const lines = await db.select().from(payRunLines).where(eq(payRunLines.payRunId, runId));
  let g = 0, n = 0, eded = 0, empc = 0;
  for (const l of lines as any[]) {
    g += l.grossPay || 0;
    n += l.netPay || 0;
    eded += (l.cppEmployee || 0) + (l.cpp2Employee || 0) + (l.eiEmployee || 0) + (l.federalTax || 0) + (l.provincialTax || 0) + (l.otherDeductions || 0);
    empc += (l.cppEmployer || 0) + (l.cpp2Employer || 0) + (l.eiEmployer || 0);
  }
  await db.update(payRuns).set({
    totalGross: round2(g), totalNet: round2(n),
    totalEmployeeDeductions: round2(eded), totalEmployerCost: round2(empc),
    updatedAt: new Date(),
  }).where(eq(payRuns.id, runId));
}

export const payrollRouter = createRouter({
  // Clients that run payroll: hasPayroll flag OR at least one employee on file.
  clients: staffQuery.query(async () => {
    const db = getDb();
    const cs = await db.select().from(clients);
    const emps = await db.select().from(employees);
    const empCount = new Map<number, number>();
    for (const e of emps as any[]) empCount.set(e.clientId, (empCount.get(e.clientId) || 0) + (e.isActive === false ? 0 : 1));
    return (cs as any[])
      .filter((c) => c.hasPayroll || empCount.get(c.id))
      .map((c) => ({
        id: c.id, name: c.name,
        payrollFrequency: c.payrollFrequency ?? null,
        payrollRemitterFreq: c.payrollRemitterFreq ?? null,
        employeeCount: empCount.get(c.id) || 0,
        ...payrollKind(c.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }),

  // Pay runs for a client, newest period first.
  listRuns: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(payRuns).where(eq(payRuns.clientId, input.clientId)).orderBy(desc(payRuns.payPeriodStart));
    }),

  // One run with its lines + employee names (the clean sheet).
  getRun: staffQuery
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const runRows = await db.select().from(payRuns).where(eq(payRuns.id, input.runId)).limit(1);
      const run = runRows[0];
      if (!run) return null;
      const lines = await db.select().from(payRunLines).where(eq(payRunLines.payRunId, input.runId));
      const emps = await db.select().from(employees).where(eq(employees.clientId, run.clientId));
      const empById = new Map((emps as any[]).map((e) => [e.id, e]));
      const withNames = (lines as any[]).map((l) => {
        const e = empById.get(l.employeeId);
        return { ...l, employeeName: e ? `${e.firstName} ${e.lastName}` : `Employee #${l.employeeId}`, payType: e?.payType ?? null };
      }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      return { run, lines: withNames };
    }),

  // Create a run and seed one line per active employee (salary pre-filled).
  createRun: staffQuery
    .input(z.object({
      clientId: z.number(),
      payPeriodStart: z.date(),
      payPeriodEnd: z.date(),
      payDate: z.date().optional(),
      frequency: z.enum(["weekly", "biweekly", "semi_monthly", "monthly"]).optional(),
      hoursSource: z.enum(["manual", "clockify", "jobber", "touchbistro", "qbo_autopay"]).optional(),
      runType: z.enum(["regular", "off_cycle", "bonus"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [run] = await db.insert(payRuns).values({
        clientId: input.clientId,
        payPeriodStart: input.payPeriodStart,
        payPeriodEnd: input.payPeriodEnd,
        payDate: input.payDate ?? input.payPeriodEnd,
        frequency: input.frequency ?? "monthly",
        hoursSource: input.hoursSource ?? "manual",
        runType: input.runType ?? "regular",
        status: "draft",
      }).returning();
      // Seed lines from active employees.
      const emps = await db.select().from(employees).where(and(eq(employees.clientId, input.clientId), eq(employees.isActive, true)));
      for (const e of emps as any[]) {
        const gross = e.payType === "salary" ? salaryPerPeriod(e.annualSalary, input.frequency) : 0;
        await db.insert(payRunLines).values({ payRunId: run.id, employeeId: e.id, grossPay: gross });
      }
      await recomputeRunTotals(run.id);
      return run;
    }),

  // Edit a single pay line. Recomputes the run totals after.
  updateLine: staffQuery
    .input(z.object({
      id: z.number(),
      regularHours: z.number().optional(), overtimeHours: z.number().optional(),
      vacationHours: z.number().optional(), statHolidayHours: z.number().optional(), sickHours: z.number().optional(),
      grossPay: z.number().optional(), vacationPayPaid: z.number().optional(),
      cppEmployee: z.number().optional(), cpp2Employee: z.number().optional(), eiEmployee: z.number().optional(),
      federalTax: z.number().optional(), provincialTax: z.number().optional(), otherDeductions: z.number().optional(),
      cppEmployer: z.number().optional(), cpp2Employer: z.number().optional(), eiEmployer: z.number().optional(),
      netPay: z.number().optional(), notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...updates } = input;
      await db.update(payRunLines).set({ ...updates, updatedAt: new Date() }).where(eq(payRunLines.id, id));
      const row = (await db.select().from(payRunLines).where(eq(payRunLines.id, id)).limit(1))[0];
      if (row) await recomputeRunTotals((row as any).payRunId);
      return { success: true };
    }),

  // Flat-rate estimate for one line from its gross (or a target net). Fills
  // CPP/EI/tax/employer + net, then recomputes the run.
  estimateLine: staffQuery
    .input(z.object({ id: z.number(), fromNet: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const row = (await db.select().from(payRunLines).where(eq(payRunLines.id, input.id)).limit(1))[0] as any;
      if (!row) throw new Error("Line not found");
      const est = input.fromNet != null ? estimateFromNet(input.fromNet) : estimateFromGross(row.grossPay || 0);
      await db.update(payRunLines).set({
        grossPay: est.grossPay, cppEmployee: est.cppEmployee, eiEmployee: est.eiEmployee,
        federalTax: est.federalTax, cppEmployer: est.cppEmployer, eiEmployer: est.eiEmployer,
        netPay: est.netPay, updatedAt: new Date(),
      }).where(eq(payRunLines.id, input.id));
      await recomputeRunTotals(row.payRunId);
      return { success: true, estimate: est };
    }),

  setRunStatus: staffQuery
    .input(z.object({ runId: z.number(), status: z.enum(["draft", "review", "approved", "paid", "posted"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(payRuns).set({ status: input.status, updatedAt: new Date() }).where(eq(payRuns.id, input.runId));
      return { success: true };
    }),

  deleteRun: staffQuery
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(payRunLines).where(eq(payRunLines.payRunId, input.runId));
      await db.delete(payRuns).where(eq(payRuns.id, input.runId));
      return { success: true };
    }),
});
