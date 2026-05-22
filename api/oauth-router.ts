import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { connectedAccounts } from "../db/schema";
import { eq, and } from "drizzle-orm";

/**
 * OAUTH CALLBACK ROUTER
 * Handles Google and Microsoft OAuth callbacks
 * Exchanges authorization codes for access/refresh tokens
 */

export const oauthRouter = createRouter({
  // Google OAuth callback
  // GET /api/oauth/google/callback?code=...&state=...
  googleCallback: publicQuery
    .input(z.object({
      code: z.string(),
      state: z.string(),
      error: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (input.error) {
        throw new Error(`Google OAuth error: ${input.error}`);
      }

      const clientId = process.env.GOOGLE_CLIENT_ID || "";
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
      const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/oauth/google/callback`;

      if (!clientId || !clientSecret) {
        throw new Error("Google OAuth credentials not configured");
      }

      // Parse state
      let stateData: { accountLabel: string; provider: string; userId?: number };
      try {
        stateData = JSON.parse(Buffer.from(input.state, "base64").toString("utf8"));
      } catch {
        throw new Error("Invalid state parameter");
      }

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: input.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(`Token exchange failed: ${tokenData.error}`);
      }

      // Get user info
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoResponse.json();

      // Save to database
      const db = getDb();
      const [account] = await db.insert(connectedAccounts).values({
        userId: stateData.userId || 1, // Default to admin if not specified
        provider: "google",
        providerAccountId: userInfo.id,
        accountLabel: stateData.accountLabel,
        accountEmail: userInfo.email,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scopes: tokenData.scope,
        isActive: true,
        syncEnabled: { email: true, calendar: true, files: true, tasks: true },
      }).returning();

      return {
        success: true,
        account,
        message: `Connected ${userInfo.email} successfully`,
      };
    }),

  // Microsoft OAuth callback
  microsoftCallback: publicQuery
    .input(z.object({
      code: z.string(),
      state: z.string(),
      error: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (input.error) {
        throw new Error(`Microsoft OAuth error: ${input.error}`);
      }

      const clientId = process.env.MICROSOFT_CLIENT_ID || "";
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
      const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/oauth/microsoft/callback`;

      if (!clientId || !clientSecret) {
        throw new Error("Microsoft OAuth credentials not configured");
      }

      let stateData: { accountLabel: string; provider: string; userId?: number };
      try {
        stateData = JSON.parse(Buffer.from(input.state, "base64").toString("utf8"));
      } catch {
        throw new Error("Invalid state parameter");
      }

      // Exchange code for tokens
      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: input.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(`Token exchange failed: ${tokenData.error}`);
      }

      // Get user info from Microsoft Graph
      const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoResponse.json();

      const db = getDb();
      const [account] = await db.insert(connectedAccounts).values({
        userId: stateData.userId || 1,
        provider: "microsoft",
        providerAccountId: userInfo.id,
        accountLabel: stateData.accountLabel,
        accountEmail: userInfo.mail || userInfo.userPrincipalName,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scopes: tokenData.scope,
        isActive: true,
        syncEnabled: { email: true, calendar: true, files: true, tasks: true },
      }).returning();

      return {
        success: true,
        account,
        message: `Connected ${userInfo.mail || userInfo.userPrincipalName} successfully`,
      };
    }),

  // Refresh Google token
  refreshGoogleToken: publicQuery
    .input(z.object({ accountId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(connectedAccounts).where(eq(connectedAccounts.id, input.accountId)).limit(1);
      const account = rows[0];

      if (!account || !account.refreshToken) {
        throw new Error("Account not found or no refresh token");
      }

      const clientId = process.env.GOOGLE_CLIENT_ID || "";
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: account.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(`Refresh failed: ${data.error}`);
      }

      await db
        .update(connectedAccounts)
        .set({
          accessToken: data.access_token,
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        })
        .where(eq(connectedAccounts.id, input.accountId));

      return { success: true, accessToken: data.access_token };
    }),
});
