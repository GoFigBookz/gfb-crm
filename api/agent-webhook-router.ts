/**
 * AGENT WEBHOOK ROUTER
 * External AI agents (Figgy Jr, Figs, Blue, etc.) POST findings here.
 * Auth: X-Agent-Token header
 */
import { z } from "zod";
import { createRouter, publicQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { triageFindings, notifications, clients } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";

function validateAgentToken(token: string): boolean {
  const validToken = process.env.AGENT_WEBHOOK_TOKEN || "figgy-webhook-2026";
  return token === validToken;
}

export const agentWebhookRouter = createRouter({
  // PUBLIC: AI agents POST findings here
  submitFinding: publicQuery
    .input(z.object({
      agentName: z.string().min(1),
      agentVersion: z.string().optional(),
      clientId: z.number().optional(),
      clientName: z.string().optional(),
      findingType: z.enum(["reconciliation", "missing_docs", "deadline", "anomaly", "review", "compliance"]),
      severity: z.enum(["critical", "warning", "info"]),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      suggestedAction: z.string().max(500).optional(),
      sourceData: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const token = (ctx as any).req?.headers?.["x-agent-token"] || "";
      if (!validateAgentToken(token)) {
        throw new Error("Invalid agent token");
      }

      const db = getDb();

      // Resolve client if only name provided
      let resolvedClientId = input.clientId;
      if (!resolvedClientId && input.clientName) {
        const rows = await db.select().from(clients).where(eq(clients.name, input.clientName)).limit(1);
        if (rows[0]) resolvedClientId = rows[0].id;
      }

      const [finding] = await db.insert(triageFindings).values({
        agentName: input.agentName,
        agentVersion: input.agentVersion,
        clientId: resolvedClientId,
        findingType: input.findingType,
        severity: input.severity,
        title: input.title,
        description: input.description,
        suggestedAction: input.suggestedAction,
        sourceData: input.sourceData,
        confidence: input.confidence,
        status: "new",
      }).returning();

      await db.insert(notifications).values({
        userId: 0,
        type: "triage",
        title: `${input.agentName}: ${input.title}`,
        message: input.description || input.title,
        severity: input.severity,
        linkTo: `/triage?finding=${finding.id}`,
      });

      return { success: true, findingId: finding.id, clientId: resolvedClientId };
    }),

  // Staff: List all findings
  listFindings: staffQuery
    .input(z.object({
      status: z.string().optional(),
      severity: z.string().optional(),
      clientId: z.number().optional(),
      agentName: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [];
      if (input?.status) conditions.push(eq(triageFindings.status, input.status as "new" | "approved" | "dismissed"));
      if (input?.severity) conditions.push(eq(triageFindings.severity, input.severity as "critical" | "warning" | "info"));
      if (input?.clientId) conditions.push(eq(triageFindings.clientId, input.clientId));
      if (input?.agentName) conditions.push(eq(triageFindings.agentName, input.agentName));

      if (conditions.length > 0) {
        return db.select().from(triageFindings).where(and(...conditions)).orderBy(desc(triageFindings.createdAt));
      }
      return db.select().from(triageFindings).orderBy(desc(triageFindings.createdAt));
    }),

  // Staff: Review (approve/dismiss) a finding
  reviewFinding: staffQuery
    .input(z.object({
      id: z.number(),
      action: z.enum(["approve", "dismiss"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(triageFindings)
        .set({
          status: input.action === "approve" ? "approved" : "dismissed",
          reviewedNotes: input.notes,
          reviewedAt: new Date(),
        })
        .where(eq(triageFindings.id, input.id));
      return { success: true };
    }),

  // Agent: Get status of submitted findings
  getStatus: publicQuery
    .input(z.object({ findingIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      const db = getDb();
      const results = [];
      for (const id of input.findingIds) {
        const rows = await db.select().from(triageFindings).where(eq(triageFindings.id, id)).limit(1);
        if (rows[0]) results.push({ id: rows[0].id, status: rows[0].status, reviewedAt: rows[0].reviewedAt });
      }
      return results;
    }),
});

