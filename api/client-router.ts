import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, satisfactionScores } from "../db/schema";
import { eq, and, like, desc } from "drizzle-orm";
import { syncInsert, syncUpdate } from "./sync-hooks";

export const clientRouter = createRouter({
  // List clients for current user
  list: authedQuery
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(["active", "inactive", "prospect", "all"]).optional().default("all"),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;
      const search = input?.search;
      const status = input?.status ?? "all";

      const conditions = [eq(clients.userId, userId)];
      if (status !== "all") conditions.push(eq(clients.status, status));
      if (search) conditions.push(like(clients.name, `%${search}%`));

      const results = await db
        .select()
        .from(clients)
        .where(and(...conditions))
        .orderBy(desc(clients.updatedAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);

      return results;
    }),

  // Get single client
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)))
        .limit(1);

      return result[0] ?? null;
    }),

  // Create client
  create: authedQuery
    .input(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      phone: z.string().max(50).optional(),
      company: z.string().max(255).optional(),
      address: z.string().optional(),
      taxId: z.string().max(50).optional(),
      status: z.enum(["active", "inactive", "prospect"]).optional().default("active"),
      leadSource: z.string().max(100).optional(),
      assignedTo: z.string().max(255).optional(),
      notes: z.string().optional(),
      qboAccountType: z.enum(["ca_clients", "us_clients", "personal_business"]).optional().default("ca_clients"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [client] = await db.insert(clients).values({
        ...input,
        userId: ctx.user.id,
      }).returning();
      if (client) syncInsert("clients", client);
      return client;
    }),

  // Update client
  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(50).optional(),
      company: z.string().max(255).optional(),
      address: z.string().optional(),
      taxId: z.string().max(50).optional(),
      status: z.enum(["active", "inactive", "prospect"]).optional(),
      leadSource: z.string().max(100).optional(),
      assignedTo: z.string().max(255).optional(),
      notes: z.string().optional(),
      driveFolderUrl: z.string().optional(),
      quickLinks: z.string().optional(),
      qboAccountType: z.enum(["ca_clients", "us_clients", "personal_business"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(clients)
        .set(updates)
        .where(and(eq(clients.id, id), eq(clients.userId, ctx.user.id)));

      // Fetch updated record and sync
      const updated = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
      if (updated[0]) syncUpdate("clients", updated[0]);

      return { success: true };
    }),

  // Update client links only
  updateLinks: authedQuery
    .input(z.object({
      id: z.number(),
      driveFolderUrl: z.string().optional(),
      quickLinks: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(clients)
        .set(updates)
        .where(and(eq(clients.id, id), eq(clients.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete client
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(clients)
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.user.id)));

      return { success: true };
    }),

  // Satisfaction scores
  getSatisfactionScores: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(satisfactionScores)
        .where(eq(satisfactionScores.clientId, input.clientId))
        .orderBy(desc(satisfactionScores.createdAt));
    }),

  addSatisfactionScore: authedQuery
    .input(z.object({
      clientId: z.number(),
      score: z.number().min(1).max(10),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [result] = await db.insert(satisfactionScores).values({
        clientId: input.clientId,
        userId: ctx.user.id,
        score: input.score,
        notes: input.notes,
        createdAt: new Date(),
      }).returning();
      return result;
    }),

  // Get stats
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    const allClients = await db
      .select()
      .from(clients)
      .where(eq(clients.userId, userId));

    return {
      total: allClients.length,
      active: allClients.filter(c => c.status === "active").length,
      inactive: allClients.filter(c => c.status === "inactive").length,
      prospect: allClients.filter(c => c.status === "prospect").length,
    };
  }),
});
