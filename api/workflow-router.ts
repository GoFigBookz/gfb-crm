import { z } from "zod";
import { createRouter, staffQuery, seniorQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { workflowLogs, clients } from "../db/schema";
import { eq, desc } from "drizzle-orm";

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
