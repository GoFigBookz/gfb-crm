/**
 * LEARNING ROUTER — the shared learning loop store.
 * Markie (or an agent on his confirmation) teaches a lesson; it's saved per user
 * (and per client when set) and later injected into the agents' context so they
 * apply it. Per-client isolation preserved (clientId scoping).
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { agentLearnings } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const learningRouter = createRouter({
  list: authedQuery
    .input(z.object({ clientId: z.number().nullable().optional(), scope: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conds = [eq(agentLearnings.userId, ctx.user.id)];
      if (input?.clientId != null) conds.push(eq(agentLearnings.clientId, input.clientId));
      if (input?.scope) conds.push(eq(agentLearnings.scope, input.scope));
      return db.select().from(agentLearnings).where(and(...conds)).orderBy(desc(agentLearnings.createdAt));
    }),

  add: authedQuery
    .input(z.object({
      lesson: z.string().min(1).max(1000),
      scope: z.string().max(40).default("all"),
      clientId: z.number().nullable().optional(),
      tags: z.string().max(200).optional(),
      source: z.string().max(40).default("markie"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.insert(agentLearnings).values({
        userId: ctx.user.id,
        clientId: input.clientId ?? null,
        scope: input.scope || "all",
        lesson: input.lesson,
        tags: input.tags ?? null,
        source: input.source || "markie",
      } as any);
      return { ok: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(agentLearnings)
        .where(and(eq(agentLearnings.id, input.id), eq(agentLearnings.userId, ctx.user.id)));
      return { ok: true };
    }),
});
