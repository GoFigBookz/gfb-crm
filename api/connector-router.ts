import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { connectedAccounts } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * PER-CLIENT CONNECTOR ROUTER
 *
 * Stores API keys / access tokens for per-client integrations:
 * - Wise (bank statements, transactions)
 * - Stripe (payments, invoices, payouts)
 * - Jobber (invoices, quotes, visits)
 * - TouchBistro (sales, labor, menu)
 * - PayPal (payments, transactions, statements)
 *
 * Each connection is tied to a specific client.
 * The CRM can pull statements monthly via cron.
 */

const PER_CLIENT_PROVIDERS = [
  "wise",
  "stripe",
  "jobber",
  "touchbistro",
  "paypal",
] as const;

export const connectorRouter = createRouter({
  // List all per-client connections (optionally filtered by provider or client)
  list: staffQuery
    .input(z.object({
      provider: z.enum(PER_CLIENT_PROVIDERS).optional(),
      clientId: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(connectedAccounts.userId, ctx.user.id)];

      if (input?.provider) {
        conditions.push(eq(connectedAccounts.provider, input.provider));
      }
      if (input?.clientId) {
        conditions.push(eq(connectedAccounts.clientId, input.clientId));
      }

      // Only return per-client providers
      const all = await db
        .select()
        .from(connectedAccounts)
        .where(and(...conditions))
        .orderBy(desc(connectedAccounts.createdAt));

      return all.filter((a) => PER_CLIENT_PROVIDERS.includes(a.provider as typeof PER_CLIENT_PROVIDERS[number]));
    }),

  // Get a single connection
  get: staffQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, input.id),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        )
        .limit(1);
      return rows[0] || null;
    }),

  // Create a per-client API key connection
  create: staffQuery
    .input(z.object({
      clientId: z.number(),
      provider: z.enum(PER_CLIENT_PROVIDERS),
      accountLabel: z.string().min(1),
      apiKey: z.string().min(1),          // Secret key / access token
      apiSecret: z.string().optional(),     // Optional second secret (e.g. PayPal secret)
      accountEmail: z.string().optional(),    // Public identifier (e.g. Stripe account ID)
      scopes: z.string().optional(),        // What this key can access
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId, provider, accountLabel, apiKey, apiSecret, accountEmail, scopes } = input;

      // Check if a connection already exists for this client + provider
      const existing = await db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.userId, ctx.user.id),
            eq(connectedAccounts.clientId, clientId),
            eq(connectedAccounts.provider, provider)
          )
        )
        .limit(1);

      if (existing[0]) {
        // Update existing
        await db
          .update(connectedAccounts)
          .set({
            accountLabel,
            accessToken: apiKey,
            refreshToken: apiSecret || null,
            accountEmail: accountEmail || null,
            scopes: scopes || null,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, existing[0].id));

        return { success: true, updated: true, id: existing[0].id };
      }

      // Create new
      const [account] = await db
        .insert(connectedAccounts)
        .values({
          userId: ctx.user.id,
          clientId,
          provider,
          providerAccountId: accountEmail || `${provider}_${clientId}`,
          accountLabel,
          accountEmail: accountEmail || null,
          accessToken: apiKey,
          refreshToken: apiSecret || null,
          scopes: scopes || null,
          isActive: true,
        })
        .returning();

      return { success: true, updated: false, id: account.id };
    }),

  // Update connection
  update: staffQuery
    .input(z.object({
      id: z.number(),
      accountLabel: z.string().min(1).optional(),
      apiKey: z.string().min(1).optional(),
      apiSecret: z.string().optional(),
      accountEmail: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;

      const updateData: Record<string, unknown> = {};
      if (data.accountLabel !== undefined) updateData.accountLabel = data.accountLabel;
      if (data.apiKey !== undefined) updateData.accessToken = data.apiKey;
      if (data.apiSecret !== undefined) updateData.refreshToken = data.apiSecret;
      if (data.accountEmail !== undefined) updateData.accountEmail = data.accountEmail;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      updateData.updatedAt = new Date();

      await db
        .update(connectedAccounts)
        .set(updateData)
        .where(
          and(
            eq(connectedAccounts.id, id),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  // Delete connection
  delete: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, input.id),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  // Pull statements (stub — will be implemented per-provider)
  pullStatements: staffQuery
    .input(z.object({
      connectionId: z.number(),
      startDate: z.string().optional(),    // ISO date
      endDate: z.string().optional(),      // ISO date
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, input.connectionId),
            eq(connectedAccounts.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!rows[0]) throw new Error("Connection not found");
      const conn = rows[0];

      // TODO: Implement actual provider-specific pulls
      // For now, return a success message with what would be pulled
      const providerActions: Record<string, string> = {
        wise: "bank statements + transactions + balances",
        stripe: "payments + invoices + payouts + customers",
        jobber: "invoices + quotes + visits + clients",
        touchbistro: "sales + menu items + labor reports",
        paypal: "payments + invoices + transactions",
      };

      // Update last synced
      await db
        .update(connectedAccounts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(connectedAccounts.id, input.connectionId));

      return {
        success: true,
        provider: conn.provider,
        clientId: conn.clientId,
        pulled: providerActions[conn.provider] || "data",
        startDate: input.startDate || "last_sync",
        endDate: input.endDate || "now",
        message: `Stub: ${conn.provider} data pull for client ${conn.clientId} would happen here.`,
      };
    }),

  // Get clients without a specific connector
  missingConnections: staffQuery
    .input(z.object({ provider: z.enum(PER_CLIENT_PROVIDERS) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      // Get all active clients
      const allClients = await db
        .select({ id: connectedAccounts.clientId })
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.userId, ctx.user.id),
            eq(connectedAccounts.provider, input.provider)
          )
        );

      const connectedClientIds = new Set(allClients.map((c) => c.id).filter(Boolean));

      return {
        provider: input.provider,
        connectedCount: connectedClientIds.size,
        message: `${connectedClientIds.size} clients connected to ${input.provider}`,
      };
    }),
});
