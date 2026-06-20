import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { payRuns, payRunLines, employees, clients } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { estimateFromGross, estimateFromNet, salaryPerPeriod, round2, periodsPerYear, normalizeFrequency } from "./payroll-core";
import { reconcileWithholding, annualIncomeTax, TAX_2026 } from "./payroll-tax-core";
import { computeCraLine, CRA_2026 } from "./payroll-cra-core";

/** YTD pensionable gross for an employee BEFORE the given run, this calendar
 *  year = opening carryforward (employee.ytdGrossOpening) + gross from earlier
 *  runs. Makes CPP/CPP2/EI max out correctly across the year. */
async function ytdGrossBeforeRun(db: any, employeeId: number, run: any): Promise<number> {
  const emp = (await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1))[0] as any;
  const opening = emp?.ytdGrossOpening || 0;
  const year = new Date(run.payPeriodEnd).getFullYear();
  const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, run.clientId))) as any[];
  const priorRunIds = allRuns
    .filter((r) => new Date(r.payPeriodEnd).getFullYear() === year && new Date(r.payPeriodEnd) < new Date(run.payPeriodStart))
    .map((r) => r.id);
  if (priorRunIds.length === 0) return opening;
  const allLines = (await db.select().from(payRunLines)) as any[];
  const prior = allLines.filter((l) => l.employeeId === employeeId && priorRunIds.includes(l.payRunId));
  return round2(opening + prior.reduce((s, l) => s + (l.grossPay || 0), 0));
}

/** Pay periods already elapsed in the year before this run's period start —
 *  drives the prorated CPP basic exemption in the CRA calc. */
