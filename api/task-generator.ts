import { eq } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { clientTaskRules, tasks, clients } from "../db/schema";
import type { InferSelectModel } from "drizzle-orm";

// Types
export type OnboardingData = {
  clientId: number;
  userId: number;
  assignedTo?: string | null;
  fiscalYearEnd?: string | null;
  hstGstFrequency?: string | null;
  payrollFrequency?: string | null;
  hasEmployees?: boolean | null;
  hasSubcontractors?: boolean | null;
  hasInvestments?: boolean | null;
  wsibRequired?: boolean | null;
  bankAccountCount?: number | null;
  creditCardCount?: number | null;
  needsYearEnd?: boolean | null;
  // Sales entry platforms
  usesStripe?: boolean | null;
  usesSquare?: boolean | null;
  usesJobber?: boolean | null;
  salesEntryFrequency?: string | null;
};

export type TaskRuleConfig = {
  ruleType: string;
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high";
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  dueDayOfMonth: number;
  dueMonth?: number;
  daysBeforeDue: number;
  fiscalYearEndMonth?: number;
  fiscalYearEndDay?: number;
};

// Parse "December 31" or "Dec 31" or "12/31" into { month: 12, day: 31 }
export function parseFiscalYearEnd(fiscalYearEnd?: string | null): { month: number; day: number } | null {
  if (!fiscalYearEnd) return null;
  const s = fiscalYearEnd.trim();

  // Try "December 31" or "Dec 31"
  const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const lower = s.toLowerCase();
  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i]) || lower.includes(monthNames[i].slice(0, 3))) {
      const dayMatch = s.match(/(\d{1,2})/);
      if (dayMatch) {
        return { month: i + 1, day: Math.min(Math.max(parseInt(dayMatch[1]), 1), 31) };
      }
    }
  }

  // Try "12/31" or "12-31"
  const numericMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (numericMatch) {
    return { month: parseInt(numericMatch[1]), day: parseInt(numericMatch[2]) };
  }

  return null;
}

