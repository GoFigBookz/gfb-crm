/**
 * CLIENT TEAM THREAD ROUTER — per-client staff conversation (Markie ↔ bookkeeper).
 * list / post / resolve / remove. Staff-only; scoped by clientId.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientThreadNotes } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { summarizeThread } from "./client-thread-core";

export const clientThreadRouter = createRouter({
  list: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(clientThreadNotes)
        .where(eq(clientThreadNotes.clientId, input.clientId))
        .orderBy(desc(clientThreadNotes.createdAt));
      const notes = (rows as any[]).slice().reverse(); // chronological for display
      return { notes, summary: summarizeThread(notes) };
    }),

  post: authedQuery
    .input(z.object({ clientId: z.number(), body: z.string().min(1).max(4000), isQuestion: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.insert(clientThreadNotes).values({
        clientId: input.clientId, userId: ctx.user.id,
        authorName: ctx.user.name || ctx.user.email || "Staff",
        body: input.body, isQuestion: input.isQuestion, resolved: false, createdAt: new Date(),
      }).returning();
      return row;
    }),

  setResolved: authedQuery
    .input(z.object({ id: z.number(), resolved: z.boolean() }))
    .mutation(async ({ input }) => {
      await getDb().update(clientThreadNotes).set({ resolved: input.resolved }).where(eq(clientThreadNotes.id, input.id));
      return { success: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(clientThreadNotes).where(eq(clientThreadNotes.id, input.id));
      return { success: true };
    }),
});
