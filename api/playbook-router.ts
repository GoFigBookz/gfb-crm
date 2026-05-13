import { z } from "zod";
import { createRouter, staffQuery, seniorQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientPlaybooks, clientOnboarding } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { syncInsert, syncUpdate } from "./sync-hooks";

// Default playbook sections based on Canadian bookkeeping SOPs
function generateDefaultSections(onboarding: typeof clientOnboarding.$inferSelect | null) {
  const sections: PlaybookSection[] = [
    {
      id: "filing-deadlines",
      title: "Filing Deadlines",
      icon: "calendar",
      content: generateFilingDeadlines(onboarding),
    },
    {
      id: "banking-procedures",
      title: "Banking & Reconciliation",
      icon: "building",
      content: generateBankingProcedures(onboarding),
    },
    {
      id: "payroll-procedures",
      title: "Payroll Procedures",
      icon: "users",
      content: generatePayrollProcedures(onboarding),
    },
    {
      id: "hst-procedures",
      title: "HST/GST Procedures",
      icon: "receipt",
      content: generateHstProcedures(onboarding),
    },
    {
      id: "year-end-procedures",
      title: "Year-End Procedures",
      icon: "file-check",
      content: generateYearEndProcedures(onboarding),
    },
    {
      id: "wsib-procedures",
      title: "WSIB / Insurance",
      icon: "shield",
      content: generateWsibProcedures(onboarding),
    },
    {
      id: "special-notes",
      title: "Special Instructions & Notes",
      icon: "notebook",
      content: "",
    },
  ];
  return sections;
}

function generateFilingDeadlines(onboarding: typeof clientOnboarding.$inferSelect | null) {
  if (!onboarding) return "No onboarding data available. Add deadlines based on client profile.";
  const lines: string[] = [];

  if (onboarding.hstGstFrequency && onboarding.hstGstFrequency !== "none") {
    lines.push(`- HST/GST: ${onboarding.hstGstFrequency} filings required`);
  }
  if (onboarding.payrollFrequency && onboarding.payrollFrequency !== "none") {
    lines.push(`- Payroll remittances: ${onboarding.payrollFrequency}`);
  }
  if (onboarding.wsibRequired) {
    lines.push("- WSIB: Annual reconciliation due by March 31");
  }
  if (onboarding.fiscalYearEnd) {
    lines.push(`- Fiscal year-end: ${onboarding.fiscalYearEnd}`);
  }
  if (onboarding.hasEmployees) {
    lines.push("- T4 filing: Due last day of February");
  }
  if (onboarding.hasSubcontractors) {
    lines.push("- T5018 filing: Due last day of February");
  }

  return lines.length > 0 ? lines.join("\n") : "No specific deadlines identified from onboarding.";
}

function generateBankingProcedures(onboarding: typeof clientOnboarding.$inferSelect | null) {
  if (!onboarding) return "Add banking details.";
  const lines: string[] = [];
  lines.push(`- Bank accounts: ${onboarding.bankAccountCount || 1}`);
  if (onboarding.creditCardCount && onboarding.creditCardCount > 0) {
    lines.push(`- Credit cards: ${onboarding.creditCardCount}`);
  }
  lines.push("- All bank and credit card statements must be provided monthly");
  lines.push("- Reconcile all accounts before month-end");
  return lines.join("\n");
}

function generatePayrollProcedures(onboarding: typeof clientOnboarding.$inferSelect | null) {
  if (!onboarding || !onboarding.payrollFrequency || onboarding.payrollFrequency === "none") {
    return "No payroll requirements identified.";
  }
  const lines: string[] = [];
  lines.push(`- Payroll frequency: ${onboarding.payrollFrequency}`);
  lines.push(`- Payroll provider: ${onboarding.currentPayrollProvider || "TBD"}`);
  if (onboarding.hasEmployees) {
    lines.push("- Ensure timesheets are submitted before each pay run");
    lines.push("- Remit source deductions on schedule");
  }
  return lines.join("\n");
}

function generateHstProcedures(onboarding: typeof clientOnboarding.$inferSelect | null) {
  if (!onboarding || !onboarding.hstGstFrequency || onboarding.hstGstFrequency === "none") {
    return "No HST/GST registration identified.";
  }
  const lines: string[] = [];
  lines.push(`- HST/GST frequency: ${onboarding.hstGstFrequency}`);
  if (onboarding.hstGstNumber) {
    lines.push(`- HST/GST number: ${onboarding.hstGstNumber}`);
  }
  lines.push("- Ensure all sales invoices have HST/GST applied correctly");
  lines.push("- Provide ITC supporting documents (receipts)");
  return lines.join("\n");
}

