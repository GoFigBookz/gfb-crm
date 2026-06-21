import { eq, and, ne, inArray } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { clientTaskRules, tasks, clients } from "../db/schema";
import { matchClientIdByName } from "./client-match";
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
  // When true, the client runs their own payroll OR it's on full autopay — we do
  // NOT run payroll for them, so skip payroll-run/remittance/T4 task generation.
  payrollExternal?: boolean | null;
  payrollRemitterFreq?: string | null;  // "regular" | "quarterly" | "accelerated"
  hasSubcontractors?: boolean | null;
  hasInvestments?: boolean | null;
  paysDividends?: boolean | null;
  hasEHT?: boolean | null;          // Ontario Employer Health Tax
  monthsBehind?: number | null;     // catch-up / cleanup scope
  employeeCount?: number | null;
  wsibRequired?: boolean | null;
  bankAccountCount?: number | null;
  creditCardCount?: number | null;
  needsYearEnd?: boolean | null;
  // Sales entry platforms
  usesStripe?: boolean | null;
  usesSquare?: boolean | null;
  usesJobber?: boolean | null;
  usesTouchBistro?: boolean | null;
  usesPayPal?: boolean | null;
  usesWise?: boolean | null;
  salesEntryFrequency?: string | null;
  // Scope / responsibilities (drive recurring work + cost)
  bookkeepingFrequency?: string | null;  // "monthly" | "quarterly" | "annual" | "none"
  usesHubdoc?: boolean | null;
  hasJobCosting?: boolean | null;
  avgMonthlyTransactions?: number | null;
  invoicingResponsibility?: string | null;  // "we_invoice" | "client_invoices" | "none"
  billPayResponsibility?: string | null;     // "we_pay" | "client_pays" | "none"
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

  // === BOOKKEEPING / RECONCILIATION (cadence = scope) ===
  const bkFreq = data.bookkeepingFrequency || "monthly";
  if (bkFreq !== "none") {
    const bkLabel = bkFreq === "quarterly" ? "Quarterly" : bkFreq === "annual" ? "Annual" : "Monthly";
    const bkEnum: any = bkFreq === "quarterly" ? "quarterly" : bkFreq === "annual" ? "yearly" : "monthly";
    rules.push({
      ruleType: "bookkeeping_reconcile",
      title: `${bkLabel} Bookkeeping — Reconcile All Statements`,
      description: "Reconcile all bank accounts, credit cards, and loan statements for the period. Categorize all transactions and review uncleared items.",
      category: "Reconciliation",
      priority: "high",
      frequency: bkEnum,
      dueDayOfMonth: 15,
      daysBeforeDue: 5,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
  }

  // === SALES ENTRY ===
  // Receipt-based platforms (cash already collected) -> monthly Sales Receipt in QBO.
  const receiptPlatforms: string[] = [];
  if (data.usesStripe) receiptPlatforms.push("Stripe");
  if (data.usesSquare) receiptPlatforms.push("Square");
  if (data.usesTouchBistro) receiptPlatforms.push("TouchBistro");
  if (data.usesPayPal) receiptPlatforms.push("PayPal");
  if (receiptPlatforms.length > 0) {
    const p = receiptPlatforms.join(" / ");
    rules.push({
      ruleType: "sales_receipts",
      title: `Monthly Sales Receipts — ${p}`,
      description: `Pull the monthly sales report from ${p}. Break out net sales and HST/GST, save the report as backup/proof, then create the monthly Sales Receipt in QuickBooks and reconcile to the bank deposit (net of processor fees).`,
      category: "Sales",
      priority: "high",
      frequency: "monthly",
      dueDayOfMonth: 10,
      daysBeforeDue: 0,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
  }
  // Jobber is A/R — record what was invoiced (not a cash receipt).
  if (data.usesJobber) {
    rules.push({
      ruleType: "sales_invoicing_jobber",
      title: "Monthly Invoicing — Jobber (A/R)",
      description: "Pull the monthly Jobber invoicing report. Break out invoiced revenue and HST/GST, save the report as backup/proof, then enter the invoices (A/R) in QuickBooks and reconcile against payments received.",
      category: "Sales",
      priority: "high",
      frequency: "monthly",
      dueDayOfMonth: 10,
      daysBeforeDue: 0,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
  }

  // === CLIENT INVOICING (only when WE issue their invoices) ===
  if (data.invoicingResponsibility === "we_invoice") {
    rules.push({
      ruleType: "client_invoicing",
      title: "Client Invoicing",
      description: "Prepare and send this client's customer invoices in QuickBooks for the period, then follow up on A/R.",
      category: "Invoicing", priority: "high", frequency: "monthly",
      dueDayOfMonth: 5, daysBeforeDue: 0, fiscalYearEndMonth: fy?.month, fiscalYearEndDay: fy?.day,
    });
  }

  // === BILL PAYMENTS / A/P (only when WE pay their bills) ===
  if (data.billPayResponsibility === "we_pay") {
    rules.push({
      ruleType: "bill_payments",
      title: "Bill Payments (A/P run)",
      description: "Review and pay this client's vendor bills for the period (A/P run), then record payments in QuickBooks.",
      category: "Accounts Payable", priority: "high", frequency: "monthly",
      dueDayOfMonth: 20, daysBeforeDue: 0, fiscalYearEndMonth: fy?.month, fiscalYearEndDay: fy?.day,
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

    // T4 / T4A filing - Due end of February (skip if we don't run their payroll)
    if (data.hasEmployees && !data.payrollExternal) {
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

    // T5 filing — dividends paid to shareholders and/or investment income
    if (data.hasInvestments || data.paysDividends) {
      rules.push({
        ruleType: "t5_annual",
        title: "Prepare & File T5 Slips (Dividends)",
        description: "Prepare T5 slips for dividends paid to shareholders (and any investment income). Distribute to recipients and file with CRA by Feb 28.",
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

    // T2 corporate tax — filed by the external accountant. We coordinate:
    // 1) confirm whether CRA requires T2 installments and add them if so
    //    (installments don't apply to every client — hence a "check" reminder),
    rules.push({
      ruleType: "t2_installments_check",
      title: "Confirm T2 installments with accountant",
      description: "Ask the client's accountant whether CRA requires corporate (T2) tax installments this year. If yes, get the schedule/amounts and add the installment payment tasks. Not every client has installments — confirm each year.",
      category: "Tax",
      priority: "medium",
      frequency: "yearly",
      dueDayOfMonth: fy.day,
      daysBeforeDue: 30,
      fiscalYearEndMonth: fy.month,
      fiscalYearEndDay: fy.day,
    });
    // 2) confirm the T2 return itself was filed (due ~6 months after year-end).
    rules.push({
      ruleType: "t2_filing_confirm",
      title: "Confirm T2 filed by accountant",
      description: "Send the year-end package to the accountant and confirm the T2 corporate tax return is filed (due 6 months after fiscal year-end) and any balance paid.",
      category: "Tax",
      priority: "high",
      frequency: "yearly",
      dueDayOfMonth: fy.day,
      daysBeforeDue: 0,  // ~at the 6-month mark; calculateNextDueDate offsets from YE
      fiscalYearEndMonth: fy.month,
      fiscalYearEndDay: fy.day,
    });
  }

  // === EHT — Ontario Employer Health Tax (only when applicable) ===
  if (data.hasEHT) {
    rules.push({
      ruleType: "eht_annual",
      title: "EHT Annual Return (Ontario)",
      description: "Prepare and file the Ontario Employer Health Tax annual return (due Mar 15). If over the installment threshold, confirm monthly installments are remitted.",
      category: "Payroll",
      priority: "high",
      frequency: "yearly",
      dueDayOfMonth: 15,
      dueMonth: 3,
      daysBeforeDue: 21,
      fiscalYearEndMonth: fy?.month,
      fiscalYearEndDay: fy?.day,
    });
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

  // === PAYROLL REMITTANCES (PD7A) — cadence driven by CRA remitter type ===
  // Skipped entirely when the client self-manages payroll or it's on autopay.
  if (!data.payrollExternal && data.payrollFrequency && data.payrollFrequency !== "none") {
    const remitter = data.payrollRemitterFreq || "regular";
    if (remitter === "quarterly") {
      rules.push({
        ruleType: "payroll_remit_quarterly",
        title: "Payroll Remittance (PD7A) — Quarterly",
        description: "QUARTERLY remitter: remit source deductions (CPP, EI, income tax) via PD7A by the 15th of the month following each quarter.",
        category: "Payroll", priority: "high", frequency: "quarterly",
        dueDayOfMonth: 15, daysBeforeDue: 5, fiscalYearEndMonth: fy?.month, fiscalYearEndDay: fy?.day,
      });
    } else if (remitter === "accelerated") {
      rules.push({
        ruleType: "payroll_remit_accelerated",
        title: "Payroll Remittance (PD7A) - ACCELERATED (due 25th)",
        description: "ACCELERATED remitter (Threshold 1): remit by the 25th for the 1st-15th pay period (and by the 10th of next month for the 16th-end period). Pay ~2 business days early so CRA receives it on time - penalties are based on receipt date.",
        category: "Payroll", priority: "high", frequency: "monthly",
        dueDayOfMonth: 25, daysBeforeDue: 2, fiscalYearEndMonth: fy?.month, fiscalYearEndDay: fy?.day,
      });
    } else {
      rules.push({
        ruleType: "payroll_remit_regular",
        title: "Payroll Remittance (PD7A)",
        description: "Regular remitter: remit source deductions (CPP, EI, income tax) via PD7A by the 15th of the following month.",
        category: "Payroll", priority: "high", frequency: "monthly",
        dueDayOfMonth: 15, daysBeforeDue: 3, fiscalYearEndMonth: fy?.month, fiscalYearEndDay: fy?.day,
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

/**
 * One-time SETUP tasks every new client needs — created idempotently (by title)
 * so re-running never duplicates them. CRA Represent-a-Client access is mandatory
 * for all; Service Canada (ROE Web) when there's payroll; WSIB when applicable.
 */
export async function ensureSetupTasks(opts: {
  clientId: number; userId: number; assignedTo?: string | null;
  hasPayroll?: boolean | null; hasWsib?: boolean | null; usesHubdoc?: boolean | null;
  monthsBehind?: number | null; wsibNumberMissing?: boolean | null; craNumberMissing?: boolean | null;
}): Promise<number> {
  const db = getDb();
  const dueDate = new Date(Date.now() + 14 * 86_400_000); // ~2 weeks to get access set up
  const items: Array<{ title: string; description: string }> = [
    {
      title: "Get CRA Represent a Client (RAC) access",
      description: "Request and confirm Represent a Client authorization with CRA so we can manage this client's CRA accounts (RC59 / online authorization request). Required before we can file or view CRA data.",
    },
  ];
  if (opts.craNumberMissing) items.push({
    title: "Request CRA Business Number from client",
    description: "We don't have this client's CRA Business Number (BN) on file. Request it from the client and add it to the client card.",
  });
  if (opts.hasPayroll) items.push({
    title: "Set up Service Canada (ROE Web) access",
    description: "Register / obtain Service Canada ROE Web access for this client's payroll so Records of Employment can be issued and filed.",
  });
  if (opts.hasWsib) items.push({
    title: "Set up WSIB account & access",
    description: "Set up or confirm the client's WSIB account and online access (registration, clearance certificate, premium reporting).",
  });
  if (opts.wsibNumberMissing) items.push({
    title: "Request WSIB account number from client",
    description: "This client has WSIB but we don't have the account number on file. Request the WSIB account number from the client and add it to the client card.",
  });
  if (opts.usesHubdoc) items.push({
    title: "Connect Hubdoc",
    description: "Set up / connect this client's Hubdoc so receipts and bills flow into QuickBooks automatically.",
  });
  if (opts.monthsBehind && opts.monthsBehind > 0) items.push({
    title: `Catch-up bookkeeping (${opts.monthsBehind} months behind)`,
    description: `One-time cleanup: bring the books current — ${opts.monthsBehind} month(s) behind. Gather statements, reconcile, and catch up before the recurring cadence starts. Price this as a separate cleanup project.`,
  });

  let created = 0;
  for (const it of items) {
    const existing = await db.select().from(tasks)
      .where(and(eq(tasks.clientId, opts.clientId), eq(tasks.title, it.title))).limit(1);
    if (existing[0]) continue;
    await db.insert(tasks).values({
      userId: opts.userId, clientId: opts.clientId, title: it.title, description: it.description,
      category: "Setup", priority: "high", completed: false, dueDate,
      assignedTo: opts.assignedTo || null, isRecurring: false, recurrenceCount: 0, status: "pending",
    });
    created++;
  }
  return created;
}

/** Ensure every active client has its one-time setup tasks (backfill on boot —
 *  the already-seeded clients have rules so the seed skips them, but they still
 *  need CRA/Service Canada/WSIB setup tasks). Idempotent. */
export async function backfillSetupTasks(): Promise<{ clients: number; created: number }> {
  const db = getDb();
  const all = await db.select().from(clients).where(eq(clients.status, "active"));
  let created = 0;
  for (const c of all as any[]) {
    try {
      created += await ensureSetupTasks({
        clientId: c.id, userId: c.userId ?? 1, assignedTo: c.assignedTo ?? null,
        hasPayroll: Boolean(c.hasPayroll), hasWsib: Boolean(c.hasWSIB),
        wsibNumberMissing: Boolean(c.hasWSIB) && !c.wsibAccountNumber,
        craNumberMissing: !c.taxId,
      });
    } catch { /* best effort per client */ }
  }
  return { clients: all.length, created };
}

/** The PD7A remittance rule config for a given CRA remitter type. */
function payrollRemitConfig(remitter: string): TaskRuleConfig {
  if (remitter === "quarterly") return {
    ruleType: "payroll_remit_quarterly", title: "Payroll Remittance (PD7A) - Quarterly",
    description: "QUARTERLY remitter: remit source deductions (CPP, EI, income tax) via PD7A by the 15th of the month following each quarter.",
    category: "Payroll", priority: "high", frequency: "quarterly", dueDayOfMonth: 15, daysBeforeDue: 5,
  };
  if (remitter === "accelerated") return {
    ruleType: "payroll_remit_accelerated", title: "Payroll Remittance (PD7A) - ACCELERATED (due 25th)",
    description: "ACCELERATED remitter (Threshold 1): remit by the 25th for the 1st-15th pay period (and by the 10th of next month for the 16th-end period). Pay ~2 business days early so CRA receives it on time.",
    category: "Payroll", priority: "high", frequency: "monthly", dueDayOfMonth: 25, daysBeforeDue: 2,
  };
  return {
    ruleType: "payroll_remit_regular", title: "Payroll Remittance (PD7A)",
    description: "Regular remitter: remit source deductions (CPP, EI, income tax) via PD7A by the 15th of the following month.",
    category: "Payroll", priority: "high", frequency: "monthly", dueDayOfMonth: 15, daysBeforeDue: 3,
  };
}

const PAYROLL_REMIT_RULE_TYPES = [
  "payroll_weekly", "payroll_monthly", "payroll_remit_regular", "payroll_remit_quarterly", "payroll_remit_accelerated",
];

/** One-time corrections: set specific clients' CRA remitter type and rebuild their
 *  PD7A remittance task to the correct cadence. Idempotent (skips when already set). */
export async function applyPayrollRemitterOverrides(): Promise<{ fixed: number }> {
  const db = getDb();
  const OVERRIDES: Array<{ match: string; freq: "regular" | "quarterly" | "accelerated" }> = [
    { match: "originality", freq: "accelerated" },
    { match: "2303851", freq: "accelerated" },
    { match: "align by design", freq: "quarterly" },
    { match: "fractal", freq: "quarterly" },
  ];
  let fixed = 0;
  for (const o of OVERRIDES) {
    try {
      const id = await matchClientIdByName(o.match);
      if (!id) continue;
      const c = (await db.select().from(clients).where(eq(clients.id, id)).limit(1))[0] as any;
      if (!c) continue;
      if (c.payrollRemitterFreq === o.freq) continue; // already corrected
      await db.update(clients).set({ payrollRemitterFreq: o.freq }).where(eq(clients.id, id));
      // remove old PD7A rules + their generated tasks
      const oldRules = await db.select().from(clientTaskRules)
        .where(and(eq(clientTaskRules.clientId, id), inArray(clientTaskRules.ruleType, PAYROLL_REMIT_RULE_TYPES)));
      for (const r of oldRules) await db.delete(tasks).where(eq(tasks.ruleId, r.id));
      await db.delete(clientTaskRules)
        .where(and(eq(clientTaskRules.clientId, id), inArray(clientTaskRules.ruleType, PAYROLL_REMIT_RULE_TYPES)));
      // create the correct PD7A rule + first task
      const cfg = payrollRemitConfig(o.freq);
      const nextDueDate = calculateNextDueDate(cfg);
      const [rule] = await db.insert(clientTaskRules).values({
        clientId: id, userId: c.userId ?? 1, title: cfg.title, description: cfg.description,
        category: cfg.category, priority: cfg.priority, assignedTo: c.assignedTo ?? null,
        ruleType: cfg.ruleType, frequency: cfg.frequency, dueDayOfMonth: cfg.dueDayOfMonth,
        dueMonth: cfg.dueMonth ?? null, daysBeforeDue: cfg.daysBeforeDue,
        fiscalYearEndMonth: null, fiscalYearEndDay: null, nextDueDate, active: true,
      }).returning();
      if (rule) { const t = generateTaskFromRule(rule, 1); await db.insert(tasks).values(t); }
      fixed++;
    } catch (e) {
      console.error("[remitter] override failed for", o.match, ":", e instanceof Error ? e.message : e);
    }
  }
  if (fixed) console.log(`[remitter] corrected ${fixed} clients' PD7A cadence`);
  return { fixed };
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

  // One-time setup tasks (CRA RAC always; Service Canada if payroll; WSIB if applicable).
  const setupCreated = await ensureSetupTasks({
    clientId: data.clientId, userId: data.userId, assignedTo: data.assignedTo,
    hasPayroll: Boolean(data.payrollFrequency && data.payrollFrequency !== "none") || Boolean(data.hasEmployees),
    hasWsib: Boolean(data.wsibRequired),
    usesHubdoc: Boolean(data.usesHubdoc),
    monthsBehind: data.monthsBehind ?? 0,
  });

  return { rules: createdRules, tasks: createdTasks, setupTasks: setupCreated };
}

/**
 * Idempotent, ADDITIVE compliance backfill. Unlike createClientTaskRules (which
 * is all-or-nothing and meant for brand-new clients), this ensures each cadence
 * rule the client SHOULD have (HST, payroll remittance, year-end, T4/T5, WSIB…)
 * exists — adding only the MISSING ones, never duplicating. This is what fixes
 * "client already had some rules but no HST task, so it was skipped forever".
 * One active rule per (clientId, ruleType) is the uniqueness key.
 */
export async function ensureComplianceRulesAndTasks(data: OnboardingData) {
  const db = getDb();
  const rules = buildTaskRules(data);
  const created = { rules: 0, tasks: 0 };

  const existing = await db.select().from(clientTaskRules).where(eq(clientTaskRules.clientId, data.clientId));
  const haveTypes = new Set((existing as any[]).map((r) => r.ruleType).filter(Boolean));

  // Cross-system de-dup: the older client-task-creator path makes differently-
  // titled compliance tasks (e.g. "HST Filing — X"). Don't add a second one if an
  // open task of the same domain already exists. Keyword-guarded per rule type.
  const openTasks = await db.select({ title: tasks.title }).from(tasks)
    .where(and(eq(tasks.clientId, data.clientId), ne(tasks.status, "completed")));
  const openTitles = (openTasks as any[]).map((t) => String(t.title ?? "").toLowerCase());
  const DOMAIN_KEYWORD: Record<string, string> = {
    hst_monthly: "hst", hst_quarterly: "hst", hst_annual: "hst",
  };
  const coveredByOtherSystem = (ruleType: string) => {
    const kw = DOMAIN_KEYWORD[ruleType];
    return kw ? openTitles.some((t) => t.includes(kw)) : false;
  };

  for (const config of rules) {
    if (haveTypes.has(config.ruleType)) continue; // already covered — don't duplicate
    if (coveredByOtherSystem(config.ruleType)) continue; // covered by the other task system
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
    if (!rule) continue;
    created.rules++;
    haveTypes.add(config.ruleType);

    // Materialize the first task only if the client doesn't already have an open
    // task of this rule type (defensive against earlier partial generation).
    const openOfType = await db.select().from(tasks)
      .where(and(eq(tasks.clientId, data.clientId), eq(tasks.ruleId, rule.id))).limit(1);
    if (openOfType.length === 0) {
      const [task] = await db.insert(tasks).values(generateTaskFromRule(rule, 1)).returning();
      if (task) created.tasks++;
    }
    await db.update(clientTaskRules).set({ lastGeneratedDate: new Date() }).where(eq(clientTaskRules.id, rule.id));
  }
  return created;
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