function periodsElapsedBeforeRun(run: any): number {
  const start = new Date(run.payPeriodStart);
  const m = start.getMonth(); // 0-11
  const d = start.getDate();
  switch (normalizeFrequency(run?.frequency)) {
    case "weekly": return Math.max(0, Math.floor((start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / (7 * 86400000)));
    case "biweekly": return Math.max(0, Math.floor((start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / (14 * 86400000)));
    case "semi_monthly": return m * 2 + (d > 15 ? 1 : 0);
    default: return m; // monthly
  }
}

/** Solve the gross that yields a target net under the CRA engine (Selective's
 *  "enter net" workflow), via binary search. */
function craGrossForNet(targetNet: number, P: number, ytd: number, periodsElapsed: number): number {
  let lo = 0, hi = targetNet * 2 + 2000;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const net = computeCraLine({ grossPeriod: mid, periodsPerYear: P, ytdPensionableBefore: ytd, periodsElapsedBefore: periodsElapsed }).netPay;
    if (net < targetNet) lo = mid; else hi = mid;
  }
  return round2((lo + hi) / 2);
}

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

// The practice's known payroll clients (name substrings). A client is treated
// as payroll if it matches one of these OR has hasPayroll set — so the payroll
// page lists ONLY real payroll clients, not anyone who happens to have an
// employee record.
const KNOWN_PAYROLL = ["west york", "selective", "originality", "clark", "2303851", "fractal", "old spot", "sher", "punjab"];

function isPayrollClient(c: any): boolean {
  if (c.hasPayroll) return true;
  const n = (c.name || "").toLowerCase();
  return KNOWN_PAYROLL.some((k) => n.includes(k));
}

function payrollKind(name: string | null | undefined): { kind: string; note?: string; meta?: any } {
  const n = (name || "").toLowerCase();
  if (n.includes("west york")) return { kind: "qbo_autopay", note: WEST_YORK_META.note, meta: WEST_YORK_META };
  if (n.includes("selective")) return { kind: "estimator", note: "Monthly flat-rate estimator: enter gross (or net) and Figgy fills CPP/EI/tax + the CRA remittance." };
  if (n.includes("originality")) return { kind: "clockify", note: "Hourly staff hours come from Clockify; salaried staff are entered manually." };
  if (n.includes("clark")) return { kind: "jobber", note: "Employee hours come from Jobber timesheets (import coming in Phase 3). Enter or adjust manually here." };
  if (n.includes("old spot") || n.includes("sher") || n.includes("punjab")) return { kind: "touchbistro", note: "Hours come from TouchBistro — enter or adjust them manually here (no direct API)." };
  if (n.includes("fractal")) return { kind: "qbo_autopay", note: "Auto-paid in QuickBooks — one salaried employee (Andrew). Surfaced for visibility; no manual run needed." };
  return { kind: "manual" };
}

async function recomputeRunTotals(runId: number) {
  const db = getDb();
  const lines = await db.select().from(payRunLines).where(eq(payRunLines.payRunId, runId));
  let g = 0, n = 0, eded = 0, empc = 0;
  for (const l of lines as any[]) {
    g += l.grossPay || 0;
    // Take-home = net pay + non-taxable add-ons (phone allowance, reimbursement).
    n += (l.netPay || 0) + (l.phoneAllowance || 0) + (l.reimbursement || 0);
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
      .filter((c) => isPayrollClient(c) && c.status !== "inactive" && c.status !== "archived")
      .map((c) => ({
        id: c.id, name: c.name,
        payrollFrequency: c.payrollFrequency ?? null,
        payrollRemitterFreq: c.payrollRemitterFreq ?? null,
        employeeCount: empCount.get(c.id) || 0,
        // Client-level payroll features (drive what the pay run shows).
        payrollBonuses: !!c.payrollBonuses,
        payrollDividends: !!c.payrollDividends,
        payrollPhoneAllowance: !!c.payrollPhoneAllowance,
        payrollReimbursements: !!c.payrollReimbursements,
        payrollRevenueShare: !!c.payrollRevenueShare,
        payrollCraComparison: !!c.payrollCraComparison,
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
        return {
          ...l,
          employeeName: e ? `${e.firstName} ${e.lastName}` : `Employee #${l.employeeId}`,
          payType: e?.payType ?? null,
          hourlyRate: e?.hourlyRate ?? null,
          annualSalary: e?.annualSalary ?? null,
        };
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

  // Add a line to a run — for an EXISTING employee, or create a new employee
  // inline (so a client with no employees on file can still build a timesheet).
  addLine: staffQuery
    .input(z.object({
      payRunId: z.number(),
      employeeId: z.number().optional(),
      newEmployee: z.object({
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        payType: z.enum(["salary", "hourly", "commission", "contract"]).optional(),
        hourlyRate: z.number().optional(),
        annualSalary: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const run = (await db.select().from(payRuns).where(eq(payRuns.id, input.payRunId)).limit(1))[0] as any;
      if (!run) throw new Error("Pay run not found");

      let employeeId = input.employeeId;
      if (!employeeId && input.newEmployee) {
        const [emp] = await db.insert(employees).values({
          clientId: run.clientId,
          firstName: input.newEmployee.firstName,
          lastName: input.newEmployee.lastName || "",
          payType: input.newEmployee.payType || "hourly",
          hourlyRate: input.newEmployee.hourlyRate,
          annualSalary: input.newEmployee.annualSalary,
          isActive: true,
        }).returning();
        employeeId = emp.id;
      }
      if (!employeeId) throw new Error("Provide an employee or new employee details");

      const emp = (await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1))[0] as any;
      const gross = emp?.payType === "salary" ? salaryPerPeriod(emp.annualSalary, run.frequency) : 0;
      // Seed the recurring add-ons from the employee card so they're pre-filled.
      const [line] = await db.insert(payRunLines).values({
        payRunId: input.payRunId, employeeId, grossPay: gross,
        phoneAllowance: emp?.phoneAllowance ?? 0,
        reimbursement: emp?.reimbursementAmount ?? 0,
      }).returning();
      await recomputeRunTotals(input.payRunId);
      return line;
    }),

  // Remove a single line from a run.
  removeLine: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const row = (await db.select().from(payRunLines).where(eq(payRunLines.id, input.id)).limit(1))[0] as any;
      await db.delete(payRunLines).where(eq(payRunLines.id, input.id));
      if (row) await recomputeRunTotals(row.payRunId);
      return { success: true };
    }),

  // Edit a single pay line. Recomputes the run totals after.
  updateLine: staffQuery
    .input(z.object({
      id: z.number(),
      regularHours: z.number().optional(), overtimeHours: z.number().optional(),
      vacationHours: z.number().optional(), statHolidayHours: z.number().optional(), sickHours: z.number().optional(),
      grossPay: z.number().optional(), shareBonus: z.number().optional(), statHolidayPay: z.number().optional(), vacationPayPaid: z.number().optional(),
      phoneAllowance: z.number().optional(), reimbursement: z.number().optional(),
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

  // CRA-grade estimate for one line from its gross (or a target net): real
  // CPP/CPP2/EI + federal & Ontario tax via the T4127 method, YTD-aware so the
  // annual maximums + carryforward are respected. Fills every column, recomputes.
  estimateLine: staffQuery
    .input(z.object({ id: z.number(), fromNet: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const row = (await db.select().from(payRunLines).where(eq(payRunLines.id, input.id)).limit(1))[0] as any;
      if (!row) throw new Error("Line not found");
      const run = (await db.select().from(payRuns).where(eq(payRuns.id, row.payRunId)).limit(1))[0] as any;
      const P = periodsPerYear(normalizeFrequency(run?.frequency));
      const ytd = await ytdGrossBeforeRun(db, row.employeeId, run);
      const elapsed = periodsElapsedBeforeRun(run);
      const gross = input.fromNet != null ? craGrossForNet(input.fromNet, P, ytd, elapsed) : (row.grossPay || 0);
      const line = computeCraLine({ grossPeriod: gross, periodsPerYear: P, ytdPensionableBefore: ytd, periodsElapsedBefore: elapsed });
      await db.update(payRunLines).set({
        grossPay: line.grossPay, cppEmployee: line.cppEmployee, cpp2Employee: line.cpp2Employee,
        eiEmployee: line.eiEmployee, federalTax: line.federalTax, provincialTax: line.provincialTax,
        cppEmployer: line.cppEmployer, cpp2Employer: line.cpp2Employer, eiEmployer: line.eiEmployer,
        netPay: line.netPay, updatedAt: new Date(),
      }).where(eq(payRunLines.id, input.id));
      await recomputeRunTotals(row.payRunId);
      return { success: true, estimate: line };
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

  // Create (or return) a client hours-approval link for a run, and mark it sent.
  createApprovalLink: staffQuery
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const run = (await db.select().from(payRuns).where(eq(payRuns.id, input.runId)).limit(1))[0] as any;
      if (!run) throw new Error("Pay run not found");
      const token = run.approvalToken || `pa_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      await db.update(payRuns).set({
        approvalToken: token,
        approvalStatus: run.approvalStatus === "approved" ? "approved" : "sent",
        updatedAt: new Date(),
      }).where(eq(payRuns.id, input.runId));
      return { token };
    }),

  // AUTOMATIC withholding check (vs CRA), per employee, computed from the
  // client's actual pay runs this calendar year — mirrors the Originality sheet's
  // "Expected CRA Deduction (YTD)" vs "Actual Tax Deducted (YTD)" columns. No
  // manual entry: YTD gross + YTD tax are summed across runs and reconciled.
  withholdingCheck: staffQuery
    .input(z.object({ clientId: z.number(), year: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const year = input.year ?? new Date().getFullYear();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      const allRuns = await db.select().from(payRuns).where(eq(payRuns.clientId, input.clientId));
      const yrRuns = (allRuns as any[]).filter((r) => new Date(r.payPeriodEnd).getFullYear() === year);
      const runIds = new Set(yrRuns.map((r) => r.id));
      if (!yrRuns.length) return { year, periodsPerYear: 0, runsCount: 0, fraction: 0, rows: [] as any[] };

      const emps = await db.select().from(employees).where(eq(employees.clientId, input.clientId));
      const empById = new Map((emps as any[]).map((e) => [e.id, e]));
      const allLines = await db.select().from(payRunLines);
      const lines = (allLines as any[]).filter((l) => runIds.has(l.payRunId));

      const ppy = periodsPerYear(normalizeFrequency(client?.payrollFrequency));
      const runsCount = yrRuns.length;
      const fraction = Math.min(1, Math.max(0.0001, runsCount / ppy));

      const agg = new Map<number, { gross: number; tax: number }>();
      for (const l of lines) {
        const a = agg.get(l.employeeId) || { gross: 0, tax: 0 };
        a.gross += l.grossPay || 0;
        a.tax += (l.federalTax || 0) + (l.provincialTax || 0);
        agg.set(l.employeeId, a);
      }

      const rows = Array.from(agg.entries()).map(([empId, a]) => {
        const e = empById.get(empId);
        const rec = reconcileWithholding(a.gross, a.tax, fraction);
        return {
          employeeId: empId,
          name: e ? `${e.firstName} ${e.lastName}` : `Employee #${empId}`,
          ytdGross: rec.ytdGross, ytdTax: rec.ytdTaxDeducted,
          annualizedIncome: rec.annualizedIncome, expectedYtdTax: rec.expectedYtdTax,
          variance: rec.variance, underWithheld: rec.underWithheld,
        };
      }).filter((r) => r.ytdGross > 0).sort((a, b) => a.name.localeCompare(b.name));

      return { year, periodsPerYear: ppy, runsCount, fraction, rows };
    }),

  // Which tax tables the reconciliation is using (for the UI banner).
  taxTables: staffQuery.query(() => ({
    year: TAX_2026.year,
    verified: TAX_2026.verified,
    federalBpa: TAX_2026.federalBpaMax,
    ontarioBpa: TAX_2026.ontarioBpa,
    sampleAnnualTaxOn100k: annualIncomeTax(100000),
  })),

  // Withholding reconciliation for revenue-share / any employee: compare what
  // QBO actually deducted YTD vs CRA-expected tax on the accumulated income.
  reconcileTax: staffQuery
    .input(z.object({
      ytdGross: z.number().min(0),
      ytdTaxDeducted: z.number().min(0),
      // Provide EITHER fractionOfYear OR (periodsElapsed + periodsPerYear).
      fractionOfYear: z.number().min(0).max(1).optional(),
      periodsElapsed: z.number().min(0).optional(),
      periodsPerYear: z.number().min(1).optional(),
    }))
    .query(({ input }) => {
      const frac = input.fractionOfYear
        ?? (input.periodsElapsed && input.periodsPerYear ? input.periodsElapsed / input.periodsPerYear : 0.5);
      return reconcileWithholding(input.ytdGross, input.ytdTaxDeducted, frac);
    }),

  // T4 slips — aggregate each employee's pay-run lines for the calendar year
  // into the CRA T4 boxes. SIN is NOT included (reveal per employee with the
  // code gate when printing).
  t4Slips: staffQuery
    .input(z.object({ clientId: z.number(), year: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const year = input.year ?? new Date().getFullYear();
      const client = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0] as any;
      const allRuns = (await db.select().from(payRuns).where(eq(payRuns.clientId, input.clientId))) as any[];
      const runIds = new Set(allRuns.filter((r) => new Date(r.payPeriodEnd).getFullYear() === year).map((r) => r.id));
      const emps = (await db.select().from(employees).where(eq(employees.clientId, input.clientId))) as any[];
      const empById = new Map(emps.map((e) => [e.id, e]));
      const allLines = (await db.select().from(payRunLines)) as any[];
      const lines = allLines.filter((l) => runIds.has(l.payRunId));

      const agg = new Map<number, any>();
      for (const l of lines) {
        const a = agg.get(l.employeeId) || { gross: 0, cpp: 0, cpp2: 0, ei: 0, tax: 0 };
        a.gross += l.grossPay || 0;
        a.cpp += l.cppEmployee || 0;
        a.cpp2 += l.cpp2Employee || 0;
        a.ei += l.eiEmployee || 0;
        a.tax += (l.federalTax || 0) + (l.provincialTax || 0);
        agg.set(l.employeeId, a);
      }
      const slips = Array.from(agg.entries()).map(([empId, a]) => {
        const e = empById.get(empId);
        const box14 = round2(a.gross);
        return {
          employeeId: empId,
          name: e ? `${e.firstName} ${e.lastName}` : `Employee #${empId}`,
          address: e?.address || "",
          hasSin: !!e?.sin,
          box14, // employment income
          box16: round2(a.cpp),                                   // CPP base
          box16A: round2(a.cpp2),                                 // CPP2
          box18: round2(a.ei),                                    // EI premiums
          box22: round2(a.tax),                                   // income tax deducted
          box24: round2(Math.min(box14, CRA_2026.ei.mie)),        // EI insurable earnings
          box26: round2(Math.min(box14, CRA_2026.cpp.yampe)),     // CPP pensionable earnings
        };
      }).filter((s) => s.box14 > 0).sort((a, b) => a.name.localeCompare(b.name));

      return {
        year,
        payer: client ? { name: client.company || client.name, address: client.address || "", bn: client.taxId || "", rp: client.payrollRpNumber || "" } : null,
        slips,
      };
    }),
});
