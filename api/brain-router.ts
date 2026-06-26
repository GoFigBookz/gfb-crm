/**
 * FIGGY AI BRAIN — tRPC router. The door every agent (and the UI) uses.
 * Phase 1 = RETRIEVAL + the missing-info queue. No posting, no QBO, no actions.
 * Per-client isolation is enforced in brain-store's SQL; personal is pinned to the
 * caller's userId.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { renderAnswer, type Scope } from "./brain-core";
import { brainAsk, addTruth, answerQuestion, listOpenQuestions, brainStats } from "./brain-store";

const scopeInput = z.object({
  scopeKind: z.enum(["client", "firm", "personal"]).default("firm"),
  clientId: z.number().nullable().optional(),
});
function toScope(i: { scopeKind: "client" | "firm" | "personal"; clientId?: number | null }): Scope {
  return { kind: i.scopeKind, clientId: i.clientId ?? undefined };
}

export const brainRouter = createRouter({
  /** Ask the brain. Answers from approved truth (with citations + confidence), or
   *  files a question for Markie and says so. Never invents. */
  ask: authedQuery
    .input(scopeInput.extend({ question: z.string().min(2).max(1000), category: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const scope = toScope(input);
      const res = await brainAsk(input.question, scope, { userId: ctx.user.id, askedBy: "liv", category: input.category });
      return {
        answered: res.answered,
        text: res.text ?? null,
        confidence: res.confidence,
        citations: res.citations,
        rendered: renderAnswer(res),
        missingInfo: res.missingInfo ?? null,
        filedQuestionId: res.filedQuestionId ?? null,
        matches: res.matches.map((m) => ({ id: m.record.id, label: m.record.label, layer: m.record.layer, status: m.record.status, score: Math.round(m.score * 100) })),
      };
    }),

  /** Add an approved fact to the brain (truth layer). */
  addTruth: authedQuery
    .input(scopeInput.extend({
      label: z.string().min(1).max(120),
      statement: z.string().min(2).max(4000),
      category: z.string().max(60).optional(),
      sourceLabels: z.array(z.string()).optional(),
      layer: z.enum(["truth", "source", "memory"]).default("truth"),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await addTruth({
        scope: toScope(input), label: input.label, statement: input.statement,
        category: input.category, sourceLabels: input.sourceLabels, layer: input.layer,
        userId: input.scopeKind === "personal" ? ctx.user.id : undefined,
      });
      return { ok: true, id };
    }),

  /** The missing-info queue — what the brain didn't know and asked Markie. */
  questions: authedQuery.query(async () => ({ questions: await listOpenQuestions() })),

  /** Answer a question → it becomes approved truth (the learning loop). */
  answer: authedQuery
    .input(z.object({ id: z.number(), answer: z.string().min(2).max(4000), label: z.string().max(120).optional(), category: z.string().max(60).optional() }))
    .mutation(async ({ input }) => answerQuestion(input.id, input.answer, { label: input.label, category: input.category })),

  stats: authedQuery.query(async () => brainStats()),
});
