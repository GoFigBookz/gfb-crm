/**
 * CHAT ROUTER — persistent agent-chat history.
 * Conversations survive refresh/close, and can be FILED to a client's record
 * (only when Markie chooses). Everything is scoped to ctx.user.id.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { chatMessages } from "../db/schema";
import { eq, and, desc, asc } from "drizzle-orm";

export const chatRouter = createRouter({
  /** All messages in one conversation (to restore the thread on load). */
  messages: authedQuery
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db.select().from(chatMessages)
        .where(and(eq(chatMessages.userId, ctx.user.id), eq(chatMessages.conversationId, input.conversationId)))
        .orderBy(asc(chatMessages.id));
    }),

  /** Recent conversations (one row each: last message preview + agent + time). */
  conversations: authedQuery
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = (await db.select().from(chatMessages)
        .where(eq(chatMessages.userId, ctx.user.id))
        .orderBy(desc(chatMessages.id))) as any[];
      const seen = new Map<string, any>();
      for (const r of rows) {
        if (!seen.has(r.conversationId)) {
          seen.set(r.conversationId, {
            conversationId: r.conversationId,
            agent: r.agent,
            clientId: r.clientId,
            preview: String(r.content || "").slice(0, 80),
            at: r.createdAt,
          });
        }
      }
      return Array.from(seen.values()).slice(0, input?.limit ?? 20);
    }),

  /** File a whole conversation onto a client's record. */
  fileToClient: authedQuery
    .input(z.object({ conversationId: z.string(), clientId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(chatMessages)
        .set({ clientId: input.clientId })
        .where(and(eq(chatMessages.userId, ctx.user.id), eq(chatMessages.conversationId, input.conversationId)));
      return { ok: true };
    }),

  /** Conversations filed to a given client (shown on the client's card). */
  forClient: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = (await db.select().from(chatMessages)
        .where(and(eq(chatMessages.userId, ctx.user.id), eq(chatMessages.clientId, input.clientId)))
        .orderBy(asc(chatMessages.id))) as any[];
      // Group into conversations.
      const convs = new Map<string, any>();
      for (const r of rows) {
        if (!convs.has(r.conversationId)) convs.set(r.conversationId, { conversationId: r.conversationId, agent: r.agent, at: r.createdAt, messages: [] });
        convs.get(r.conversationId).messages.push({ role: r.role, content: r.content, at: r.createdAt });
      }
      return Array.from(convs.values());
    }),

  /** Delete a conversation (for the owning user). */
  remove: authedQuery
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(chatMessages)
        .where(and(eq(chatMessages.userId, ctx.user.id), eq(chatMessages.conversationId, input.conversationId)));
      return { ok: true };
    }),
});
