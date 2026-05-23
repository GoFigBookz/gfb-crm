// Build: e43d831-v2
const BUILD_INFO = { commit: "e43d831", deployTime: new Date().toISOString() };

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { triageIntakeRouter } from "./triage-intake-router";
import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./google/auth";
import { Paths } from "@contracts/constants";

// DB imports for inline OAuth callbacks
import { getDb } from "./queries/connection";
import { connectedAccounts, qboConnections } from "../db/schema";
import { eq } from "drizzle-orm";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(cors({
  origin: [
    "https://gofig.ca",
    "https://www.gofig.ca",
    "https://figgy.gofig.ca",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Returns Google Client ID to frontend at runtime
app.get("/api/auth/config", (c) =>
  c.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || "" })
);

// Health check endpoint
app.get("/api/health", (c) => c.json({ status: "ok", time: Date.now() }));

// ================================================================
// QBO OAUTH CALLBACK — Inline handler (no tRPC caller needed)
// ================================================================
app.get("/api/qbo/callback", async (c) => {
  const code = c.req.query("code");
  const realmId = c.req.query("realmId");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect("/integrations?error=" + encodeURIComponent(error), 302);
  }
  if (!code || !realmId || !state) {
    return c.redirect("/integrations?error=missing_params", 302);
  }

  try {
    // Parse state
    let env = "production";
    let accountType = "ca_clients";
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
      env = parsed.env || "production";
      accountType = parsed.accountType || "ca_clients";
    } catch { /* ignore */ }

    const clientId = process.env.QBO_CLIENT_ID || process.env.SANDBOX_QBO_CLIENT_ID || "";
    const clientSecret = process.env.QBO_CLIENT_SECRET || process.env.SANDBOX_QBO_CLIENT_SECRET || "";
    const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/qbo/callback`;
    const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

    // Exchange code for tokens
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token exchange failed: ${res.status} ${err}`);
    }
    const data = await res.json();

    // Fetch company info
    const baseUrl = env === "sandbox"
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com";
    const companyInfo = await fetch(
      `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`,
      { headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/json" } }
    );
    let companyName: string | null = null;
    let companyEmail: string | null = null;
    if (companyInfo.ok) {
      const cInfo = await companyInfo.json();
      companyName = cInfo.CompanyInfo?.CompanyName || null;
      companyEmail = cInfo.CompanyInfo?.Email?.Address || null;
    }

    // Save to database
    const db = getDb();
    const existing = await db
      .select()
      .from(qboConnections)
      .where(eq(qboConnections.realmId, realmId))
      .limit(1);

    if (existing[0]) {
      await db.update(qboConnections).set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
        companyName: companyName || existing[0].companyName,
        companyEmail: companyEmail || existing[0].companyEmail,
        accountType: accountType as "ca_clients" | "us_clients" | "personal_business",
        isActive: true,
        updatedAt: new Date(),
      }).where(eq(qboConnections.id, existing[0].id));
    } else {
      await db.insert(qboConnections).values({
        userId: 1,
        realmId,
        companyName,
        companyEmail,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
        environment: env as "sandbox" | "production",
        accountType: accountType as "ca_clients" | "us_clients" | "personal_business",
        isActive: true,
      });
    }

    return c.redirect("/integrations?success=qbo_connected", 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[QBO OAuth] callback failed:", message);
    return c.redirect("/integrations?error=" + encodeURIComponent(message), 302);
  }
});

// ================================================================
// GOOGLE INTEGRATION OAUTH CALLBACK — For Gmail/Calendar/Drive sync
// ================================================================
app.get("/api/oauth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect("/integrations?error=" + encodeURIComponent(error), 302);
  }
  if (!code || !state) {
    return c.redirect("/integrations?error=missing_params", 302);
  }

  try {
    // Parse state
    let stateData: { accountLabel: string; provider: string; userId?: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
    } catch {
      throw new Error("Invalid state parameter");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/oauth/google/callback`;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials not configured");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
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

    // Save to connected_accounts
    const db = getDb();
    await db.insert(connectedAccounts).values({
      userId: stateData.userId || 1,
      provider: "google",
      providerAccountId: userInfo.id,
      accountLabel: stateData.accountLabel,
      accountEmail: userInfo.email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
      scopes: tokenData.scope,
      isActive: true,
      syncEnabled: JSON.stringify({ email: true, calendar: true, files: true, tasks: true }),
    });

    return c.redirect("/integrations?success=google_connected", 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Google OAuth] callback failed:", message);
    return c.redirect("/integrations?error=" + encodeURIComponent(message), 302);
  }
});

// ================================================================
// MICROSOFT INTEGRATION OAUTH CALLBACK — For Outlook/Calendar sync
// ================================================================
app.get("/api/oauth/microsoft/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect("/integrations?error=" + encodeURIComponent(error), 302);
  }
  if (!code || !state) {
    return c.redirect("/integrations?error=missing_params", 302);
  }

  try {
    let stateData: { accountLabel: string; provider: string; userId?: number };
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
    } catch {
      throw new Error("Invalid state parameter");
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID || "";
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || "";
    const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/oauth/microsoft/callback`;

    if (!clientId || !clientSecret) {
      throw new Error("Microsoft OAuth credentials not configured");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
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
    const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    const db = getDb();
    await db.insert(connectedAccounts).values({
      userId: stateData.userId || 1,
      provider: "microsoft",
      providerAccountId: userInfo.id,
      accountLabel: stateData.accountLabel,
      accountEmail: userInfo.mail || userInfo.userPrincipalName,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
      scopes: tokenData.scope,
      isActive: true,
      syncEnabled: JSON.stringify({ email: true, calendar: true, files: true, tasks: true }),
    });

    return c.redirect("/integrations?success=microsoft_connected", 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Microsoft OAuth] callback failed:", message);
    return c.redirect("/integrations?error=" + encodeURIComponent(message), 302);
  }
});

// ================================================================
// GOOGLE LOGIN OAUTH CALLBACK — For user authentication (existing)
// ================================================================
app.get(Paths.oauthCallback, createOAuthCallbackHandler());

// ================================================================
// tRPC API
// ================================================================
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

// Triage Intake Router (Google Sheets -> CRM)
app.route("/api/triage-intake", triageIntakeRouter);

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

async function startServer() {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const { startSyncScheduler } = await import("./sync-scheduler");
  startSyncScheduler();

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer();
