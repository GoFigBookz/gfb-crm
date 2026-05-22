import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { connectedAccounts } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const integrationRouter = createRouter({
  // List connected accounts
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select({
        id: connectedAccounts.id,
        userId: connectedAccounts.userId,
        clientId: connectedAccounts.clientId,
        provider: connectedAccounts.provider,
        accountLabel: connectedAccounts.accountLabel,
        accountEmail: connectedAccounts.accountEmail,
        isActive: connectedAccounts.isActive,
        syncEnabled: connectedAccounts.syncEnabled,
        lastSyncedAt: connectedAccounts.lastSyncedAt,
        createdAt: connectedAccounts.createdAt,
        updatedAt: connectedAccounts.updatedAt,
      })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, ctx.user.id))
      .orderBy(desc(connectedAccounts.createdAt));
  }),

  // Get accounts by provider
  byProvider: authedQuery
    .input(z.object({ provider: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.userId, ctx.user.id),
            eq(connectedAccounts.provider, input.provider)
          )
        )
        .orderBy(desc(connectedAccounts.createdAt));
    }),

  // Create connected account (after OAuth or API key)
  create: authedQuery
    .input(z.object({
      provider: z.enum([
        "google", "microsoft", "dropbox", "icloud",
        "quickbooks", "wise", "stripe", "jobber", "touchbistro", "paypal",
      ]),
      providerAccountId: z.string().optional(),
      clientId: z.number().optional(),
      accountLabel: z.string().min(1).max(100),
      accountEmail: z.string().email().optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      expiresAt: z.date().optional(),
      scopes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [account] = await db.insert(connectedAccounts).values({
        ...input,
        userId: ctx.user.id,
        isActive: true,
      }).returning();
      return account;
    }),

  // Update account sync settings
  updateSync: authedQuery
    .input(z.object({
      id: z.number(),
      syncEnabled: z.object({
        email: z.boolean(),
        calendar: z.boolean(),
        files: z.boolean(),
        tasks: z.boolean(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(connectedAccounts)
        .set({ syncEnabled: input.syncEnabled })
        .where(and(eq(connectedAccounts.id, input.id), eq(connectedAccounts.userId, ctx.user.id)));

      return { success: true };
    }),

  // Update account label
  updateLabel: authedQuery
    .input(z.object({
      id: z.number(),
      accountLabel: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(connectedAccounts)
        .set({ accountLabel: input.accountLabel })
        .where(and(eq(connectedAccounts.id, input.id), eq(connectedAccounts.userId, ctx.user.id)));

      return { success: true };
    }),

  // Toggle account active
  toggleActive: authedQuery
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(connectedAccounts)
        .set({ isActive: input.active })
        .where(and(eq(connectedAccounts.id, input.id), eq(connectedAccounts.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete account
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(connectedAccounts)
        .where(and(eq(connectedAccounts.id, input.id), eq(connectedAccounts.userId, ctx.user.id)));

      return { success: true };
    }),

  // Update tokens
  updateTokens: authedQuery
    .input(z.object({
      id: z.number(),
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...tokens } = input;

      await db
        .update(connectedAccounts)
        .set({
          ...tokens,
          lastSyncedAt: new Date(),
        })
        .where(and(eq(connectedAccounts.id, id), eq(connectedAccounts.userId, ctx.user.id)));

      return { success: true };
    }),

  // Get OAuth URL for Google
  getGoogleAuthUrl: authedQuery
    .input(z.object({
      accountLabel: z.string().min(1),
      scopes: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const clientId = process.env.GOOGLE_CLIENT_ID || "";
      const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/oauth/google/callback`;
      const scopes = input.scopes || [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/tasks",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ];

      const state = Buffer.from(JSON.stringify({
        accountLabel: input.accountLabel,
        provider: "google",
      })).toString("base64");

      const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes.join(" "))}&` +
        `response_type=code&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${encodeURIComponent(state)}`;

      return { url };
    }),

  // Get OAuth URL for Microsoft
  getMicrosoftAuthUrl: authedQuery
    .input(z.object({
      accountLabel: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const clientId = process.env.MICROSOFT_CLIENT_ID || "";
      const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/oauth/microsoft/callback`;
      const scopes = [
        "openid",
        "profile",
        "email",
        "offline_access",
        "https://graph.microsoft.com/Calendars.ReadWrite",
        "https://graph.microsoft.com/Tasks.ReadWrite",
        "https://graph.microsoft.com/Files.ReadWrite",
        "https://graph.microsoft.com/Mail.ReadWrite",
        "https://graph.microsoft.com/Mail.Send",
      ];

      const state = Buffer.from(JSON.stringify({
        accountLabel: input.accountLabel,
        provider: "microsoft",
      })).toString("base64");

      const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes.join(" "))}&` +
        `response_type=code&` +
        `response_mode=query&` +
        `state=${encodeURIComponent(state)}`;

      return { url };
    }),
});