function generateYearEndProcedures(onboarding: typeof clientOnboarding.$inferSelect | null) {
  const lines: string[] = [];
  if (onboarding?.fiscalYearEnd) {
    lines.push(`- Fiscal year-end: ${onboarding.fiscalYearEnd}`);
  }
  lines.push("- Ensure all transactions are entered and reconciled");
  lines.push("- Provide year-end bank and credit card statements");
  lines.push("- Review A/R and A/P for accuracy");
  lines.push("- Fixed asset schedule to be reviewed");
  if (onboarding?.hasEmployees) {
    lines.push("- Prepare and file T4s, T4As by February");
  }
  return lines.join("\n");
}

function generateWsibProcedures(onboarding: typeof clientOnboarding.$inferSelect | null) {
  if (!onboarding?.wsibRequired) return "WSIB not required.";
  const lines: string[] = [];
  if (onboarding.wsibAccountNumber) {
    lines.push(`- WSIB account number: ${onboarding.wsibAccountNumber}`);
  }
  lines.push("- Report insurable earnings monthly/quarterly as required");
  lines.push("- Annual reconciliation due March 31");
  return lines.join("\n");
}

interface PlaybookSection {
  id: string;
  title: string;
  icon: string;
  content: string;
}

export const playbookRouter = createRouter({
  // Get or create playbook for a client
  get: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      // Check for existing playbook
      const existing = await db.select().from(clientPlaybooks)
        .where(eq(clientPlaybooks.clientId, input.clientId))
        .limit(1);

      if (existing[0]) {
        return existing[0];
      }

      // Auto-generate from onboarding data
      const onboardingRows = await db.select().from(clientOnboarding)
        .where(eq(clientOnboarding.clientId, input.clientId))
        .limit(1);

      const sections = generateDefaultSections(onboardingRows[0] || null);

      const [playbook] = await db.insert(clientPlaybooks).values({
        clientId: input.clientId,
        userId: ctx.user.id,
        autoGenerated: true,
        sections: JSON.stringify(sections),
      }).returning();
      if (playbook) syncInsert("client_playbooks", playbook);

      return playbook;
    }),

  // Update playbook sections
  update: staffQuery
    .input(z.object({
      clientId: z.number(),
      sections: z.string(), // JSON string of sections
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Check if playbook exists
      const existing = await db.select().from(clientPlaybooks)
        .where(eq(clientPlaybooks.clientId, input.clientId))
        .limit(1);

      if (existing[0]) {
        await db.update(clientPlaybooks)
          .set({
            sections: input.sections,
            autoGenerated: false,
            updatedAt: new Date(),
          })
          .where(eq(clientPlaybooks.id, existing[0].id));
        // Sync updated
        const updated = await db.select().from(clientPlaybooks).where(eq(clientPlaybooks.id, existing[0].id)).limit(1);
        if (updated[0]) syncUpdate("client_playbooks", updated[0]);
      } else {
        const [newPb] = await db.insert(clientPlaybooks).values({
          clientId: input.clientId,
          userId: ctx.user.id,
          autoGenerated: false,
          sections: input.sections,
        }).returning();
        if (newPb) syncInsert("client_playbooks", newPb);
      }

      return { success: true };
    }),

  // Regenerate from onboarding (overwrites auto-generated content)
  regenerate: seniorQuery
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      const onboardingRows = await db.select().from(clientOnboarding)
        .where(eq(clientOnboarding.clientId, input.clientId))
        .limit(1);

      const sections = generateDefaultSections(onboardingRows[0] || null);

      const existing = await db.select().from(clientPlaybooks)
        .where(eq(clientPlaybooks.clientId, input.clientId))
        .limit(1);

      if (existing[0]) {
        await db.update(clientPlaybooks)
          .set({
            sections: JSON.stringify(sections),
            autoGenerated: true,
            updatedAt: new Date(),
          })
          .where(eq(clientPlaybooks.id, existing[0].id));
      } else {
        await db.insert(clientPlaybooks).values({
          clientId: input.clientId,
          userId: ctx.user.id,
          autoGenerated: true,
          sections: JSON.stringify(sections),
        });
      }

      return { success: true, sections };
    }),
});