// Build task rules from onboarding data
export function buildTaskRules(data: OnboardingData): TaskRuleConfig[] {
  const rules: TaskRuleConfig[] = [];
  const fy = parseFiscalYearEnd(data.fiscalYearEnd);

  // === MONTHLY RECONCILIATION (for ALL clients) ===
  rules.push({
    ruleType: "monthly_reconcile_all",
    title: "Monthly Reconciliation — All Statements",
    description: "Reconcile all bank accounts, credit cards, and loan statements for the month. Ensure all transactions are categorized and uncleared items are reviewed.",
    category: "Reconciliation",
    priority: "high",
    frequency: "monthly",
    dueDayOfMonth: 15,
    daysBeforeDue: 5,
    fiscalYearEndMonth: fy?.month,
    fiscalYearEndDay: fy?.day,
  });

  // === SALES ENTRY (Stripe / Square / Jobber) ===
  if (data.usesStripe || data.usesSquare || data.usesJobber) {
    const platforms: string[] = [];
    if (data.usesStripe) platforms.push("Stripe");
    if (data.usesSquare) platforms.push("Square");
    if (data.usesJobber) platforms.push("Jobber");
    
    const freq = data.salesEntryFrequency || "monthly";
    const freqLabel = freq === "daily" ? "Daily" : freq === "weekly" ? "Weekly" : "Monthly";
    const freqEnum: any = freq === "daily" ? "daily" : freq === "weekly" ? "weekly" : "monthly";
    
    rules.push({
      ruleType: "sales_entry",
      title: `${freqLabel} Sales Entry (${platforms.join(" / ")})`,
      description: `Enter sales transactions from ${platforms.join(", ")} into QuickBooks. Ensure all payments, fees, and deposits are properly categorized. Reconcile to bank deposits.`,
      category: "Sales",
      priority: "high",
      frequency: freqEnum,
      dueDayOfMonth: freq === "daily" ? 1 : freq === "weekly" ? 5 : 10,
      daysBeforeDue: 0,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
  }

  // === YEAR-END PREPARATION ===
  if (data.needsYearEnd !== false && fy) {
    rules.push({
      ruleType: "year_end",
      title: "Year-End Preparation",
      description: "Complete year-end checklist: reconcile all accounts, review shareholder loans, calculate CCA, prepare T4/T5 slips, generate financial statements, and package for accountant.",
      category: "Year-End",
      priority: "high",
      frequency: "yearly",
      dueDayOfMonth: fy.day,
      daysBeforeDue: 60,
      fiscalYearEndMonth: fy.month,
      fiscalYearEndDay: fy.day,
    });

    // T4 / T4A filing - Due end of February
    if (data.hasEmployees) {
      rules.push({
        ruleType: "t4_annual",
        title: "Prepare & File T4 / T4A Slips",
        description: "Prepare T4 slips for all employees and T4A slips for contractors. Distribute to recipients and file with CRA by Feb 28.",
        category: "Payroll",
        priority: "high",
        frequency: "yearly",
        dueDayOfMonth: 28,
        dueMonth: 2,
        daysBeforeDue: 30,
        fiscalYearEndMonth: fy.month,
        fiscalYearEndDay: fy.day,
      });
    }

    // T5 filing
    if (data.hasInvestments) {
      rules.push({
        ruleType: "t5_annual",
        title: "Prepare & File T5 Slips",
        description: "Prepare T5 slips for investment income (dividends, interest). Distribute to recipients and file with CRA by Feb 28.",
        category: "Tax",
        priority: "high",
        frequency: "yearly",
        dueDayOfMonth: 28,
        dueMonth: 2,
        daysBeforeDue: 30,
        fiscalYearEndMonth: fy.month,
        fiscalYearEndDay: fy.day,
      });
    }

    // T5018 filing
    if (data.hasSubcontractors) {
      rules.push({
        ruleType: "t5018_annual",
        title: "Prepare & File T5018",
        description: "Prepare T5018 Information Return for construction subcontractors paid. File with CRA by Feb 28.",
        category: "Tax",
        priority: "high",
        frequency: "yearly",
        dueDayOfMonth: 28,
        dueMonth: 2,
        daysBeforeDue: 30,
        fiscalYearEndMonth: fy.month,
        fiscalYearEndDay: fy.day,
      });
    }
  }

  // === HST/GST FILING ===
  if (data.hstGstFrequency && data.hstGstFrequency !== "none") {
    if (data.hstGstFrequency === "monthly") {
      rules.push({
        ruleType: "hst_monthly",
        title: "Monthly HST/GST Return",
        description: "Prepare and file monthly HST/GST return. Reconcile ITCs and remit net amount.",
        category: "Tax",
        priority: "high",
        frequency: "monthly",
        dueDayOfMonth: 15,
        daysBeforeDue: 5,
        fiscalYearEndMonth: fy?.month,
        fiscalYearEndDay: fy?.day,
      });
    } else if (data.hstGstFrequency === "quarterly") {
      rules.push({
        ruleType: "hst_quarterly",
        title: "Quarterly HST/GST Return",
        description: "Prepare and file quarterly HST/GST return. Reconcile ITCs and remit net amount.",
        category: "Tax",
        priority: "high",
        frequency: "quarterly",
        dueDayOfMonth: 15,
        daysBeforeDue: 5,
        fiscalYearEndMonth: fy?.month,
        fiscalYearEndDay: fy?.day,
      });
    } else if (data.hstGstFrequency === "annually") {
      rules.push({
        ruleType: "hst_annual",
        title: "Annual HST/GST Return",
        description: "Prepare and file annual HST/GST return. Due 3 months after fiscal year end.",
        category: "Tax",
        priority: "high",
        frequency: "yearly",
        dueDayOfMonth: fy?.day || 15,
        daysBeforeDue: 14,
        fiscalYearEndMonth: fy?.month,
        fiscalYearEndDay: fy?.day,
      });
    }
  }

  // === PAYROLL REMITTANCES ===
  if (data.payrollFrequency && data.payrollFrequency !== "none") {
    if (data.payrollFrequency === "weekly" || data.payrollFrequency === "biweekly") {
      rules.push({
        ruleType: "payroll_weekly",
        title: "Payroll Remittance (PD7A)",
        description: "Prepare and remit source deductions (CPP, EI, income tax) via PD7A. Due 15th of following month.",
        category: "Payroll",
        priority: "high",
        frequency: "monthly",
        dueDayOfMonth: 15,
        daysBeforeDue: 3,
        fiscalYearEndMonth: fy?.month,
        fiscalYearEndDay: fy?.day,
      });
    } else if (data.payrollFrequency === "semi_monthly" || data.payrollFrequency === "monthly") {
      rules.push({
        ruleType: "payroll_monthly",
        title: "Payroll Remittance (PD7A)",
        description: "Prepare and remit source deductions (CPP, EI, income tax) via PD7A. Due 15th of following month.",
        category: "Payroll",
        priority: "high",
        frequency: "monthly",
        dueDayOfMonth: 15,
        daysBeforeDue: 3,
        fiscalYearEndMonth: fy?.month,
        fiscalYearEndDay: fy?.day,
      });
    }
  }

  // Also add a payroll tax task specifically (for tax calculation prep)
  if (data.hasEmployees) {
    rules.push({
      ruleType: "payroll_tax_prep",
      title: "Payroll Tax Preparation",
      description: "Review and prepare payroll tax calculations. Verify taxable benefits, calculate source deductions, and prepare PD7A worksheet.",
      category: "Payroll",
      priority: "high",
      frequency: "monthly",
      dueDayOfMonth: 10,
      daysBeforeDue: 0,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
  }

  // === WSIB ANNUAL RECONCILIATION ===
  if (data.wsibRequired) {
    rules.push({
      ruleType: "wsib_annual",
      title: "WSIB Annual Reconciliation",
      description: "Complete WSIB annual reconciliation report. Verify premiums paid vs. actual insurable earnings.",
      category: "Payroll",
      priority: "medium",
      frequency: "yearly",
      dueDayOfMonth: 28,
      dueMonth: 2,
      daysBeforeDue: 30,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
  }

  // === BANK RECONCILIATION ===
  const bankCount = data.bankAccountCount || 1;
  const ccCount = data.creditCardCount || 0;
  const totalAccounts = bankCount + ccCount;
  if (totalAccounts > 0) {
    rules.push({
      ruleType: "bank_reconcile",
      title: "Bank & Credit Card Reconciliation",
      description: `Reconcile all ${bankCount} bank account(s) and ${ccCount} credit card(s). Match transactions, clear items, and review uncleared transactions.`,
      category: "Banking",
      priority: "high",
      frequency: "monthly",
      dueDayOfMonth: 10,
      daysBeforeDue: 0,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
  }

  return rules;
}

// ... rest of the file stays the same (calculateNextDueDate, generateTaskFromRule, etc.)


// Calculate the next due date for a rule
export function calculateNextDueDate(rule: TaskRuleConfig, afterDate?: Date): Date {
  const now = afterDate || new Date();
  let nextDate: Date;

  switch (rule.frequency) {
    case "daily": {
      nextDate = new Date(now);
      nextDate.setDate(now.getDate() + 1);
      break;
    }
    case "weekly": {
      nextDate = new Date(now);
      nextDate.setDate(now.getDate() + (7 - now.getDay()));
      break;
    }
    case "biweekly": {
      nextDate = new Date(now);
      nextDate.setDate(now.getDate() + 14);
      break;
    }
    case "monthly": {
      nextDate = new Date(now.getFullYear(), now.getMonth(), rule.dueDayOfMonth);
      if (nextDate <= now) {
        nextDate = new Date(now.getFullYear(), now.getMonth() + 1, rule.dueDayOfMonth);
      }
      break;
    }
    case "quarterly": {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      nextDate = new Date(now.getFullYear(), currentQuarter * 3 + 2, rule.dueDayOfMonth);
      if (nextDate <= now) {
        nextDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3 + 2, rule.dueDayOfMonth);
      }
      break;
    }
    case "yearly": {
      if (rule.dueMonth) {
        nextDate = new Date(now.getFullYear(), rule.dueMonth - 1, rule.dueDayOfMonth);
        if (nextDate <= now) {
          nextDate = new Date(now.getFullYear() + 1, rule.dueMonth - 1, rule.dueDayOfMonth);
        }
      } else if (rule.fiscalYearEndMonth) {
        nextDate = new Date(now.getFullYear(), rule.fiscalYearEndMonth - 1, rule.dueDayOfMonth);
        if (nextDate <= now) {
          nextDate = new Date(now.getFullYear() + 1, rule.fiscalYearEndMonth - 1, rule.dueDayOfMonth);
        }
      } else {
        nextDate = new Date(now.getFullYear(), now.getMonth(), rule.dueDayOfMonth);
        if (nextDate <= now) {
          nextDate = new Date(now.getFullYear() + 1, now.getMonth(), rule.dueDayOfMonth);
        }
      }
      break;
    }
    default: {
      nextDate = new Date(now);
      nextDate.setMonth(now.getMonth() + 1);
    }
  }

  return nextDate;
}

// Generate the initial task from a rule
export function generateTaskFromRule(
  rule: InferSelectModel<typeof clientTaskRules>,
  instanceNumber: number = 1
): { title: string; description: string; dueDate: Date; clientId: number; userId: number; category: string; priority: string; assignedTo: string | null; ruleId: number; isRecurring: boolean; recurrenceCount: number; status: string; completed: boolean } {
  const dueDate = new Date(rule.nextDueDate);

  return {
    title: rule.title,
    description: rule.description || "",
    dueDate,
    clientId: rule.clientId,
    userId: rule.userId,
    category: rule.category || "General",
    priority: rule.priority,
    assignedTo: rule.assignedTo,
    ruleId: rule.id,
    isRecurring: true,
    recurrenceCount: instanceNumber,
    status: "pending",
    completed: false,
  };
}

// Save rules to database and generate first tasks
export async function createClientTaskRules(data: OnboardingData) {
  const db = getDb();
  const rules = buildTaskRules(data);

  const createdRules: InferSelectModel<typeof clientTaskRules>[] = [];
  const createdTasks: InferSelectModel<typeof tasks>[] = [];

  for (const config of rules) {
    const nextDueDate = calculateNextDueDate(config);

    const [rule] = await db.insert(clientTaskRules).values({
      clientId: data.clientId,
      userId: data.userId,
      title: config.title,
      description: config.description,
      category: config.category,
      priority: config.priority,
      assignedTo: data.assignedTo || null,
      ruleType: config.ruleType,
      frequency: config.frequency,
      dueDayOfMonth: config.dueDayOfMonth,
      dueMonth: config.dueMonth || null,
      daysBeforeDue: config.daysBeforeDue,
      fiscalYearEndMonth: config.fiscalYearEndMonth || null,
      fiscalYearEndDay: config.fiscalYearEndDay || null,
      nextDueDate,
      active: true,
    }).returning();

    if (rule) {
      createdRules.push(rule);

      const taskData = generateTaskFromRule(rule, 1);
      const [task] = await db.insert(tasks).values(taskData).returning();
      if (task) {
        createdTasks.push(task);
      }

      await db.update(clientTaskRules)
        .set({ lastGeneratedDate: new Date() })
        .where(eq(clientTaskRules.id, rule.id));
    }
  }

  return { rules: createdRules, tasks: createdTasks };
}

// When a recurring task is completed, generate the next instance
export async function generateNextTaskInstance(completedTaskId: number) {
  const db = getDb();

  const taskRows = await db.select().from(tasks).where(eq(tasks.id, completedTaskId)).limit(1);
  const completedTask = taskRows[0];
  if (!completedTask || !completedTask.ruleId) return null;

  const ruleRows = await db.select().from(clientTaskRules).where(eq(clientTaskRules.id, completedTask.ruleId)).limit(1);
  const rule = ruleRows[0];
  if (!rule || !rule.active) return null;

  const config: TaskRuleConfig = {
    ruleType: rule.ruleType,
    title: rule.title,
    description: rule.description || "",
    category: rule.category || "",
    priority: rule.priority as "low" | "medium" | "high",
    frequency: rule.frequency as "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly",
    dueDayOfMonth: rule.dueDayOfMonth || 15,
    dueMonth: rule.dueMonth || undefined,
    daysBeforeDue: rule.daysBeforeDue || 0,
    fiscalYearEndMonth: rule.fiscalYearEndMonth || undefined,
    fiscalYearEndDay: rule.fiscalYearEndDay || undefined,
  };

  const nextDueDate = calculateNextDueDate(config, new Date(rule.nextDueDate));

  await db.update(clientTaskRules)
    .set({ nextDueDate, lastGeneratedDate: new Date() })
    .where(eq(clientTaskRules.id, rule.id));

  const newInstanceCount = (completedTask.recurrenceCount || 1) + 1;
  const nextTask = generateTaskFromRule({ ...rule, nextDueDate }, newInstanceCount);

  const [newTask] = await db.insert(tasks).values(nextTask);

  return newTask;
}

// Get all rules for a client
export async function getClientTaskRules(clientId: number) {
  const db = getDb();
  return db.select().from(clientTaskRules).where(eq(clientTaskRules.clientId, clientId));
}

// Activate/deactivate a rule
export async function setRuleActive(ruleId: number, active: boolean) {
  const db = getDb();
  await db.update(clientTaskRules).set({ active }).where(eq(clientTaskRules.id, ruleId));
}
