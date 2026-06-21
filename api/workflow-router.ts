import { z } from "zod";
import { createRouter, staffQuery, seniorQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { workflowLogs, clients } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { activateClientAsync } from "./client-activation";
import { syncLeadToMaster } from "./master-sheet-sync";

export const workflowRouter = createRouter({
  getLogs: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(workflowLogs).where(eq(workflowLogs.clientId, input.clientId)).orderBy(desc(workflowLogs.createdAt));
    }),

  transition: staffQuery
    .input(z.object({
      clientId: z.number(),
      toStatus: z.enum(["new_lead", "discovery_call", "onboarding_sent", "onboarding_complete", "active", "inactive", "churned"]),
      action: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Get current status
      const client = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client[0]) throw new Error("Client not found");

      const fromStatus = client[0].workflowStatus;

      // Log the transition
      await db.insert(workflowLogs).values({
        clientId: input.clientId,
        fromStatus,
        toStatus: input.toStatus,
        action: input.action,
        notes: input.notes || null,
        performedBy: ctx.user.id,
        createdAt: new Date(),
      });

      // Update client status
      await db.update(clients)
        .set({
          workflowStatus: input.toStatus,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, input.clientId));

      // Sheet sync follows the lead's lifecycle:
      //  - reaching "active" = signed/onboarded → enrich from the government
      //    registry + promote into the Client Master tab (Markie's trigger).
      //  - any earlier stage → keep the Leads tab row current.
      const updated = (await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1))[0];
      if (input.toStatus === "active") {
        activateClientAsync(input.clientId);
      } else if (updated) {
        syncLeadToMaster(updated as any);
      }

      return { success: true };
    }),

  updateNextAction: staffQuery
    .input(z.object({
      clientId: z.number(),
      nextAction: z.string(),
      nextActionDate: z.date().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(clients)
        .set({
          nextAction: input.nextAction,
          nextActionDate: input.nextActionDate || null,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, input.clientId));
      return { success: true };
    }),

  // Staff: manually add a lead (e.g. phone/referral inquiry) → Leads tab.
  createLead: staffQuery
    .input(z.object({
      name: z.string().min(1),
      company: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      source: z.string().optional(),
      message: z.string().optional(),
      estimatedMonthlyValue: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const res = await db.insert(clients).values({
        userId: ctx.user.id,
        name: input.name,
        company: input.company || null,
        email: input.email || "",
        phone: input.phone || null,
        website: input.website || null,
        status: "lead",
        workflowStatus: "new_lead",
        leadSource: input.source || "manual",
        estimatedMonthlyValue: input.estimatedMonthlyValue ?? null,
        painPoints: input.message || null,
        assignedTo: ctx.user.name || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning({ id: clients.id });
      const clientId = res[0]?.id;
      if (clientId) {
        await db.insert(workflowLogs).values({
          clientId, fromStatus: null, toStatus: "new_lead",
          action: "lead_created_manual", notes: `Source: ${input.source || "manual"}`,
          performedBy: ctx.user.id, createdAt: new Date(),
        });
        const lead = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0];
        if (lead) syncLeadToMaster(lead as any);
      }
      return { success: true, clientId };
    }),

  getPipeline: staffQuery.query(async () => {
    const db = getDb();
    const allClients = await db.select().from(clients);

    const pipeline = {
      new_lead: allClients.filter(c => c.workflowStatus === "new_lead"),
      discovery_call: allClients.filter(c => c.workflowStatus === "discovery_call"),
      onboarding_sent: allClients.filter(c => c.workflowStatus === "onboarding_sent"),
      onboarding_complete: allClients.filter(c => c.workflowStatus === "onboarding_complete"),
      active: allClients.filter(c => c.workflowStatus === "active"),
      inactive: allClients.filter(c => c.workflowStatus === "inactive"),
      churned: allClients.filter(c => c.workflowStatus === "churned"),
    };

    return pipeline;
  }),
});
