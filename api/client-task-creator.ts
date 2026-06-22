/**
 * @deprecated DO NOT USE. Superseded by the unified rule engine in
 * task-generator.ts (`ensureComplianceForClient` / `ensureComplianceRulesAndTasks`).
 * This older path inserted differently-titled tasks ("HST Filing — X") directly,
 * creating duplicate-title risk against the rule engine. All callers have been
 * migrated. Kept only so historical references resolve; safe to delete once
 * confirmed no external caller depends on it.
 */
import { getDb } from "./queries/connection";
import { tasks, recurringTasks } from "../db/schema";
import { sql } from "drizzle-orm";
import { syncInsert } from "./sync-hooks";

function nextHSTDueDate(period: string, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  
  if (period === "monthly") {
    // Monthly HST due by end of following month
    const due = new Date(year, month + 1, 1);
    return due;
  }
  if (period === "quarterly") {
    // Q1=Apr, Q2=Jul, Q3=Oct, Q4=Jan (next year)
    const q = Math.floor(month / 3);
    const dueMonths = [3, 6, 9, 0]; // Apr(3), Jul(6), Oct(9), Jan(0)
    const dueYear = q === 3 ? year + 1 : year;
    return new Date(dueYear, dueMonths[q], 1);
  }
  if (period === "annual") {
    return new Date(year, 0, 1); // Jan 1
  }
  return new Date(year, month + 1, 1);
}

function nextPayrollDueDate(frequency: string, now = new Date()) {
  // Payroll remittance due by 15th of following month (simplified)
  const year = now.getFullYear();
  const month = now.getMonth();
  return new Date(year, month + 1, 15);
}

function nextWSIBDueDate(quarter: string, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const q = Math.floor(month / 3);
  
  if (quarter === "Q1") return new Date(year, 3, 1);  // Apr 1
  if (quarter === "Q2") return new Date(year, 6, 1);  // Jul 1
  if (quarter === "Q3") return new Date(year, 9, 1);  // Oct 1
  if (quarter === "Q4") return new Date(year + 1, 0, 1); // Jan 1
  if (quarter === "all" || !quarter) {
    const dueMonths = [3, 6, 9, 0];
    const dueYear = q === 3 ? year + 1 : year;
    return new Date(dueYear, dueMonths[q], 1);
  }
  return new Date(year, month + 1, 1);
}

