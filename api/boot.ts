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
      const { relinkFindings } = await import("./relink-findings");
      await ensureBridgeReady();
      await relinkFindings();
      return c.json({ success: true, op, health: await brain.bridgeHealth() });
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
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  // Self-configure the live QBO bridge FIRST (adds the bridge columns before
  // anything queries qbo_connections), then back-fill finding links.
  const { ensureBridgeReady } = await import("./bridge-bootstrap");
  await ensureBridgeReady();
  const { relinkFindings } = await import("./relink-findings");
  await relinkFindings();

  const { startSyncScheduler } = await import("./sync-scheduler");
  startSyncScheduler();

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer();
