import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, clientOnboarding, workflowLogs, payRuns, payRunLines, employees, clientRequests, clientRequestItems } from "../db/schema";
import { eq } from "drizzle-orm";
import { maybeComplete } from "./client-request-router";

export const publicRouter = createRouter({
  // Public: create a lead from the marketing website
  createLead: publicQuery
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      company: z.string().optional(),
      businessStructure: z.string().optional(),
      industry: z.string().optional(),
      businessNumber: z.string().optional(),
      hstGstNumber: z.string().optional(),
      payrollAccountNumber: z.string().optional(),
      wsibAccountNumber: z.string().optional(),
      primaryContactName: z.string().optional(),
      primaryContactEmail: z.string().optional(),
      primaryContactPhone: z.string().optional(),
      secondaryContactName: z.string().optional(),
      secondaryContactEmail: z.string().optional(),
      bankName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankRoutingNumber: z.string().optional(),
      currentAccountingSoftware: z.string().optional(),
      currentPayrollProvider: z.string().optional(),
      servicesNeeded: z.string().optional(),
      painPoints: z.string().optional(),
      expectations: z.string().optional(),
      fiscalYearEnd: z.string().optional(),
      lastFiledYear: z.string().optional(),
      outstandingFilings: z.string().optional(),
      planSelected: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // 1. Create the client as a new lead
      const clientResult = await db.insert(clients).values({
        userId: 1, // System user / admin
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        company: input.company || null,
        status: "active",
        workflowStatus: "new_lead",
        leadSource: "website",
        painPoints: input.painPoints || null,
        expectations: input.expectations || null,
        serviceTier: (input.planSelected as any) || "standard",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const clientId = Number(clientResult.lastInsertRowid);

      // 2. Create the onboarding record
      const token = crypto.randomUUID();
      await db.insert(clientOnboarding).values({
        clientId,
        token,
        businessLegalName: input.company || null,
        businessOperatingName: input.company || null,
        businessStructure: input.businessStructure || null,
        industry: input.industry || null,
        businessNumber: input.businessNumber || null,
        hstGstNumber: input.hstGstNumber || null,
        payrollAccountNumber: input.payrollAccountNumber || null,
        wsibAccountNumber: input.wsibAccountNumber || null,
        primaryContactName: input.primaryContactName || input.name,
        primaryContactEmail: input.primaryContactEmail || input.email,
        primaryContactPhone: input.primaryContactPhone || input.phone || null,
        secondaryContactName: input.secondaryContactName || null,
        secondaryContactEmail: input.secondaryContactEmail || null,
        bankName: input.bankName || null,
        bankAccountNumber: input.bankAccountNumber || null,
        bankRoutingNumber: input.bankRoutingNumber || null,
        currentAccountingSoftware: input.currentAccountingSoftware || null,
        currentPayrollProvider: input.currentPayrollProvider || null,
        servicesNeeded: input.servicesNeeded || null,
        painPoints: input.painPoints || null,
        expectations: input.expectations || null,
        fiscalYearEnd: input.fiscalYearEnd || null,
        lastFiledYear: input.lastFiledYear || null,
        outstandingFilings: input.outstandingFilings || null,
        status: "submitted",
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Log the workflow transition
      await db.insert(workflowLogs).values({
        clientId,
        fromStatus: null,
        toStatus: "new_lead",
        action: "website_lead_created",
        notes: `Plan selected: ${input.planSelected || "none"}. Source: website form.`,
        createdAt: new Date(),
      });

      return { success: true, clientId, token };
    }),

  // ===== PAYROLL HOURS APPROVAL (public, token-gated — for clients) =====
  payrollApprovalGet: publicQuery
    .input(z.object({ token: z.string().min(6) }))
    .query(async ({ input }) => {
      const db = getDb();
      const run = (await db.select().from(payRuns).where(eq(payRuns.approvalToken, input.token)).limit(1))[0] as any;
      if (!run) return null;
      const client = (await db.select().from(clients).where(eq(clients.id, run.clientId)).limit(1))[0] as any;
      const lines = await db.select().from(payRunLines).where(eq(payRunLines.payRunId, run.id));
      const emps = await db.select().from(employees).where(eq(employees.clientId, run.clientId));
      const byId = new Map((emps as any[]).map((e) => [e.id, e]));
      const rows = (lines as any[]).map((l) => {
        const e = byId.get(l.employeeId);
        return {
          name: e ? `${e.firstName} ${e.lastName}` : `Employee #${l.employeeId}`,
          regularHours: l.regularHours ?? 0, overtimeHours: l.overtimeHours ?? 0,
          statHolidayPay: l.statHolidayPay ?? 0, shareBonus: l.shareBonus ?? 0, grossPay: l.grossPay ?? 0,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      return {
        clientName: client?.name ?? "Your company",
        payPeriodStart: run.payPeriodStart, payPeriodEnd: run.payPeriodEnd, payDate: run.payDate,
        status: run.approvalStatus ?? "sent", approvedByName: run.approvedByName ?? null,
        approvedAt: run.approvedAt ?? null, approvalNote: run.approvalNote ?? null,
        lines: rows,
      };
    }),

  payrollApprovalSubmit: publicQuery
    .input(z.object({
      token: z.string().min(6),
      approverName: z.string().min(1),
      decision: z.enum(["approved", "changes_requested"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const run = (await db.select().from(payRuns).where(eq(payRuns.approvalToken, input.token)).limit(1))[0] as any;
      if (!run) throw new Error("This approval link is not valid.");
      await db.update(payRuns).set({
        approvalStatus: input.decision,
        approvedByName: input.approverName,
        approvedAt: new Date(),
        approvalNote: input.note || null,
        // When the client approves the hours, advance the run to "approved".
        ...(input.decision === "approved" ? { status: "approved" } : {}),
        updatedAt: new Date(),
      }).where(eq(payRuns.id, run.id));
      return { success: true };
    }),

  // ===== CLIENT REQUESTS (public, token-gated — the client's to-do list) =====
  clientRequestGet: publicQuery
    .input(z.object({ token: z.string().min(6) }))
    .query(async ({ input }) => {
      const db = getDb();
      const req = (await db.select().from(clientRequests).where(eq(clientRequests.token, input.token)).limit(1))[0] as any;
      if (!req) return null;
      const client = (await db.select().from(clients).where(eq(clients.id, req.clientId)).limit(1))[0] as any;
      const items = await db.select().from(clientRequestItems).where(eq(clientRequestItems.requestId, req.id)).orderBy(clientRequestItems.sortOrder);
      return {
        title: req.title, message: req.message, status: req.status, dueDate: req.dueDate,
        clientName: client?.name ?? "Your company",
        items: (items as any[]).map((i) => ({ id: i.id, label: i.label, status: i.status, response: i.response })),
      };
    }),

  clientRequestSubmitItem: publicQuery
    .input(z.object({
      token: z.string().min(6),
      itemId: z.number(),
      status: z.enum(["pending", "provided"]),
      response: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const req = (await db.select().from(clientRequests).where(eq(clientRequests.token, input.token)).limit(1))[0] as any;
      if (!req) throw new Error("This request link is not valid.");
      const item = (await db.select().from(clientRequestItems).where(eq(clientRequestItems.id, input.itemId)).limit(1))[0] as any;
      if (!item || item.requestId !== req.id) throw new Error("Item not found.");
      await db.update(clientRequestItems).set({
        status: input.status,
        response: input.response ?? item.response,
        providedAt: input.status === "provided" ? new Date() : null,
      }).where(eq(clientRequestItems.id, input.itemId));
      await maybeComplete(req.id);
      return { success: true };
    }),
});