export async function createRecurringTasksForClient(
  clientId: number,
  userId: number,
  flags: {
    hasHST?: boolean;
    hstPeriod?: string;
    hasWSIB?: boolean;
    wsibQuarter?: string;
    hasPayroll?: boolean;
    payrollFrequency?: string;
    payrollExternal?: boolean;   // client self-manages / autopay → don't create payroll tasks
    paysDividends?: boolean;
  },
  clientName: string,
  assignedTo?: string | null
) {
  const db = getDb();
  const created: number[] = [];
  const now = new Date();

  // --- HST Tasks ---
  if (flags.hasHST && flags.hstPeriod) {
    const dueDate = nextHSTDueDate(flags.hstPeriod, now);
    const title = `HST Filing — ${clientName}`;
    const existing = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        sql`${tasks.clientId} = ${clientId} AND ${tasks.title} LIKE ${`HST Filing%`} AND ${tasks.dueDate} > ${Math.floor(now.getTime() / 1000)}`
      )
      .limit(1);

    if (existing.length === 0) {
      const [task] = await db.insert(tasks).values({
        userId,
        clientId,
        title,
        description: `Prepare and file ${flags.hstPeriod} HST return.`,
        dueDate,
        priority: "high",
        status: "pending",
        category: "Tax Filing",
        assignedTo: assignedTo || undefined,
        isRecurring: true,
        recurrenceCount: 0,
      }).returning();
      if (task) {
        syncInsert("tasks", task);
        created.push(task.id);

        // Also create recurring task rule
        const recurrencePattern =
          flags.hstPeriod === "monthly" ? "FREQ=MONTHLY;INTERVAL=1" :
          flags.hstPeriod === "quarterly" ? "FREQ=MONTHLY;INTERVAL=3" :
          "FREQ=YEARLY;INTERVAL=1";

        await db.insert(recurringTasks).values({
          clientId,
          userId,
          title,
          description: `Prepare and file ${flags.hstPeriod} HST return for ${clientName}.`,
          frequency: flags.hstPeriod === "monthly" ? "monthly" : flags.hstPeriod === "quarterly" ? "quarterly" : "yearly",
          startDate: now,
          nextDueDate: dueDate,
          priority: "high",
          category: "Tax Filing",
          assignedTo: assignedTo || undefined,
          active: true,
        });
      }
    }
  }

  // --- WSIB Tasks ---
  if (flags.hasWSIB) {
    const dueDate = nextWSIBDueDate(flags.wsibQuarter || "all", now);
    const title = `WSIB Filing — ${clientName}`;
    const existing = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        sql`${tasks.clientId} = ${clientId} AND ${tasks.title} LIKE ${`WSIB Filing%`} AND ${tasks.dueDate} > ${Math.floor(now.getTime() / 1000)}`
      )
      .limit(1);

    if (existing.length === 0) {
      const [task] = await db.insert(tasks).values({
        userId,
        clientId,
        title,
        description: `Prepare and file WSIB return${flags.wsibQuarter && flags.wsibQuarter !== "all" ? ` for ${flags.wsibQuarter}` : ""}.`,
        dueDate,
        priority: "high",
        status: "pending",
        category: "Tax Filing",
        assignedTo: assignedTo || undefined,
        isRecurring: true,
        recurrenceCount: 0,
      }).returning();
      if (task) {
        syncInsert("tasks", task);
        created.push(task.id);

        await db.insert(recurringTasks).values({
          clientId,
          userId,
          title,
          description: `Prepare and file WSIB return for ${clientName}.`,
          frequency: "quarterly",
          startDate: now,
          nextDueDate: dueDate,
          priority: "high",
          category: "Tax Filing",
          assignedTo: assignedTo || undefined,
          active: true,
        });
      }
    }
  }

  // --- Payroll Tasks --- (skipped when client self-manages payroll / autopay)
  if (flags.hasPayroll && flags.payrollFrequency && !flags.payrollExternal) {
    const dueDate = nextPayrollDueDate(flags.payrollFrequency, now);
    const title = `Payroll Remittance — ${clientName}`;
    const existing = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        sql`${tasks.clientId} = ${clientId} AND ${tasks.title} LIKE ${`Payroll Remittance%`} AND ${tasks.dueDate} > ${Math.floor(now.getTime() / 1000)}`
      )
      .limit(1);

    if (existing.length === 0) {
      const [task] = await db.insert(tasks).values({
        userId,
        clientId,
        title,
        description: `Process ${flags.payrollFrequency} payroll and remit source deductions.`,
        dueDate,
        priority: "high",
        status: "pending",
        category: "Payroll",
        assignedTo: assignedTo || undefined,
        isRecurring: true,
        recurrenceCount: 0,
      }).returning();
      if (task) {
        syncInsert("tasks", task);
        created.push(task.id);

        const recurrencePattern =
          flags.payrollFrequency === "weekly" ? "FREQ=WEEKLY;INTERVAL=1" :
          flags.payrollFrequency === "bi-weekly" ? "FREQ=WEEKLY;INTERVAL=2" :
          flags.payrollFrequency === "semi-monthly" ? "FREQ=MONTHLY;BYMONTHDAY=15,-1" :
          flags.payrollFrequency === "monthly" ? "FREQ=MONTHLY;INTERVAL=1" :
          "FREQ=YEARLY;INTERVAL=1";

        await db.insert(recurringTasks).values({
          clientId,
          userId,
          title,
          description: `Process ${flags.payrollFrequency} payroll and remit source deductions for ${clientName}.`,
          frequency: flags.payrollFrequency === "weekly" ? "weekly" : flags.payrollFrequency === "bi-weekly" ? "biweekly" : flags.payrollFrequency === "semi-monthly" ? "monthly" : flags.payrollFrequency === "monthly" ? "monthly" : "yearly",
          startDate: now,
          nextDueDate: dueDate,
          priority: "high",
          category: "Payroll",
          assignedTo: assignedTo || undefined,
          active: true,
        });
      }
    }

    // Also create annual T4 task
    const t4Due = new Date(now.getFullYear() + 1, 1, 28); // Feb 28 next year
    const t4Title = `T4 Filing — ${clientName}`;
    const t4Existing = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        sql`${tasks.clientId} = ${clientId} AND ${tasks.title} = ${t4Title} AND ${tasks.dueDate} > ${Math.floor(now.getTime() / 1000)}`
      )
      .limit(1);

    if (t4Existing.length === 0) {
      const [t4Task] = await db.insert(tasks).values({
        userId,
        clientId,
        title: t4Title,
        description: `Prepare and file annual T4/T4A slips and summary for ${clientName}.`,
        dueDate: t4Due,
        priority: "high",
        status: "pending",
        category: "Payroll",
        assignedTo: assignedTo || undefined,
        isRecurring: true,
        recurrenceCount: 0,
      }).returning();
      if (t4Task) {
        syncInsert("tasks", t4Task);
        created.push(t4Task.id);

        await db.insert(recurringTasks).values({
          clientId,
          userId,
          title: t4Title,
          description: `Prepare and file annual T4/T4A slips and summary for ${clientName}.`,
          frequency: "yearly",
          startDate: now,
          nextDueDate: t4Due,
          priority: "high",
          category: "Payroll",
          assignedTo: assignedTo || undefined,
          active: true,
        });
      }
    }
  }

  // --- Dividend / T5 Task (triggered by the client's "Dividends" payroll feature) ---
  if (flags.paysDividends) {
    const t5Due = new Date(now.getFullYear() + 1, 1, 28); // Feb 28 next year
    const t5Title = `T5 Filing — ${clientName}`;
    const t5Existing = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        sql`${tasks.clientId} = ${clientId} AND ${tasks.title} = ${t5Title} AND ${tasks.dueDate} > ${Math.floor(now.getTime() / 1000)}`
      )
      .limit(1);

    if (t5Existing.length === 0) {
      const [t5Task] = await db.insert(tasks).values({
        userId,
        clientId,
        title: t5Title,
        description: `Prepare and file T5 slips and summary (dividends/interest) for ${clientName}.`,
        dueDate: t5Due,
        priority: "high",
        status: "pending",
        category: "Tax Filing",
        assignedTo: assignedTo || undefined,
        isRecurring: true,
        recurrenceCount: 0,
      }).returning();
      if (t5Task) {
        syncInsert("tasks", t5Task);
        created.push(t5Task.id);

        await db.insert(recurringTasks).values({
          clientId,
          userId,
          title: t5Title,
          description: `Prepare and file annual T5 slips and summary (dividends) for ${clientName}.`,
          frequency: "yearly",
          startDate: now,
          nextDueDate: t5Due,
          priority: "high",
          category: "Tax Filing",
          assignedTo: assignedTo || undefined,
          active: true,
        });
      }
    }
  }

  return { created, count: created.length };
}
