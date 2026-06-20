import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientRequests, clientRequestItems, clients } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";

/**
 * Client Requests — Karbon-style magic-link document/info checklists.
 * Staff create a request (title + items) for a client; the client opens the
 * token URL, marks items provided + leaves notes; staff track outstanding.
 */
export const clientRequestRouter = createRouter({
  // All requests for a client (newest first), each with its items.
  listForClient: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const reqs = await db.select().from(clientRequests).where(eq(clientRequests.clientId, input.clientId)).orderBy(desc(clientRequests.createdAt));
      const out: any[] = [];
      for (const r of reqs as any[]) {
        const items = await db.select().from(clientRequestItems).where(eq(clientRequestItems.requestId, r.id)).orderBy(clientRequestItems.sortOrder);
        out.push({ ...r, items, provided: items.filter((i: any) => i.status === "provided").length, total: items.length });
      }
      return out;
    }),

  create: staffQuery
    .input(z.object({
      clientId: z.number(),
      title: z.string().min(1),
      message: z.string().optional(),
      dueDate: z.date().optional(),
      items: z.array(z.string().min(1)).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const token = `cr_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      const [req] = await db.insert(clientRequests).values({
        clientId: input.clientId, title: input.title, message: input.message,
        token, dueDate: input.dueDate, status: "open", createdBy: ctx.user.id,
      }).returning();
      let i = 0;
      for (const label of input.items) {
        await db.insert(clientRequestItems).values({ requestId: req.id, label, sortOrder: i++ });
      }
      return req;
    }),

  cancel: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(clientRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(clientRequests.id, input.id));
      return { success: true };
    }),

  // Record that a reminder was sent (the actual send is via copy-link/mailto).
  markReminded: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const r = (await db.select().from(clientRequests).where(eq(clientRequests.id, input.id)).limit(1))[0] as any;
      await db.update(clientRequests).set({ reminderCount: (r?.reminderCount || 0) + 1, lastReminderAt: new Date(), updatedAt: new Date() }).where(eq(clientRequests.id, input.id));
      return { success: true };
    }),

  // Staff can tick an item too (e.g. received by email).
  setItemStatus: staffQuery
    .input(z.object({ itemId: z.number(), status: z.enum(["pending", "provided"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(clientRequestItems).set({
        status: input.status, providedAt: input.status === "provided" ? new Date() : null,
      }).where(eq(clientRequestItems.id, input.itemId));
      const item = (await db.select().from(clientRequestItems).where(eq(clientRequestItems.id, input.itemId)).limit(1))[0] as any;
      if (item) await maybeComplete(item.requestId);
      return { success: true };
    }),
});

/** Mark the request completed once every item is provided. */
async function maybeComplete(requestId: number) {
  const db = getDb();
  const items = await db.select().from(clientRequestItems).where(eq(clientRequestItems.requestId, requestId));
  const allDone = items.length > 0 && (items as any[]).every((i) => i.status === "provided");
  const req = (await db.select().from(clientRequests).where(eq(clientRequests.id, requestId)).limit(1))[0] as any;
  if (!req) return;
  if (allDone && req.status === "open") {
    await db.update(clientRequests).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(clientRequests.id, requestId));
  } else if (!allDone && req.status === "completed") {
    await db.update(clientRequests).set({ status: "open", completedAt: null, updatedAt: new Date() }).where(eq(clientRequests.id, requestId));
  }
}

export { maybeComplete };
