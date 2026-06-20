// Build: e43d831-v2
const BUILD_INFO = { commit: "e43d831", deployTime: new Date().toISOString() };

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./google/auth";
import { Paths } from "@contracts/constants";

// DB imports for inline OAuth callbacks
import { getDb } from "./queries/connection";
import { connectedAccounts, qboConnections, triageFindings, clients } from "../db/schema";
import { eq, sql, like } from "drizzle-orm";
import { matchClientIdByName } from "./client-match";

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

// Client-side error capture — the frontend ErrorBoundary POSTs render crashes
// here so white-screen bugs can be diagnosed server-side (read via admin op).
const recentClientErrors: any[] = [];
app.post("/api/client-error", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const entry = { ...body, at: new Date().toISOString() };
    recentClientErrors.unshift(entry);
    if (recentClientErrors.length > 25) recentClientErrors.pop();
    console.error("[client-error]", entry.url, "—", entry.message, "\n", entry.componentStack);
  } catch { /* ignore */ }
  return c.json({ ok: true });
});
export function getRecentClientErrors() { return recentClientErrors; }

// ================================================================
// QBO OAUTH CALLBACK — Inline handler (no tRPC caller needed)
// ================================================================
// Start the per-client connect flow: redirect the browser to Intuit's authorize
// page with a SIGNED state that binds this realm to the given CRM client.
//   GET /api/qbo/connect?clientId=123[&env=production]
app.get("/api/qbo/connect", async (c) => {
  const { buildAuthorizeUrl } = await import("./qbo-oauth");
  const clientIdRaw = c.req.query("clientId");
  const env = c.req.query("env") === "sandbox" ? "sandbox" : "production";
  const clientId = clientIdRaw && /^\d+$/.test(clientIdRaw) ? Number(clientIdRaw) : null;
  const { url } = buildAuthorizeUrl({ clientId, env });
  return c.redirect(url, 302);
});

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
    // Hardened exchange: verifies the signed state (CSRF + client binding) and
    // stores tokens ENCRYPTED at rest. Single source of truth in qbo-oauth.ts.
    const { exchangeAndPersist } = await import("./qbo-oauth");
    await exchangeAndPersist({ code, realmId, stateRaw: state });
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
// MAKE.COM WEBHOOK — Simple raw JSON intake endpoint
// Make.com can POST any JSON here and it goes straight to make_intake
// ================================================================
// FIGGY JR auto-feed -> triage finding (form-encoded; deduped by Review Queue Row ID)
app.post("/api/figgy-jr-sync", async (c) => {
  try {
    const token = c.req.header("x-agent-token") || "";
    if (token !== (process.env.AGENT_WEBHOOK_TOKEN || "figgy-webhook-2026")) {
      return c.json({ success: false, error: "Invalid agent token" }, 401);
    }
    const body: any = await c.req.json();
    let values: any[][] = [];
    if (Array.isArray(body?.values)) values = body.values;
    else if (Array.isArray(body?.valueRanges?.[0]?.values)) values = body.valueRanges[0].values;
    else if (Array.isArray(body?.body?.valueRanges?.[0]?.values)) values = body.body.valueRanges[0].values;
    const db = getDb();
    let created = 0, skipped = 0;
    let start = 0;
    if (values[0] && String(values[0][0] || "").toLowerCase().includes("row id")) start = 1;
    for (let i = start; i < values.length; i++) {
      const row = values[i] || [];
      if (String(row[17] || "").trim().toUpperCase() !== "TRUE") continue;
      const rowId = String(row[0] || "").trim();
      if (!rowId) continue;
      const attachment = String(row[19] || "").trim();
      // "drive::<fileId>" = Drive upload (link to the file itself);
      // otherwise "<gmailMsgId>::..." = email attachment.
      const driveFileId = attachment.startsWith("drive::") ? attachment.slice("drive::".length).trim() : "";
      const gmailMsgId = !driveFileId && attachment.includes("::") ? attachment.split("::")[0].trim() : "";
      const clientName = String(row[2] || "").trim();
      const clientId: number | undefined = (clientName ? await matchClientIdByName(clientName) : null) ?? undefined;
      const sourceData = JSON.stringify({
        rowId, gmailMsgId, driveFileId, attachment, clientName,
        vendor: String(row[7] || "").trim(),
        amount: String(row[8] || "").trim(),
        currency: String(row[9] || "").trim(),
        date: String(row[4] || row[3] || "").trim(),
        category: String(row[13] || "").trim(),
        hst: String(row[11] || "").trim(),
        reason: String(row[18] || "").trim(),
      });
      const existing = await db.select().from(triageFindings).where(like(triageFindings.sourceData, "%" + rowId + "%")).limit(1);
      if (existing[0]) {
        const patch: Record<string, any> = {};
        if (existing[0].sourceData !== sourceData) patch.sourceData = sourceData;
        if (clientId && existing[0].clientId !== clientId) patch.clientId = clientId;
        if (Object.keys(patch).length) await db.update(triageFindings).set(patch).where(eq(triageFindings.id, existing[0].id));
        skipped++;
        continue;
      }
      const vendor = String(row[7] || "").trim();
      const docType = String(row[5] || "").trim();
      const title = vendor && docType ? (vendor + " \u2014 " + docType) : (vendor || docType || ("Review " + rowId));
      await db.insert(triageFindings).values({
        agentName: "Figgy Jr",
        clientId,
        findingType: "review",
        severity: "warning",
        title: title.slice(0, 200),
        description: ("Escalation: " + String(row[18] || "") + " | Category: " + String(row[13] || "") + " | Amount: " + String(row[8] || "")).slice(0, 2000),
        suggestedAction: (String(row[14] || "") || "Review in QBO").slice(0, 500),
        sourceData,
        status: "new",
      });
      created++;
    }
    return c.json({ success: true, created, skipped });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post("/api/figgy-jr-finding", async (c) => {
  try {
    const token = c.req.header("x-agent-token") || "";
    if (token !== (process.env.AGENT_WEBHOOK_TOKEN || "figgy-webhook-2026")) {
      return c.json({ success: false, error: "Invalid agent token" }, 401);
    }
    const b = (await c.req.parseBody()) as Record<string, any>;
    const rowId = String(b.rowId || "").trim();
    if (!rowId) return c.json({ success: false, error: "rowId required" }, 400);
    const db = getDb();
    const dup = await db.select().from(triageFindings).where(eq(triageFindings.sourceData, rowId)).limit(1);
    if (dup[0]) return c.json({ success: true, deduped: true, findingId: dup[0].id });
    const clientName = String(b.clientName || "").trim();
    let clientId: number | undefined;
    if (clientName) {
      const cc = await db.select().from(clients).where(eq(clients.name, clientName)).limit(1);
      if (cc[0]) clientId = cc[0].id;
    }
    const sevRaw = String(b.severity || "warning");
    const severity = (sevRaw === "critical" || sevRaw === "info" || sevRaw === "warning") ? sevRaw : "warning";
    const [finding] = await db.insert(triageFindings).values({
      agentName: "Figgy Jr",
      clientId,
      findingType: "review",
      severity: severity as "critical" | "warning" | "info",
      title: String(b.title || ("Review " + rowId)).slice(0, 200),
      description: String(b.description || "").slice(0, 2000),
      suggestedAction: String(b.suggestedAction || "").slice(0, 500),
      sourceData: rowId,
      status: "new",
    }).returning();
    return c.json({ success: true, findingId: finding.id });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.post("/api/intake/webhook", async (c) => {
  try {
    const body = await c.req.json();
    const db = getDb();
    const now = new Date();

    const raw = JSON.stringify(body);
    const payload = body as Record<string, any>;

    const extract = (keys: string[]): string | null => {
      for (const k of keys) {
        const v = payload[k];
        if (v != null && v !== "") return String(v);
        for (const parent of Object.values(payload)) {
          if (parent && typeof parent === "object" && !Array.isArray(parent)) {
            const nested = (parent as Record<string, any>)[k];
            if (nested != null && nested !== "") return String(nested);
          }
        }
      }
      return null;
    };

    const id       = payload.id || payload.ID || payload.Id || payload.entryId || null;
    const client   = extract(["client", "clientName", "client_name", "company", "Company", "customer", "Customer"]);
    const contact  = extract(["name", "contactName", "contact_name", "fullName", "full_name", "firstName", "first_name"]);
    const email    = extract(["email", "Email", "emailAddress", "email_address", "mail"]);
    const phone    = extract(["phone", "Phone", "phoneNumber", "phone_number", "tel"]);
    const subject  = extract(["subject", "Subject", "topic", "Topic", "title", "Title", "note", "Note", "message", "Message", "description", "Description"]);
    const amount   = extract(["amount", "Amount", "total", "Total", "value", "Value", "cost", "Cost"]);
    const vendor   = extract(["vendor", "Vendor", "vendorName", "vendor_name", "supplier", "Supplier", "payee", "Payee"]);
    const docType  = extract(["type", "Type", "documentType", "document_type", "category", "Category", "formType", "form_type"]);
    const url      = extract(["url", "URL", "link", "Link", "fileUrl", "file_url", "driveUrl", "drive_url", "attachment", "Attachment"]);

    await db.run(sql`
      INSERT INTO make_intake (
        make_id, raw_payload,
        client_name, contact_name, email, phone,
        subject, amount, vendor, document_type, file_url,
        status, created_at, updated_at
      ) VALUES (
        ${id ?? null}, ${raw},
        ${client}, ${contact}, ${email}, ${phone},
        ${subject}, ${amount ? parseFloat(amount) || null : null}, ${vendor}, ${docType}, ${url},
        'new', ${now}, ${now}
      )
    `);

    return c.json({ success: true, received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Intake Webhook] Error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

// ================================================================
// BULK CLIENT IMPORT — REST endpoint for easy triggering
// ================================================================
app.post("/api/admin/import-clients", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    if (body.token !== "gfb-import-2026") {
      return c.json({ error: "Invalid token" }, 401);
    }

    const db = getDb();
    const { clients } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const { createRecurringTasksForClient } = await import("./client-task-creator");

    const CLIENTS_DATA = [
      { name: "Aim Construction Inc.", email: "aim@example.com", company: "Aim Construction Inc.", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 500, billingType: "monthly_fixed" as const },
      { name: "Align By Design", email: "align@example.com", company: "Align By Design", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: false, yearEndMonth: "Dec" as const, monthlyFee: 300, billingType: "monthly_fixed" as const },
      { name: "Align Plumbing Inc.", email: "alignplumbing@example.com", company: "Align Plumbing Inc.", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 600, billingType: "monthly_fixed" as const },
      { name: "Auld Spot Pub", email: "auldspot@example.com", company: "The Auld Spot Pub", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "monthly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 700, billingType: "monthly_fixed" as const },
      { name: "Clark Pools Collingwood", email: "clarkpools@example.com", company: "Clark Pools and Spas Collingwood Inc", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 450, billingType: "monthly_fixed" as const },
      { name: "Clark Pools Owen Sound", email: "clarkowensound@example.com", company: "CP-Owen Sound", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 400, billingType: "monthly_fixed" as const },
      { name: "Dark Horse Intelligence Inc.", email: "darkhorse@example.com", company: "Dark Horse Intelligence Inc.", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: true, payrollFrequency: "monthly" as const, yearEndMonth: "Dec" as const, monthlyFee: 550, billingType: "monthly_fixed" as const },
      { name: "Dr. M. Kapala", email: "kapala@example.com", company: "Dr. M. Kapala", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: false, yearEndMonth: "Dec" as const, monthlyFee: 350, billingType: "monthly_fixed" as const },
      { name: "GoToMarket Agility", email: "gtma@example.com", company: "GoToMarket Agility", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: false, yearEndMonth: "Dec" as const, monthlyFee: 300, billingType: "monthly_fixed" as const },
      { name: "Kaavio (Fleming)", email: "kaavio@example.com", company: "Kaavio", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: false, yearEndMonth: "Dec" as const, monthlyFee: 350, billingType: "monthly_fixed" as const },
      { name: "King Industries Inc.", email: "king@example.com", company: "King Industries Inc.", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 500, billingType: "monthly_fixed" as const },
      { name: "Laing", email: "laing@example.com", company: "Laing", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: false, yearEndMonth: "Dec" as const, monthlyFee: 250, billingType: "monthly_fixed" as const },
      { name: "Originality.AI Inc", email: "originality@example.com", company: "Originality.AI Inc", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 400, billingType: "monthly_fixed" as const },
      { name: "Ovita Co's", email: "ovita@example.com", company: "Ovita Co's", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: false, yearEndMonth: "Dec" as const, monthlyFee: 300, billingType: "monthly_fixed" as const },
      { name: "Selective Painting Inc", email: "selective@example.com", company: "Selective Painting Inc", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 350, billingType: "monthly_fixed" as const },
      { name: "Sher-E-Punjab", email: "sher@example.com", company: "Sher-E-Punjab", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 400, billingType: "monthly_fixed" as const },
      { name: "Studio Lella Inc", email: "studiolella@example.com", company: "Studio Lella Inc", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: false, hasPayroll: true, payrollFrequency: "self" as const, yearEndMonth: "Dec" as const, monthlyFee: 300, billingType: "monthly_fixed" as const },
      { name: "Unimax Construction Group", email: "unimax@example.com", company: "Unimax Construction Group LLC", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 650, billingType: "monthly_fixed" as const },
      { name: "Universal Construction Group", email: "universal@example.com", company: "Universal Construction Group", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 500, billingType: "monthly_fixed" as const },
      { name: "West York Paving Ltd.", email: "westyork@example.com", company: "West York Paving Ltd.", status: "active" as const, assignedTo: "Markie" as const, hasHST: true, hstPeriod: "quarterly" as const, hasWSIB: true, wsibQuarter: "all" as const, hasPayroll: true, payrollFrequency: "bi-weekly" as const, yearEndMonth: "Dec" as const, monthlyFee: 800, billingType: "monthly_fixed" as const },
    ];

    const results = { imported: 0, skipped: 0, tasksCreated: 0, errors: [] as string[] };

    for (const clientData of CLIENTS_DATA) {
      try {
        const existing = await db.select().from(clients).where(eq(clients.name, clientData.name)).limit(1);
        if (existing.length > 0) {
          results.skipped++;
          continue;
        }

        const [client] = await db.insert(clients).values({
          ...clientData,
          userId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        results.imported++;

        if (client) {
          const taskResult = await createRecurringTasksForClient(
            client.id,
            1,
            {
              hasHST: clientData.hasHST,
              hstPeriod: clientData.hstPeriod,
              hasWSIB: clientData.hasWSIB,
              wsibQuarter: clientData.wsibQuarter,
              hasPayroll: clientData.hasPayroll,
              payrollFrequency: clientData.payrollFrequency,
            },
            clientData.name,
            clientData.assignedTo
          );
          results.tasksCreated += taskResult?.count || 0;
        }
      } catch (e: any) {
        results.errors.push(`${clientData.name}: ${e.message}`);
      }
    }

    return c.json({ success: true, ...results, totalClients: CLIENTS_DATA.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: message }, 500);
  }
});

// ================================================================
// FIGGY ADMIN (token-gated, read-only-ish) — lets the build self-test the
// coding pipeline remotely via Make without browser/login access.
// ================================================================
app.post("/api/admin/figgy", async (c) => {
  const token = c.req.header("x-agent-token") || "";
  if (token !== (process.env.AGENT_WEBHOOK_TOKEN || "figgy-webhook-2026")) {
    return c.json({ success: false, error: "Invalid agent token" }, 401);
  }
  let body: any = {};
  try { body = await c.req.json(); } catch { body = {}; }
  // Prefer URL query (?op=enrich) — Make mangles braces in a JSON body.
  const op = String(c.req.query("op") || body?.op || "health");
  const limit = Number(c.req.query("limit")) || body?.limit || undefined;
  const status = (c.req.query("status") || body?.status || undefined) as any;
  const reenrich = c.req.query("reenrich") === "1" || !!body?.reenrich;
  try {
    const brain = await import("./qbo-vendor-brain");
    if (op === "enrich") {
      const res = await brain.runEnrichment({ limit, status, reenrich });
      return c.json({ success: true, op, ...res });
    }
    if (op === "rebridge") {
      const { ensureBridgeReady } = await import("./bridge-bootstrap");
      const { ensureVendorMemoryColumns } = await import("./vendor-learning");
      const { relinkFindings } = await import("./relink-findings");
      await ensureBridgeReady();
      await ensureVendorMemoryColumns();
      await relinkFindings();
      return c.json({ success: true, op, health: await brain.bridgeHealth() });
    }
    if (op === "dedupeClients") {
      const { dedupeClients } = await import("./dedupe-clients");
      const confirm = c.req.query("confirm") === "1" || !!body?.confirm;
      return c.json({ success: true, op, ...(await dedupeClients(confirm)) });
    }
    if (op === "importClientMaster") {
      const { importClientMaster } = await import("./import-client-master");
      return c.json({ success: true, op, ...(await importClientMaster()) });
    }
    if (op === "clientErrors") {
      return c.json({ success: true, op, count: recentClientErrors.length, errors: recentClientErrors });
    }
    if (op === "clients") {
      // Read-only: list CRM clients + which have an active QBO connection, so
      // new client→realm bridge links can be verified by name.
      const { getDb } = await import("./queries/connection");
      const { clients, qboConnections, clientTaskRules } = await import("../db/schema");
      const db = getDb();
      const cs = await db.select().from(clients);
      const conns = await db.select().from(qboConnections);
      const ruleRows = await db.select().from(clientTaskRules);
      const byClient = new Map<number, any[]>();
      for (const cn of conns as any[]) {
        if (cn.clientId == null) continue;
        if (!byClient.has(cn.clientId)) byClient.set(cn.clientId, []);
        byClient.get(cn.clientId)!.push({ realmId: cn.realmId, transport: cn.transport, isActive: cn.isActive });
      }
      const remitByClient = new Map<number, string[]>();
      for (const r of ruleRows as any[]) {
        if (r.clientId == null || !String(r.ruleType || "").startsWith("payroll_remit")) continue;
        if (!remitByClient.has(r.clientId)) remitByClient.set(r.clientId, []);
        remitByClient.get(r.clientId)!.push(r.title);
      }
      const list = (cs as any[]).map((c2) => ({
        id: c2.id, name: c2.name, company: c2.company,
        payrollRemitterFreq: c2.payrollRemitterFreq ?? null,
        payrollRemitTasks: remitByClient.get(c2.id) || [],
        connections: byClient.get(c2.id) || [],
      }));
      return c.json({ success: true, op, count: list.length, clients: list });
    }
    if (op === "dedupeTasks") {
      const { dedupeTasks } = await import("./dedupe-tasks");
      return c.json({ success: true, op, ...(await dedupeTasks()) });
    }
    if (op === "onbget") {
      // Read-only: a client's persisted intake-driving fields (diagnose edits).
      const clientId = Number(c.req.query("clientId") || body?.clientId);
      if (!clientId) return c.json({ success: false, op, error: "clientId required" }, 400);
      const { getDb } = await import("./queries/connection");
      const { clients, clientOnboarding } = await import("../db/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = getDb();
      const cl = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
      if (!cl) return c.json({ success: false, op, error: "not found" }, 404);
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] as any ?? null;
      return c.json({ success: true, op, client: {
        name: cl.name, hasWSIB: cl.hasWSIB, wsibAccountNumber: cl.wsibAccountNumber, taxId: cl.taxId,
        hasHST: cl.hasHST, hstNumber: cl.hstNumber, hasPayroll: cl.hasPayroll, transactionsPerMonth: cl.transactionsPerMonth, monthlyFee: cl.monthlyFee,
      }, onboarding: onb ? {
        id: onb.id, avgMonthlyTransactions: onb.avgMonthlyTransactions, employeeCount: onb.employeeCount,
        wsibAccountNumber: onb.wsibAccountNumber, bookkeepingFrequency: onb.bookkeepingFrequency,
      } : null });
    }
    if (op === "quote") {
      // Scope-based quote for one client (verify the quote engine live).
      const clientId = Number(c.req.query("clientId") || body?.clientId);
      if (!clientId) return c.json({ success: false, op, error: "clientId required" }, 400);
      const { getDb } = await import("./queries/connection");
      const { clients, clientOnboarding } = await import("../db/schema");
      const { eq, desc } = await import("drizzle-orm");
      const { computeQuote, compareToFlatFee } = await import("./quote-core");
      const { buildScopeForClient } = await import("./quote-router");
      const db = getDb();
      const cl = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
      if (!cl) return c.json({ success: false, op, error: "client not found" }, 404);
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
      const scope = buildScopeForClient(cl, onb);
      const quote = computeQuote(scope);
      const comparison = compareToFlatFee(quote.recurringMonthly, cl.monthlyFee ?? null);
      return c.json({ success: true, op, clientName: cl.name, flatFee: cl.monthlyFee ?? null, scope, quote, comparison });
    }
    if (op === "genquote") {
      // Generate + send a branded signable quote for a client (review aid).
      const clientId = Number(c.req.query("clientId") || body?.clientId);
      if (!clientId) return c.json({ success: false, op, error: "clientId required" }, 400);
      const { getDb } = await import("./queries/connection");
      const { clients, clientOnboarding } = await import("../db/schema");
      const { eq, desc } = await import("drizzle-orm");
      const { computeQuote, compareToFlatFee } = await import("./quote-core");
      const { buildScopeForClient, createAndSendDoc, nextQuoteNumber } = await import("./quote-router");
      const { getFirmSettings } = await import("./firm-settings");
      const { renderQuoteHtml } = await import("./quote-doc");
      const db = getDb();
      const cl = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
      if (!cl) return c.json({ success: false, op, error: "client not found" }, 404);
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
      const quote = computeQuote(buildScopeForClient(cl, onb));
      const comparison = compareToFlatFee(quote.recurringMonthly, cl.monthlyFee ?? null);
      const qNum = await nextQuoteNumber(db);
      const content = renderQuoteHtml({ firm: getFirmSettings(), clientName: cl.name, clientCompany: cl.company, quote, comparison, quoteNumber: qNum });
      const res = await createAndSendDoc({
        db, clientId: cl.id, userId: cl.userId ?? 1,
        title: `Quote ${qNum} — ${cl.company || cl.name}`, description: `Scope-based quote · ${quote.recurringMonthly}/mo`,
        content, documentType: "custom", clientEmail: cl.email || null,
      });
      await db.update(clients).set({ quoteAmount: quote.recurringMonthly, quoteSentAt: new Date(), workflowStatus: "quote_sent" }).where(eq(clients.id, cl.id));
      return c.json({ success: true, op, clientName: cl.name, recurringMonthly: quote.recurringMonthly, nearestPackage: quote.nearestPackage, ...res });
    }
    if (op === "e2e") {
      // Full intake → quote → engagement → sign → activate, server-side, to
      // prove the whole chain works. Creates/replaces a throwaway test client.
      const { getDb } = await import("./queries/connection");
      const { clients, clientOnboarding, signatureDocuments, tasks, clientTaskRules } = await import("../db/schema");
      const { eq, and } = await import("drizzle-orm");
      const { computeQuote, compareToFlatFee } = await import("./quote-core");
      const { buildScopeForClient, createAndSendDoc, nextQuoteNumber, servicesForEngagement, clientAppsForEngagement } = await import("./quote-router");
      const { getFirmSettings } = await import("./firm-settings");
      const { renderQuoteHtml, renderEngagementHtml } = await import("./quote-doc");
      const { createClientTaskRules } = await import("./task-generator");
      const db = getDb();
      const steps: string[] = [];
      const TESTNAME = "E2E Test Co Inc.";
      try {
        // fresh start: remove any prior test client + its data
        const prev = await db.select().from(clients).where(eq(clients.name, TESTNAME));
        for (const p of prev as any[]) {
          await db.delete(tasks).where(eq(tasks.clientId, p.id));
          await db.delete(clientTaskRules).where(eq(clientTaskRules.clientId, p.id));
          await db.delete(signatureDocuments).where(eq(signatureDocuments.clientId, p.id));
          await db.delete(clientOnboarding).where(eq(clientOnboarding.clientId, p.id));
          await db.delete(clients).where(eq(clients.id, p.id));
        }
        // 1) create client (intake basics)
        const [cl] = await db.insert(clients).values({
          userId: 1, name: TESTNAME, company: TESTNAME, email: "markie@gofig.ca", contactName: "Markie Antle",
          status: "lead", workflowStatus: "new_lead", assignedTo: "Markie",
          taxId: "111222333", hasHST: true, hstNumber: "111222333RT0001", hstPeriod: "quarterly",
          hasPayroll: true, payrollFrequency: "bi-weekly", payrollRemitterFreq: "regular",
          hasWSIB: true, wsibAccountNumber: "WSIB-555", yearEndMonth: "Dec", qboAccountType: "ca_clients",
        }).returning();
        steps.push(`client created #${cl.id}`);
        // 2) intake/onboarding scope
        await db.insert(clientOnboarding).values({
          clientId: cl.id, token: "e2e-" + Date.now(), status: "approved",
          avgMonthlyTransactions: 120, bookkeepingFrequency: "monthly", employeeCount: 3,
          bankAccountCount: 2, creditCardCount: 1, hasEmployees: true, hasInvestments: true, paysDividends: true,
          needsYearEnd: true, usesStripe: true, usesHubdoc: true, hstGstFrequency: "quarterly",
          payrollFrequency: "biweekly", invoicingResponsibility: "we_invoice",
          qboSoftwareTier: "essentials", qboSoftwareWholesale: true, qboPayrollWholesale: true,
        });
        steps.push("intake saved (120 txns, HST q, 3 emp, WSIB, dividends, Stripe, QBO essentials wholesale)");
        const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, cl.id)))[0];
        // 3) quote
        const quote = computeQuote(buildScopeForClient(cl, onb));
        const cmp = compareToFlatFee(quote.recurringMonthly, cl.monthlyFee ?? null);
        const qNum = await nextQuoteNumber(db);
        const qDoc = await createAndSendDoc({ db, clientId: cl.id, userId: 1,
          title: `Quote ${qNum} — ${TESTNAME}`, description: `Scope-based quote · ${quote.recurringMonthly}/mo`,
          content: renderQuoteHtml({ firm: getFirmSettings(), clientName: cl.name, clientCompany: cl.company, quote, comparison: cmp, quoteNumber: qNum }),
          documentType: "custom", clientEmail: cl.email });
        steps.push(`quote ${qNum} generated → $${quote.recurringMonthly}/mo (doc #${qDoc.documentId})`);
        // 4) engagement
        const eDoc = await createAndSendDoc({ db, clientId: cl.id, userId: 1,
          title: `Letter of Engagement — ${TESTNAME}`, description: "Engagement terms for signature",
          content: renderEngagementHtml({ firm: getFirmSettings(), clientName: cl.name, clientCompany: cl.company,
            monthlyFee: cl.monthlyFee ?? null, quote, services: servicesForEngagement(cl, onb), yearEnd: cl.yearEndMonth,
            contactName: cl.contactName, contactEmail: cl.email, address: cl.address,
            closeSchedule: "monthly", clientApps: clientAppsForEngagement(onb), isCanadian: true }),
          documentType: "engagement_letter", clientEmail: cl.email });
        steps.push(`engagement generated (doc #${eDoc.documentId}, ${servicesForEngagement(cl, onb).length} services)`);
        // 5) sign both
        for (const docId of [qDoc.documentId, eDoc.documentId]) {
          await db.update(signatureDocuments).set({
            status: "signed", signedBy: "Markie Antle (E2E)", signatureType: "type_name",
            signatureData: JSON.stringify({ name: "Markie Antle", date: new Date().toISOString() }),
            signedAt: new Date(), updatedAt: new Date(),
          }).where(eq(signatureDocuments.id, docId));
        }
        const signedCount = (await db.select().from(signatureDocuments).where(and(eq(signatureDocuments.clientId, cl.id), eq(signatureDocuments.status, "signed")))).length;
        steps.push(`signed ${signedCount}/2 documents`);
        // 6) activate + generate tasks
        await db.update(clients).set({ status: "active", workflowStatus: "active", engagementSignedAt: new Date() }).where(eq(clients.id, cl.id));
        const res = await createClientTaskRules({
          clientId: cl.id, userId: 1, assignedTo: "Markie", hasHST: true, hstPeriod: "quarterly",
          hasWSIB: true, hasPayroll: true, payrollFrequency: "bi-weekly", payrollRemitterFreq: "regular",
          yearEnd: "Dec", bookkeepingFrequency: "monthly", paysDividends: true, hasInvestments: true, needsYearEnd: true,
        } as any);
        const taskCount = (await db.select().from(tasks).where(eq(tasks.clientId, cl.id))).length;
        steps.push(`activated → ${res.rules.length} rules, ${res.tasks.length} recurring tasks, ${taskCount} tasks total`);
        return c.json({ success: true, op, clientId: cl.id, quoteTotal: quote.recurringMonthly,
          quoteLines: quote.monthlyLineItems.map((l: any) => l.label), signedCount, steps,
          portalUrl: qDoc.portalUrl });
      } catch (e: any) {
        return c.json({ success: false, op, steps, error: e?.message || String(e), stack: e?.stack?.split("\n").slice(0,4) }, 500);
      }
    }
    if (op === "genengage") {
      // Generate + send a branded signable engagement letter for a client.
      const clientId = Number(c.req.query("clientId") || body?.clientId);
      if (!clientId) return c.json({ success: false, op, error: "clientId required" }, 400);
      const { getDb } = await import("./queries/connection");
      const { clients, clientOnboarding } = await import("../db/schema");
      const { eq, desc } = await import("drizzle-orm");
      const { computeQuote } = await import("./quote-core");
      const { buildScopeForClient, createAndSendDoc, servicesForEngagement, clientAppsForEngagement } = await import("./quote-router");
      const { getFirmSettings } = await import("./firm-settings");
      const { renderEngagementHtml } = await import("./quote-doc");
      const db = getDb();
      const cl = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
      if (!cl) return c.json({ success: false, op, error: "client not found" }, 404);
      const onb = (await db.select().from(clientOnboarding).where(eq(clientOnboarding.clientId, clientId)).orderBy(desc(clientOnboarding.id)).limit(1))[0] ?? null;
      const quote = computeQuote(buildScopeForClient(cl, onb));
      const content = renderEngagementHtml({
        firm: getFirmSettings(), clientName: cl.name, clientCompany: cl.company,
        monthlyFee: cl.monthlyFee ?? null, quote, services: servicesForEngagement(cl, onb),
        yearEnd: cl.yearEndMonth ?? null, contactName: cl.contactName || onb?.primaryContactName || null,
        contactEmail: cl.email || onb?.primaryContactEmail || null, address: cl.address || null,
        closeSchedule: onb?.bookkeepingFrequency || "monthly", clientApps: clientAppsForEngagement(onb),
        isCanadian: (cl.qboAccountType ?? "ca_clients") !== "us_clients",
      });
      const res = await createAndSendDoc({
        db, clientId: cl.id, userId: cl.userId ?? 1,
        title: `Letter of Engagement — ${cl.company || cl.name}`, description: "Engagement terms for signature",
        content, documentType: "engagement_letter", clientEmail: cl.email || null,
      });
      return c.json({ success: true, op, clientName: cl.name, ...res });
    }
    // default: health
    return c.json({ success: true, op: "health", health: await brain.bridgeHealth() });
  } catch (e: any) {
    return c.json({ success: false, op, error: e?.message || String(e) }, 500);
  }
});

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

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

async function startServer() {
  console.log("[BOOT] gfb-crm starting — build 2026-06-19c (clients-fix: schema+dedupe+casing)");
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  // CRITICAL, must run before anything reads `clients`: the live DB's clients
  // table is missing columns the app SELECTs, which makes every read throw (empty
  // Clients page). Add any missing columns first.
  try {
    const { ensureClientsColumns, ensureOnboardingColumns } = await import("./ensure-clients-schema");
    await ensureClientsColumns();
    await ensureOnboardingColumns();
  } catch (e) {
    console.error("[schema] ensureClientsColumns failed (non-fatal):", e instanceof Error ? e.message : e);
  }

  // Collapse exact-duplicate client rows (the live DB accumulated ~3 copies each),
  // then populate/enrich from the master directory + generate recurring deadline
  // tasks. Idempotent; the master list IS the onboard. Opt out: FIGGY_SKIP_CLIENT_SEED=on.
  if (process.env.FIGGY_SKIP_CLIENT_SEED !== "on") {
    try {
      const { dedupeClients } = await import("./dedupe-clients");
      const d = await dedupeClients(true);
      console.log(`[dedupe] clients: ${d.totalClients} -> ${d.keep} kept, ${d.deleted} removed`);
    } catch (e) {
      console.error("[dedupe] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { importClientMaster } = await import("./import-client-master");
      const r = await importClientMaster();
      console.log(`[seed] clients: +${r.created} created, ${r.matched} matched, ${r.merged} variants merged, ${r.rulesCreated} rules, ${r.tasksCreated} tasks`);
    } catch (e) {
      console.error("[seed] importClientMaster failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Backfill the one-time setup tasks (CRA Represent-a-Client, Service Canada,
    // WSIB) for every active client — incl. the already-seeded ones.
    try {
      const { backfillSetupTasks } = await import("./task-generator");
      const s = await backfillSetupTasks();
      console.log(`[setup-tasks] ensured for ${s.clients} clients, +${s.created} created`);
    } catch (e) {
      console.error("[setup-tasks] backfill failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Correct specific clients' CRA payroll remitter cadence (penalty-sensitive).
    try {
      const { applyPayrollRemitterOverrides } = await import("./task-generator");
      const r = await applyPayrollRemitterOverrides();
      if (r.fixed) console.log(`[remitter] corrected ${r.fixed} clients`);
    } catch (e) {
      console.error("[remitter] overrides failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Collapse legacy duplicate rules/tasks (pre-idempotency boots left dupes,
    // e.g. Originality showed each task several times).
    try {
      const { dedupeTasks } = await import("./dedupe-tasks");
      const r = await dedupeTasks();
      if (r.rulesRemoved || r.tasksRemoved) console.log(`[dedupe-tasks] -${r.rulesRemoved} rules, -${r.tasksRemoved} tasks`);
    } catch (e) {
      console.error("[dedupe-tasks] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Link each client to its existing Drive folder under "GFB → GFB Clients"
    // so the client page's Google Drive button jumps to their files.
    try {
      const { linkDriveFolders } = await import("./link-drive-folders");
      const r = await linkDriveFolders();
      console.log(`[drive-link] linked ${r.linked}, already ${r.alreadySet}, unmatched ${r.unmatched.length}`);
    } catch (e) {
      console.error("[drive-link] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
  }

  // Self-configure the live QBO bridge (adds the bridge columns, binds Clark
  // OS/CW to the now-seeded client cards), then back-fill finding links.
  const { ensureBridgeReady } = await import("./bridge-bootstrap");
  await ensureBridgeReady();
  const { ensureVendorMemoryColumns } = await import("./vendor-learning");
  await ensureVendorMemoryColumns();
  // Native OAuth: add the reconnectReason column, then keep refresh tokens alive
  // so a quiet client's rolling 100-day window never lapses.
  const { ensureOAuthColumns, keepAliveNativeConnections } = await import("./qbo-oauth");
  await ensureOAuthColumns();
  const { relinkFindings } = await import("./relink-findings");
  await relinkFindings();

  const { startSyncScheduler } = await import("./sync-scheduler");
  startSyncScheduler();

  // QBO native-token keep-alive: run shortly after boot, then daily. Best-effort
  // and isolated — a refresh failure only flags that one connection for reconnect.
  setTimeout(() => { keepAliveNativeConnections().catch(() => {}); }, 60_000);
  setInterval(() => { keepAliveNativeConnections().catch(() => {}); }, 24 * 60 * 60 * 1000);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer();
