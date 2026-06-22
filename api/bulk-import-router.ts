import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, tasks, taskRecurrences } from "../db/schema";
import { ensureComplianceForClient } from "./task-generator";
import { eq } from "drizzle-orm";

const BULK_IMPORT_TOKEN = process.env.BULK_IMPORT_TOKEN || "gfb-import-2026";

// Complete client data from Markie's master sheet
const CLIENTS_DATA = [
  {
    name: "Aim Construction Inc.",
    email: "aim@example.com",
    company: "Aim Construction Inc.",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 500,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Align By Design",
    email: "align@example.com",
    company: "Align By Design",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: false,
    yearEndMonth: "Dec" as const,
    monthlyFee: 300,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Align Plumbing Inc.",
    email: "alignplumbing@example.com",
    company: "Align Plumbing Inc.",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 600,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Auld Spot Pub",
    email: "auldspot@example.com",
    company: "The Auld Spot Pub",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "monthly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 700,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Clark Pools Collingwood",
    email: "clarkpools@example.com",
    company: "Clark Pools and Spas Collingwood Inc",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 450,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Clark Pools Owen Sound",
    email: "clarkowensound@example.com",
    company: "CP-Owen Sound",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 400,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Dark Horse Intelligence Inc.",
    email: "darkhorse@example.com",
    company: "Dark Horse Intelligence Inc.",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: true,
    payrollFrequency: "monthly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 550,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Dr. M. Kapala",
    email: "kapala@example.com",
    company: "Dr. M. Kapala",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: false,
    yearEndMonth: "Dec" as const,
    monthlyFee: 350,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "GoToMarket Agility",
    email: "gtma@example.com",
    company: "GoToMarket Agility",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: false,
    yearEndMonth: "Dec" as const,
    monthlyFee: 300,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Kaavio (Fleming)",
    email: "kaavio@example.com",
    company: "Kaavio",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: false,
    yearEndMonth: "Dec" as const,
    monthlyFee: 350,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "King Industries Inc.",
    email: "king@example.com",
    company: "King Industries Inc.",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 500,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Laing",
    email: "laing@example.com",
    company: "Laing",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: false,
    yearEndMonth: "Dec" as const,
    monthlyFee: 250,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Originality.AI Inc",
    email: "originality@example.com",
    company: "Originality.AI Inc",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 400,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Ovita Co's",
    email: "ovita@example.com",
    company: "Ovita Co's",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: false,
    yearEndMonth: "Dec" as const,
    monthlyFee: 300,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Selective Painting Inc",
    email: "selective@example.com",
    company: "Selective Painting Inc",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 350,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Sher-E-Punjab",
    email: "sher@example.com",
    company: "Sher-E-Punjab",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 400,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Studio Lella Inc",
    email: "studiolella@example.com",
    company: "Studio Lella Inc",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: false,
    hasPayroll: true,
    payrollFrequency: "self" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 300,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Unimax Construction Group",
    email: "unimax@example.com",
    company: "Unimax Construction Group LLC",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 650,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "Universal Construction Group",
    email: "universal@example.com",
    company: "Universal Construction Group",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 500,
    billingType: "monthly_fixed" as const,
  },
  {
    name: "West York Paving Ltd.",
    email: "westyork@example.com",
    company: "West York Paving Ltd.",
    status: "active" as const,
    assignedTo: "Markie" as const,
    hasHST: true,
    hstPeriod: "quarterly" as const,
    hasWSIB: true,
    wsibQuarter: "all" as const,
    hasPayroll: true,
    payrollFrequency: "bi-weekly" as const,
    yearEndMonth: "Dec" as const,
    monthlyFee: 800,
    billingType: "monthly_fixed" as const,
  },
];

export const bulkImportRouter = createRouter({
  importClients: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      if (input.token !== BULK_IMPORT_TOKEN) {
        throw new Error("Invalid token");
      }

      const db = getDb();
      const results = { imported: 0, skipped: 0, tasksCreated: 0, errors: [] as string[] };

      for (const clientData of CLIENTS_DATA) {
        try {
          // Check if client already exists
          const existing = await db.select().from(clients).where(eq(clients.name, clientData.name)).limit(1);
          if (existing.length > 0) {
            results.skipped++;
            continue;
          }

          const [client] = await db.insert(clients).values({
            ...clientData,
            userId: 1, // Markie's user ID
            createdAt: new Date(),
            updatedAt: new Date(),
          }).returning();

          results.imported++;

          // Auto-create recurring tasks (unified rule engine — one task system).
          if (client) {
            const taskResult = await ensureComplianceForClient(client.id, { userId: 1, assignedTo: clientData.assignedTo });
            results.tasksCreated += taskResult?.tasks || 0;
          }
        } catch (e: any) {
          results.errors.push(`${clientData.name}: ${e.message}`);
        }
      }

      return {
        success: true,
        ...results,
        totalClients: CLIENTS_DATA.length,
      };
    }),
});
