import { z } from "zod";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { aiAgentConfigs, aiAgentRuns } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const aiAgentRouter = createRouter({
  // List agent configs
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(aiAgentConfigs)
      .where(eq(aiAgentConfigs.userId, ctx.user.id))
      .orderBy(desc(aiAgentConfigs.createdAt));
  }),

  // Get single agent config
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(aiAgentConfigs)
        .where(and(eq(aiAgentConfigs.id, input.id), eq(aiAgentConfigs.userId, ctx.user.id)))
        .limit(1);

      return result[0] ?? null;
    }),

  // Create agent config
  create: authedQuery
    .input(z.object({
      name: z.string().min(1).max(255),
      agentType: z.enum(["bookkeeper", "senior_bookkeeper", "controller", "auditor", "cfo", "tax", "qa", "social_media_manager", "executive_assistant", "sales_assistant", "customer_support", "custom"]),
      description: z.string().optional(),
      capabilities: z.object({
        readEmails: z.boolean().default(false),
        sendEmails: z.boolean().default(false),
        manageCalendar: z.boolean().default(false),
        createTasks: z.boolean().default(false),
        manageInvoices: z.boolean().default(false),
        fileAccess: z.boolean().default(false),
        clientCommunication: z.boolean().default(false),
      }).optional(),
      webhookUrl: z.string().url().optional(),
      webhookSecret: z.string().optional(),
      model: z.string().max(100).optional(),
      temperature: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      systemPrompt: z.string().optional(),
      autoRun: z.boolean().optional(),
      runSchedule: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [agent] = await db.insert(aiAgentConfigs).values({
        ...input,
        userId: ctx.user.id,
        isActive: true,
      });
      return agent;
    }),

  // Update agent config
  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      capabilities: z.object({
        readEmails: z.boolean().default(false),
        sendEmails: z.boolean().default(false),
        manageCalendar: z.boolean().default(false),
        createTasks: z.boolean().default(false),
        manageInvoices: z.boolean().default(false),
        fileAccess: z.boolean().default(false),
        clientCommunication: z.boolean().default(false),
      }).optional(),
      webhookUrl: z.string().url().optional(),
      model: z.string().max(100).optional(),
      systemPrompt: z.string().optional(),
      autoRun: z.boolean().optional(),
      runSchedule: z.string().max(100).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(aiAgentConfigs)
        .set(updates)
        .where(and(eq(aiAgentConfigs.id, id), eq(aiAgentConfigs.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete agent config
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(aiAgentConfigs)
        .where(and(eq(aiAgentConfigs.id, input.id), eq(aiAgentConfigs.userId, ctx.user.id)));

      return { success: true };
    }),

  // ===== AGENT RUNS =====
  listRuns: authedQuery
    .input(z.object({
      agentId: z.number().optional(),
      limit: z.number().min(1).max(100).optional().default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const conditions = [eq(aiAgentRuns.userId, userId)];
      if (input?.agentId) conditions.push(eq(aiAgentRuns.agentId, input.agentId));

      return db
        .select()
        .from(aiAgentRuns)
        .where(and(...conditions))
        .orderBy(desc(aiAgentRuns.startedAt))
        .limit(input?.limit ?? 50);
    }),

  // Create a run (triggered by webhook, schedule, or manual)
  createRun: authedQuery
    .input(z.object({
      agentId: z.number(),
      triggerType: z.enum(["manual", "scheduled", "webhook", "api"]),
      input: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [run] = await db.insert(aiAgentRuns).values({
        ...input,
        userId: ctx.user.id,
        status: "running",
      });
      return run;
    }),

  // Update run (when agent completes)
  updateRun: authedQuery
    .input(z.object({
      id: z.number(),
      status: z.enum(["running", "completed", "failed", "cancelled"]).optional(),
      output: z.string().optional(),
      actionsTaken: z.array(z.object({
        action: z.string(),
        target: z.string(),
        result: z.string(),
        timestamp: z.date(),
      })).optional(),
      errorMessage: z.string().optional(),
      durationMs: z.number().optional(),
      completedAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(aiAgentRuns)
        .set(updates)
        .where(and(eq(aiAgentRuns.id, id), eq(aiAgentRuns.userId, ctx.user.id)));

      return { success: true };
    }),

  // Webhook endpoint for external AI agents to report results
  webhook: publicQuery
    .input(z.object({
      agentId: z.number(),
      secret: z.string(),
      status: z.enum(["running", "completed", "failed", "cancelled"]),
      output: z.string().optional(),
      actionsTaken: z.array(z.object({
        action: z.string(),
        target: z.string(),
        result: z.string(),
        timestamp: z.string().datetime(),
      })).optional(),
      errorMessage: z.string().optional(),
      durationMs: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Verify webhook secret
      const agent = await db
        .select()
        .from(aiAgentConfigs)
        .where(eq(aiAgentConfigs.id, input.agentId))
        .limit(1);

      if (!agent[0] || agent[0].webhookSecret !== input.secret) {
        throw new Error("Invalid webhook secret");
      }

      // Update the run
      await db
        .update(aiAgentRuns)
        .set({
          status: input.status,
          output: input.output,
          actionsTaken: input.actionsTaken?.map(a => ({
            ...a,
            timestamp: new Date(a.timestamp),
          })),
          errorMessage: input.errorMessage,
          durationMs: input.durationMs,
          completedAt: input.status === "completed" || input.status === "failed" ? new Date() : undefined,
        })
        .where(eq(aiAgentRuns.agentId, input.agentId));

      return { success: true };
    }),
});
