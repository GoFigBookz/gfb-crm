/**
 * AGENT WEBHOOK ROUTER
 * External AI agents (Figs, Blue, etc.) POST findings here.
 * Auth: X-Agent-Token header
 */
import { z } from "zod";
import { createRouter, publicQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { triageFindings, notifications, clients, agentLearnings } from "../db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { learnFromApprovals } from "./vendor-learning";

/** Map a finding's free-text agentName to a roster scope key (else "all"). */
function scopeFromAgentName(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase();
  for (const k of ["fig", "sage", "wren", "liv", "jinx", "tess", "jade", "skye"]) if (n.includes(k)) return k;
  if (n.includes("figgy") || n.includes("bookkeep")) return "fig";
  return "all";
}

/** When Markie leaves a note on a review, capture it as a durable lesson so the
 *  agents apply it next time (the general learning loop closing on corrections). */
async function captureReviewLearning(db: ReturnType<typeof getDb>, ids: number[], action: string, notes?: string) {
  const lesson = (notes ?? "").trim();
  if (!lesson) return;
  try {
    const rows = (await db.select().from(triageFindings).where(inArray(triageFindings.id, ids))) as any[];
    for (const f of rows) {
      await db.insert(agentLearnings).values({
        userId: 1,
        clientId: f.clientId ?? null,
        scope: scopeFromAgentName(f.agentName),
        lesson: `${action === "dismiss" ? "When this comes up, " : ""}${lesson}${f.title ? ` (re: ${f.title})` : ""}`,
        source: "correction",
      } as any);
    }
  } catch { /* best-effort — never block the review */ }
}

/** Stamp an explicit human account override into a finding's sourceData so the
 *  learning loop (and the card) reflect Markie's correction, not Figgy's guess. */
async function applyAccountOverride(
  db: ReturnType<typeof getDb>, ids: number[],
  o: { confirmedAccountId?: string; confirmedAccountName?: string; confirmedTaxCode?: string },
): Promise<void> {
  if (!o.confirmedAccountId) return;
  for (const id of ids) {
    try {
      const row = (await db.select().from(triageFindings).where(eq(triageFindings.id, id)).limit(1))[0];
      if (!row) continue;
      let meta: any = {};
      try { meta = JSON.parse(row.sourceData || "{}"); } catch { meta = {}; }
      if (!meta || typeof meta !== "object") meta = {};
      meta.confirmedAccountId = o.confirmedAccountId;
      if (o.confirmedAccountName) meta.confirmedAccountName = o.confirmedAccountName;
      if (o.confirmedTaxCode) meta.confirmedTaxCode = o.confirmedTaxCode;
      await db.update(triageFindings).set({ sourceData: JSON.stringify(meta) }).where(eq(triageFindings.id, id));
    } catch { /* best-effort */ }
  }
}

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
      const _h = (ctx as any).req?.headers; const token = (_h && typeof _h.get === "function" ? _h.get("x-agent-token") : _h?.["x-agent-token"]) || "";
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

      // Dedup: if a sourceData key (e.g. Review Queue Row ID) was provided and already exists, skip.
      if (input.sourceData) {
        const dup = await db.select().from(triageFindings).where(eq(triageFindings.sourceData, input.sourceData)).limit(1);
        if (dup[0]) return { success: true, findingId: dup[0].id, deduped: true, clientId: resolvedClientId };
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
      // Optional: Markie corrects the account before approving (else Figgy's
      // own suggestion on the card is what gets confirmed/learned).
      confirmedAccountId: z.string().optional(),
      confirmedAccountName: z.string().optional(),
      confirmedTaxCode: z.string().optional(),
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
      // Approve teaches the brain: confirm a vendorMemory rule from the card.
      if (input.action === "approve") {
        try {
          await applyAccountOverride(db, [input.id], input);
          await learnFromApprovals([input.id]);
        } catch { /* learning is best-effort — never block the approve */ }
      }
      // Any review note (approve OR dismiss) teaches the general learning loop.
      await captureReviewLearning(db, [input.id], input.action, input.notes);
      return { success: true };
    }),

  // Staff: Batch review — approve/dismiss many findings in one go
  reviewFindings: staffQuery
    .input(z.object({
      ids: z.array(z.number()).min(1).max(500),
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
        .where(inArray(triageFindings.id, input.ids));
      // Approve teaches the brain: confirm a vendorMemory rule per approved card.
      let learned = 0;
      if (input.action === "approve") {
        try { learned = (await learnFromApprovals(input.ids)).learned; }
        catch { /* best-effort — never block the batch approve */ }
      }
      await captureReviewLearning(db, input.ids, input.action, input.notes);
      return { success: true, updated: input.ids.length, learned };
    }),

  // Staff: Batch delete — permanently remove many findings
  deleteFindings: staffQuery
    .input(z.object({ ids: z.array(z.number()).min(1).max(500) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(triageFindings).where(inArray(triageFindings.id, input.ids));
      return { success: true, deleted: input.ids.length };
    }),

  // Staff: Permanently delete a finding (Dismiss keeps it for the record; this removes it)
  deleteFinding: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(triageFindings).where(eq(triageFindings.id, input.id));
      return { success: true };
    }),

  // Staff: Edit a finding's fields (review/correct what Figgy flagged)
  updateFinding: staffQuery
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      suggestedAction: z.string().optional(),
      severity: z.enum(["critical", "warning", "info"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const patch: Record<string, any> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.suggestedAction !== undefined) patch.suggestedAction = input.suggestedAction;
      if (input.severity !== undefined) patch.severity = input.severity;
      if (input.notes !== undefined) patch.reviewedNotes = input.notes;
      if (Object.keys(patch).length > 0) {
        await db.update(triageFindings).set(patch).where(eq(triageFindings.id, input.id));
      }
      return { success: true };
    }),

  // Staff: Ask the client for missing info (moves finding to awaiting_client)
  askClient: staffQuery
    .input(z.object({ id: z.number(), question: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(triageFindings)
        .set({
          status: "awaiting_client",
          reviewedNotes: input.question ? ("Asked client: " + input.question) : "Asked client for missing info",
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

