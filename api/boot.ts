// Build: e43d831-v2
const BUILD_INFO = { commit: "e43d831", deployTime: new Date().toISOString() };

import { Hono } from "hono";
import { Hono } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./google/auth";
import { Paths } from "@contracts/constants";

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

// QBO OAuth callback handler
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
    // Call tRPC mutation internally
    const caller = appRouter.createCaller({});
    await caller.qbo.callback({ code, realmId, state });
    return c.redirect("/integrations?success=qbo_connected", 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[QBO OAuth] callback failed:", message);
    return c.redirect("/integrations?error=" + encodeURIComponent(message), 302);
  }
});

// QBO OAuth callback handler
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
    // Determine environment from state
    let env = "production";
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
      env = parsed.env || "production";
    } catch { /* ignore */ }

    // Exchange code for tokens
    const clientId = process.env.QBO_CLIENT_ID || process.env.SANDBOX_QBO_CLIENT_ID || "";
    const clientSecret = process.env.QBO_CLIENT_SECRET || process.env.SANDBOX_QBO_CLIENT_SECRET || "";
    const redirectUri = `${process.env.VITE_APP_URL || "http://localhost:3000"}/api/qbo/callback`;
    const tokenUrl = env === "sandbox" 
      ? "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
      : "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

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
    const { getDb } = await import("./queries/connection");
    const { qboConnections } = await import("../db/schema");
    const db = getDb();
    await db.insert(qboConnections).values({
      userId: 1,
      realmId,
      companyName,
      companyEmail,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      environment: env as "sandbox" | "production",
      isActive: true,
    });

    return c.redirect("/integrations?success=qbo_connected", 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[QBO OAuth] callback failed:", message);
    return c.redirect("/integrations?error=" + encodeURIComponent(message), 302);
  }
});

app.get(Paths.oauthCallback, createOAuthCallbackHandler());

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

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
