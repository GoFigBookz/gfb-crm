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
import { getDb, dbContext } from "./queries/connection";
import { connectedAccounts, qboConnections, triageFindings, clients, calendarEvents } from "../db/schema";
import { eq, and, sql, like } from "drizzle-orm";
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

// Live deploy diagnostic — hit /api/version to see WHEN the running server last
// booted and which build it is. If `startedAt` is stale after a merge to main,
// the Railway deploy isn't picking up new code (not a code/cache problem).
const BOOT_TIME = new Date().toISOString();
// Last Google OAuth callback outcome (no secrets) so we can diagnose a failed
// connect from /api/oauth/google/debug instead of guessing.
let lastGoogleOAuth: { ok: boolean; at: string; email?: string; userId?: number; error?: string } | null = null;
const BUILD_TAG = "2026-06-26.186";  // bump each deploy so prod vs source is unambiguous

// CREDENTIAL HYGIENE: trim OAuth client id/secret env vars at startup. Pasting a
// secret into a hosting dashboard very often drags a trailing space or newline,
// which Google/Intuit reject as `invalid_client` (the exact error Markie hit on
// the Google connect). Normalizing here means a stray whitespace can NEVER cause
// that again — every downstream read sees the clean value.
for (const k of [
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI",
  "QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "SANDBOX_QBO_CLIENT_ID", "SANDBOX_QBO_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET",
]) {
  if (typeof process.env[k] === "string") process.env[k] = process.env[k]!.trim();
}
app.get("/api/version", (c) => {
  // Report what the RUNNING server actually has on disk so we can tell a
  // deploy-content mismatch apart from an edge/browser cache problem.
  let indexAsset: string | null = null;
  let assetExists = false;
  let assetFiles: string[] = [];
  let indexHead = "";
  try {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const base = process.cwd().endsWith("/dist") ? path.resolve(process.cwd(), "..") : process.cwd();
    const pub = path.join(base, "dist", "public");
    const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
    indexHead = html.slice(0, 400);
    indexAsset = (html.match(/assets\/index-[^"']+\.js/) || [null])[0];
    try { assetFiles = fs.readdirSync(path.join(pub, "assets")).filter((f) => /\.js$/.test(f)); } catch {}
    assetExists = !!indexAsset && assetFiles.includes(indexAsset.replace("assets/", ""));
  } catch (e) {
    indexHead = "read error: " + (e instanceof Error ? e.message : String(e));
  }
  return c.json({
    build: BUILD_TAG, startedAt: BOOT_TIME, now: new Date().toISOString(), uptimeSec: Math.round(process.uptime()),
    cwd: process.cwd(), indexAsset, assetExists, assetFiles, indexHead,
  });
});

// Google OAuth self-check — shows EXACTLY what the app sends Google so a
// redirect_uri_mismatch is diagnosable in one glance. No secrets exposed (only
// whether the client id/secret are present, and the redirect URI to register).
app.get("/api/oauth/google/debug", async (c) => {
  const { googleRedirectUri } = await import("./google-redirect");
  // Run the SAME firm-wide lookup the app uses, so this URL proves connectivity.
  let firmGoogle: any = null;
  try {
    const { getFirmGoogleAccount } = await import("./google-token");
    const a = await getFirmGoogleAccount();
    firmGoogle = a ? { found: true, id: a.id, email: a.accountEmail, isActive: !!a.isActive, hasRefreshToken: !!a.refreshToken, userId: a.userId } : { found: false };
  } catch (e) {
    firmGoogle = { found: false, error: e instanceof Error ? e.message : String(e) };
  }
  // LIVE PROBE: make the CRM actually call Google with ITS token and report the
  // exact result per service — this tells us if a Workspace policy is refusing
  // the app (403), the token is dead (401), or it works (and the sync is the bug).
  let apiProbe: any = null;
  try {
    const { getFirmGoogleAccount, getValidGoogleAccessToken } = await import("./google-token");
    const acct = await getFirmGoogleAccount();
    if (!acct) { apiProbe = { error: "no google account" }; }
    else {
      let tok = "";
      try { tok = await getValidGoogleAccessToken(acct as any); apiProbe = { tokenRefresh: "ok", scopes: (acct as any).scopes || null }; }
      catch (e) { apiProbe = { tokenRefresh: "FAILED: " + (e instanceof Error ? e.message : String(e)) }; }
      if (tok) {
        const probe = async (label: string, url: string) => {
          try {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
            const body = await r.text();
            apiProbe[label] = { status: r.status, ok: r.ok, body: r.ok ? `ok (${body.length} bytes)` : body.slice(0, 200) };
          } catch (e) { apiProbe[label] = { error: e instanceof Error ? e.message : String(e) }; }
        };
        await probe("calendar", "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&timeMin=2026-06-01T00:00:00Z&timeMax=2026-08-01T00:00:00Z&singleEvents=true");
        await probe("tasks", "https://tasks.googleapis.com/tasks/v1/users/@me/lists");
        await probe("drive", "https://www.googleapis.com/drive/v3/files?pageSize=1");
        await probe("gmail", "https://gmail.googleapis.com/gmail/v1/users/me/profile");
        // How many events did Google actually return to the CRM token?
        try {
          const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=50&timeMin=2026-06-01T00:00:00Z&timeMax=2026-08-01T00:00:00Z&singleEvents=true", { headers: { Authorization: `Bearer ${tok}` } });
          const j: any = await r.json();
          apiProbe.calendarEventsReturnedByGoogle = Array.isArray(j.items) ? j.items.length : 0;
        } catch { /* ignore */ }
      }
    }
  } catch (e) { apiProbe = { error: e instanceof Error ? e.message : String(e) }; }

  // Raw DB state — are events/tasks actually stored, and under which users?
  let dbCounts: any = null;
  try {
    const db = getDb();
    const rowsOf = async (q: string) => { const r: any = await db.run(sql.raw(q)); return (r?.rows ?? r ?? []) as any[]; };
    const one = async (q: string) => { const r = await rowsOf(q); return r[0] ? (r[0].n ?? Object.values(r[0])[0]) : 0; };
    dbCounts = {
      calendarEvents: await one("SELECT COUNT(*) n FROM calendar_events"),
      tasksTotal: await one("SELECT COUNT(*) n FROM tasks"),
      tasksWithDueIncomplete: await one("SELECT COUNT(*) n FROM tasks WHERE dueDate IS NOT NULL AND (completed IS NULL OR completed=0)"),
      taskUserIds: await rowsOf("SELECT userId, COUNT(*) n FROM tasks GROUP BY userId"),
      calEventUserIds: await rowsOf("SELECT userId, COUNT(*) n FROM calendar_events GROUP BY userId"),
      users: await rowsOf("SELECT id, email, role FROM users"),
    };
  } catch (e) { dbCounts = { error: e instanceof Error ? e.message : String(e) }; }

  // ?sync=1 → actually pull Google Calendar into the DB right now, server-side,
  // via the proven firm account (no dependency on the page triggering it). Reports
  // inserted/skipped/errors so we see the insert path work for real.
  let syncRun: any = null;
  if (c.req.query("sync") === "1") {
    try {
      const { ensureCalendarSchema } = await import("./ensure-calendar-schema");
      await ensureCalendarSchema(); // self-heal missing columns before inserting
      const { getFirmGoogleAccount, getValidGoogleAccessToken } = await import("./google-token");
      const acct: any = await getFirmGoogleAccount();
      const at = await getValidGoogleAccessToken(acct);
      const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=250&timeMin=2026-05-01T00:00:00Z&timeMax=2026-12-31T00:00:00Z&singleEvents=true&orderBy=startTime", { headers: { Authorization: `Bearer ${at}` } });
      const j: any = await r.json();
      const items = j.items || [];
      const db = getDb();
      // All-day events come as "YYYY-MM-DD" — parse as LOCAL noon so they don't
      // drift a day from a UTC-midnight conversion. Timed events keep their tz.
      const gDate = (part: any): Date | null => {
        if (part?.dateTime) return new Date(part.dateTime);
        if (!part?.date) return null;
        const [y, m, d] = String(part.date).split("-").map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
      };
      let inserted = 0, skipped = 0; const errors: string[] = [];
      for (const e of items) {
        try {
          // Dedup by googleEventId — non-destructive (no mass DELETE).
          const ex = await db.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.googleEventId, e.id)).limit(1);
          if (ex[0]) { skipped++; continue; }
          const allDay = !e.start?.dateTime;
          const start = gDate(e.start) || new Date();
          let end = gDate(e.end) || start;
          if (allDay && end.getTime() > start.getTime()) end = new Date(end.getTime() - 86400000); // Google all-day end is exclusive
          if (end.getTime() < start.getTime()) end = start;
          await db.insert(calendarEvents).values({
            userId: acct.userId || 1, connectedAccountId: acct.id, googleEventId: e.id,
            title: e.summary || "(No title)", description: e.description || "",
            startDate: start, endDate: end,
            isAllDay: allDay, location: e.location || "",
            status: e.status === "cancelled" ? "cancelled" : e.status === "tentative" ? "tentative" : "confirmed",
          });
          inserted++;
        } catch (err) { if (errors.length < 3) errors.push(err instanceof Error ? err.message : String(err)); }
      }
      syncRun = { fetched: items.length, inserted, skipped, errors };
    } catch (e) { syncRun = { error: e instanceof Error ? e.message : String(e) }; }
  }

  // CREDENTIAL CHECK: send a deliberately-bad code to Google's token endpoint
  // with the configured client_id/secret. Google's reply tells us about the
  // CREDENTIAL itself, independent of any reconnect:
  //   invalid_client  → the client_id/secret pair is WRONG (fix the secret)
  //   invalid_grant   → the pair is VALID (it only rejected the fake code) ✓
  // This lets Markie verify the secret is right WITHOUT doing a full reconnect.
  let credentialCheck: any = null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: "figgy_probe_not_a_real_code",
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: googleRedirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    const err = j?.error || "";
    credentialCheck = {
      googleError: err || null,
      secretValid: err === "invalid_grant",            // valid creds → only the fake code is rejected
      secretWrong: err === "invalid_client",           // creds themselves rejected
      verdict:
        err === "invalid_grant" ? "✅ Client ID + secret are CORRECT — connect Google again and it will work."
        : err === "invalid_client" ? "❌ Client ID/secret MISMATCH — the GOOGLE_CLIENT_SECRET in Railway is wrong for this Client ID."
        : `Unexpected: ${err || "no error"}`,
    };
  } catch (e) { credentialCheck = { error: e instanceof Error ? e.message : String(e) }; }

  return c.json({
    build: BUILD_TAG,
    redirectUri: googleRedirectUri(),
    clientId: process.env.GOOGLE_CLIENT_ID || null,
    viteAppUrl: process.env.VITE_APP_URL || null,
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    credentialCheck,
    firmGoogle,
    apiProbe,
    dbCounts,
    syncRun,
    lastConnectAttempt: lastGoogleOAuth,
    note: "credentialCheck.verdict tells you if the secret is right WITHOUT reconnecting. Add ?sync=1 to pull Calendar now.",
  });
});

// QuickBooks readiness check — confirm the prod Intuit app is configured BEFORE
// connecting companies (so tomorrow's payroll-QBO connect isn't blind). No secrets.
app.get("/api/qbo/debug", async (c) => {
  const viteAppUrl = process.env.VITE_APP_URL || null;
  const redirectUri = process.env.QBO_REDIRECT_URI || `${(viteAppUrl || "http://localhost:3000").replace(/\/$/, "")}/api/qbo/callback`;
  let connections: any = null;
  try {
    const db = getDb();
    const rows = await db.select({ id: qboConnections.id, clientId: qboConnections.clientId, realmId: qboConnections.realmId, companyName: qboConnections.companyName, transport: qboConnections.transport, isActive: qboConnections.isActive, reconnectReason: qboConnections.reconnectReason }).from(qboConnections);
    const cl = await db.select({ id: clients.id, name: clients.name, company: clients.company, status: clients.status }).from(clients);
    const byId = new Map((cl as any[]).map((c) => [c.id, c]));
    const tok = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
    connections = (rows as any[]).map((r) => {
      const c = byId.get(r.clientId);
      const ct = new Set(tok(`${c?.name ?? ""} ${c?.company ?? ""}`));
      const matches = tok(r.companyName).some((w) => ct.has(w));
      return { ...r, linkedClientName: c ? (c.name || c.company) : null, linkedClientStatus: c?.status ?? "MISSING", mappingOk: !!c && matches };
    });
  } catch (e) { connections = { error: e instanceof Error ? e.message : String(e) }; }
  return c.json({
    build: BUILD_TAG,
    hasClientId: !!(process.env.QBO_CLIENT_ID || process.env.SANDBOX_QBO_CLIENT_ID),
    hasClientSecret: !!(process.env.QBO_CLIENT_SECRET || process.env.SANDBOX_QBO_CLIENT_SECRET),
    hasTokenKey: !!(process.env.FIGGY_TOKEN_KEY || process.env.APP_SECRET),
    redirectUri,
    connections,
    note: "hasClientId/Secret/TokenKey must all be true and redirectUri must be registered in the Intuit app before connecting. connections lists realms already linked.",
  });
});

// READ-ONLY preview of the Drive timesheet import for a client — finds the newest
// timesheet in the client's Drive folder and parses the names + hours, WITHOUT
// importing anything. Lets Markie confirm Sher-E-Punjab / Auld Spot read correctly.
//   GET /api/payroll/drive-preview?clientId=N
app.get("/api/payroll/drive-preview", async (c) => {
  const clientId = Number(c.req.query("clientId") || 0);
  if (!clientId) return c.json({ error: "pass ?clientId=N (the client's id)" }, 400);
  try {
    const db = getDb();
    const client = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
    if (!client) return c.json({ error: "client not found" }, 404);
    const driveFolderLinked = !!client.driveFolderUrl;
    if (!driveFolderLinked) return c.json({ client: client.name, driveFolderLinked: false, note: "No Drive folder linked yet — the boot linker sets it; check after the latest deploy has booted." });
    const { readNewestTimesheetFromDrive } = await import("./touchbistro-client");
    const { extractTimesheetFromFile } = await import("./timesheet-file-parse");
    const file = await readNewestTimesheetFromDrive(1, client.driveFolderUrl);
    const now = new Date();
    const start = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    const hours = await extractTimesheetFromFile(file.data, file.mediaType, start, end);
    return c.json({
      client: client.name, driveFolderLinked: true,
      fileFound: file.name, mediaType: file.mediaType,
      employeeCount: hours.length,
      employees: hours.map((h: any) => ({ name: h.userName, hours: h.hours, maxShiftHours: h.maxShiftHours })),
      note: "PREVIEW ONLY — nothing imported. Tap 'Import from Drive' on the pay run to bring these in.",
    });
  } catch (e) {
    return c.json({ client: clientId, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});

// Seed/refresh the Clark Collingwood payroll roster on demand (fill-only, safe).
//   GET /api/payroll/seed-collingwood
app.get("/api/payroll/seed-collingwood", async (c) => {
  try {
    const { seedCollingwoodPayroll } = await import("./seed-collingwood-payroll");
    const r = await seedCollingwoodPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Load this period's hours + phone allowances into the open Collingwood draft run.
//   GET /api/payroll/seed-collingwood-run
app.get("/api/payroll/seed-collingwood-run", async (c) => {
  try {
    const { seedCollingwoodRunHours } = await import("./seed-collingwood-run-hours");
    const r = await seedCollingwoodRunHours();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Materialise the recurring payroll reminders (tasks + 4h morning calendar blocks).
//   GET /api/payroll/ensure-reminders
app.get("/api/payroll/ensure-reminders", async (c) => {
  try {
    const { ensurePayrollReminders } = await import("./seed-payroll-recurring");
    const r = await ensurePayrollReminders();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill Sher-E-Punjab pay runs from the Google sheet.
//   GET /api/payroll/backfill-sher
app.get("/api/payroll/backfill-sher", async (c) => {
  try {
    const { backfillSherPayroll } = await import("./seed-sher-backfill");
    const r = await backfillSherPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill Clark Owen Sound pay runs from the Google sheet.
//   GET /api/payroll/backfill-os
app.get("/api/payroll/backfill-os", async (c) => {
  try {
    const { backfillOwenSoundPayroll } = await import("./seed-os-backfill");
    const r = await backfillOwenSoundPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill Clark Collingwood pay runs from the Google sheet.
//   GET /api/payroll/backfill-cw
app.get("/api/payroll/backfill-cw", async (c) => {
  try {
    const { backfillCollingwoodPayroll } = await import("./seed-collingwood-backfill");
    const r = await backfillCollingwoodPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill The Auld Spot Pub pay runs from the Google sheet.
//   GET /api/payroll/backfill-auld
app.get("/api/payroll/backfill-auld", async (c) => {
  try {
    const { backfillAuldPayroll } = await import("./seed-auld-backfill");
    const r = await backfillAuldPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill Originality.AI pay runs (regular + revenue-share) from the Google sheet.
//   GET /api/payroll/backfill-originality
app.get("/api/payroll/backfill-originality", async (c) => {
  try {
    const { backfillOriginalityPayroll } = await import("./seed-originality-backfill");
    const r = await backfillOriginalityPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill 2303851 Ontario Inc (Stacey Gillham salary) from the Google sheet.
//   GET /api/payroll/backfill-2303851
app.get("/api/payroll/backfill-2303851", async (c) => {
  try {
    const { backfill2303851Payroll } = await import("./seed-2303851-backfill");
    const r = await backfill2303851Payroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill Fractal SaaS Inc (Andrew Raines monthly autopay) from the Google sheet.
//   GET /api/payroll/backfill-fractal
app.get("/api/payroll/backfill-fractal", async (c) => {
  try {
    const { backfillFractalPayroll } = await import("./seed-fractal-backfill");
    const r = await backfillFractalPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Backfill Motion Invest Inc (Van Boxmeer + Gunn) from the Google sheet.
//   GET /api/payroll/backfill-motioninvest
app.get("/api/payroll/backfill-motioninvest", async (c) => {
  try {
    const { backfillMotionInvestPayroll } = await import("./seed-motioninvest-backfill");
    const r = await backfillMotionInvestPayroll();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Post the Motion Invest quarterly revenue-share bonus (net-profit based).
//   GET /api/payroll/motioninvest-revshare
app.get("/api/payroll/motioninvest-revshare", async (c) => {
  try {
    const { backfillMotionInvestRevShare } = await import("./seed-motioninvest-revshare");
    const r = await backfillMotionInvestRevShare();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Tag related entities into company groups (e.g. Jon Gillham's portfolio).
//   GET /api/groups/seed
app.get("/api/groups/seed", async (c) => {
  try {
    const { seedCompanyGroups } = await import("./seed-company-groups");
    const r = await seedCompanyGroups();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Flag Go Fig Bookz as the firm self-client (anchors Practice Health).
//   GET /api/firm/seed
app.get("/api/firm/seed", async (c) => {
  try {
    const { seedFirmClient } = await import("./seed-firm-client");
    const r = await seedFirmClient();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Re-date every compliance task (start + due) per the canonical rules and clean
// up junk (inactive-client tasks, auto-paid payroll, dupes).
//   GET /api/tasks/reschedule
app.get("/api/tasks/reschedule", async (c) => {
  try {
    const { rescheduleAndCleanupTasks } = await import("./reschedule-tasks");
    const r = await rescheduleAndCleanupTasks();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Pull Markie's personal records into his private Phoenix hub.
//   GET /api/phoenix/seed
app.get("/api/phoenix/seed", async (c) => {
  try {
    const { ensureLifeSchema } = await import("./ensure-life-schema");
    await ensureLifeSchema();
    const { ensureHealthSchema } = await import("./ensure-health-schema");
    await ensureHealthSchema();
    const { ensurePhoenixSchema } = await import("./ensure-phoenix-schema");
    await ensurePhoenixSchema();
    const { seedPhoenixStarter } = await import("./seed-phoenix-starter");
    await seedPhoenixStarter();
    try {
      const { ensureBrainSchema } = await import("./ensure-brain-schema");
      await ensureBrainSchema();
      const { seedBrain, seedAgentBrain, seedAgentCharter, seedKnowledgeBrain, seedConstitution } = await import("./brain-store");
      await seedBrain();
      await seedAgentBrain();
      await seedAgentCharter();
      await seedKnowledgeBrain();
      await seedConstitution();
      const { seedHeritage, seedHeritageLineage } = await import("./seed-heritage");
      await seedHeritage();
      await seedHeritageLineage();
      // Index the 2026-06-26 strategy session (Innovation Finance) into the firm Brain.
      const { seedStrategySession } = await import("./seed-strategy-session");
      await seedStrategySession();
      // Give Skye the Rose reselling package + process (personal/discreet).
      const { seedRoseReselling } = await import("./seed-rose-reselling");
      await seedRoseReselling();
      // Quarterly reminder for Liv to request Alderson's mailed bank activity.
      const { seedAldersonRecurring } = await import("./seed-alderson-recurring");
      await seedAldersonRecurring();
      // Rocco group (Ovita/Alderson): HST periods follow the FISCAL year (Nov 30 → Q2 = Mar–May).
      const { seedRoccoHst } = await import("./seed-rocco-hst");
      await seedRoccoHst();
      // Alderson → Ovita Holdings inter-company recharge: config + quarterly reconcile task.
      const { seedAldersonRecharge } = await import("./seed-alderson-recharge");
      await seedAldersonRecharge();
      // Genealogy: confidence-rated tree + monthly auto-scan + share links.
      const { ensureGenealogySchema } = await import("./ensure-genealogy-schema");
      await ensureGenealogySchema();
      const { backfillGenealogyFields } = await import("./genealogy-scan");
      { // backfill proof/confidence/parent links for every owner who has a tree
        const owners = (await getDb().all(sql`SELECT DISTINCT userId FROM family_members`)) as any[];
        for (const o of owners) await backfillGenealogyFields(o.userId);
      }
      const { ensureLaunchpadSchema } = await import("./ensure-launchpad-schema");
      await ensureLaunchpadSchema();
      const { ensureSubscriptionsSchema } = await import("./ensure-subscriptions-schema");
      await ensureSubscriptionsSchema();
      const { ensureRegistersSchema } = await import("./ensure-registers-schema");
      await ensureRegistersSchema();
      const { seedEngineeringAudit } = await import("./seed-engineering-audit");
      await seedEngineeringAudit();
      const { ensureMarketingSchema, seedMarketing } = await import("./ensure-marketing-schema");
      await ensureMarketingSchema();
      await seedMarketing();
    } catch (e) { console.error("[brain] schema/seed failed (continuing):", e instanceof Error ? e.message : e); }
    const { seedPhoenixPersonal } = await import("./seed-phoenix-personal");
    const r = await seedPhoenixPersonal();
    const { seedPhoenixPersonalV2 } = await import("./seed-phoenix-personal-v2");
    const r2 = await seedPhoenixPersonalV2();
    return c.json({ ok: true, v1: r, v2: r2 });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Recreate Jon Gillham's control book (force = wipe + re-seed from source figures).
//   GET /api/group-book/seed?force=1
app.get("/api/group-book/seed", async (c) => {
  try {
    const { ensureGroupBookTables } = await import("./ensure-group-book-schema");
    await ensureGroupBookTables();
    const { seedJonControlBook } = await import("./seed-jon-control-book");
    const force = c.req.query("force") === "1" || c.req.query("force") === "true";
    const r = await seedJonControlBook({ force });
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Scaffold the interco tracker — current-month period shell per group payer.
//   GET /api/interco/scaffold
app.get("/api/interco/scaffold", async (c) => {
  try {
    const { seedIntercoScaffold } = await import("./seed-interco-scaffold");
    const r = await seedIntercoScaffold();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// Dedup + name-correct the Clark/Sher rosters (merge dupes, fix Last, First).
//   GET /api/payroll/dedup-employees
app.get("/api/payroll/dedup-employees", async (c) => {
  try {
    const { dedupEmployees } = await import("./seed-employee-dedup");
    const r = await dedupEmployees();
    return c.json({ ok: true, ...r });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
// a RAW ProfitAndLoss sample for the first client-bound connection so the report
// parser can be hardened against the real shape. Read-only against QBO.
//   GET /api/qbo/sync-now[?raw=1]
app.get("/api/qbo/sync-now", async (c) => {
  try {
    const { runQboSync } = await import("./qbo-snapshot");
    const r = await runQboSync();
    let plSample: any = undefined;
    if (c.req.query("raw") === "1") {
      try {
        const db = getDb();
        const conn = (await db.select().from(qboConnections).where(and(eq(qboConnections.isActive, true))))
          .find((x: any) => x.clientId != null);
        if (conn) {
          const { qboRequest } = await import("./qbo-router");
          const now = new Date();
          const start = `${now.getFullYear()}-01-01`;
          const end = now.toISOString().slice(0, 10);
          plSample = { company: (conn as any).companyName, report: await qboRequest(conn as any, `/reports/ProfitAndLoss?start_date=${start}&end_date=${end}`) };
        }
      } catch (e) { plSample = { error: e instanceof Error ? e.message : String(e) }; }
    }
    return c.json({ build: BUILD_TAG, ...r, plSample });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

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
// JOBBER OAUTH — timesheet-hours import per client
//   GET /api/jobber/connect?clientId=123  → Jobber authorize
//   GET /api/jobber/callback              → exchange + persist
// ================================================================
app.get("/api/jobber/connect", async (c) => {
  const { buildAuthorizeUrl, jobberConfigured } = await import("./jobber-oauth");
  if (!(await jobberConfigured())) return c.redirect("/payroll?error=jobber_not_configured", 302);
  const cid = c.req.query("clientId");
  const clientId = cid && /^\d+$/.test(cid) ? Number(cid) : null;
  if (!clientId) return c.redirect("/payroll?error=missing_client", 302);
  return c.redirect(await buildAuthorizeUrl(clientId), 302);
});
app.get("/api/jobber/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  if (error) return c.redirect("/payroll?error=" + encodeURIComponent(error), 302);
  if (!code || !state) return c.redirect("/payroll?error=missing_params", 302);
  try {
    const { exchangeAndPersist } = await import("./jobber-oauth");
    await exchangeAndPersist({ code, stateRaw: state });
    return c.redirect("/payroll?success=jobber_connected", 302);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.error("[Jobber OAuth] callback failed:", m);
    return c.redirect("/payroll?error=" + encodeURIComponent(m), 302);
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
    const { googleRedirectUri } = await import("./google-redirect");
    const redirectUri = googleRedirectUri();

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

    // Get user info (best-effort — never let a userinfo hiccup lose the tokens).
    let userInfo: any = {};
    try {
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      userInfo = await userInfoResponse.json();
    } catch { /* keep going with empty userInfo */ }

    // Make sure the table has every column the insert writes (a missing column
    // is a silent "no such column" that would bounce the user back with no row).
    try {
      const { ensureConnectorsSchema } = await import("./ensure-connectors-schema");
      await ensureConnectorsSchema();
    } catch (e) {
      console.error("[Google OAuth] ensureConnectorsSchema failed (continuing):", e instanceof Error ? e.message : e);
    }

    const db = getDb();
    const userId = stateData.userId || 1;
    // Upsert: clear any prior Google row for this user (same account or relinks)
    // so repeated "Connect" clicks don't error on a unique/duplicate and tokens
    // always refresh to the latest grant.
    try {
      await db.delete(connectedAccounts).where(
        and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.provider, "google")),
      );
    } catch (e) {
      console.error("[Google OAuth] clear prior google rows failed (continuing):", e instanceof Error ? e.message : e);
    }
    // Insert ONLY the columns the live table actually has — bulletproof against
    // schema drift (the real cause of the silent insert failure). Timestamps are
    // epoch SECONDS to match Drizzle's {mode:"timestamp"} columns.
    const nowSec = Math.floor(Date.now() / 1000);
    const candidate: Record<string, any> = {
      userId,
      provider: "google",
      // Never null — live table has a NOT NULL constraint here. Fall back to the
      // email or a synthetic id if Google didn't return a profile.
      providerAccountId: userInfo.id ?? userInfo.email ?? `google:${userId}`,
      accountLabel: stateData.accountLabel || "Google",
      accountEmail: userInfo.email ?? "markie@gofig.ca",
      accessToken: tokenData.access_token ?? null,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt: tokenData.expires_in ? nowSec + Number(tokenData.expires_in) : null,
      scopes: tokenData.scope ?? null,
      isActive: 1,
      syncEnabled: JSON.stringify({ email: true, calendar: true, files: true, tasks: true }),
      createdAt: nowSec,
      updatedAt: nowSec,
    };
    const tableInfo: any = await db.run(sql`PRAGMA table_info(connected_accounts)`);
    const liveCols = new Set<string>();
    for (const r of (tableInfo?.rows ?? tableInfo ?? [])) liveCols.add(String((r as any).name ?? (r as any)[1] ?? ""));
    const useCols = Object.keys(candidate).filter((c) => liveCols.has(c));
    const colsSql = sql.raw(useCols.map((c) => `"${c}"`).join(", "));
    const valsSql = sql.join(useCols.map((c) => sql`${candidate[c]}`), sql`, `);
    await db.run(sql`INSERT INTO connected_accounts (${colsSql}) VALUES (${valsSql})`);

    lastGoogleOAuth = { ok: true, at: new Date().toISOString(), email: userInfo.email, userId };
    return c.redirect("/integrations?success=google_connected", 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = (err as any)?.cause;
    const detail = cause ? ` || cause: ${cause.message || String(cause)}` : "";
    console.error("[Google OAuth] callback failed:", message + detail);
    lastGoogleOAuth = { ok: false, at: new Date().toISOString(), error: message + detail };
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
    const redirectUri = `${process.env.VITE_APP_URL || "https://figgy.gofig.ca"}/api/oauth/microsoft/callback`;

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
        agentName: "Figs",
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
      agentName: "Figs",
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

// PUBLIC website lead capture — the gofig.ca inquiry form (or a Make webhook)
// POSTs simple JSON here. Creates a lead (new_lead) + mirrors it to the Leads tab.
// CORS already allows gofig.ca; no auth (public form). Honeypot field "_hp" drops bots.
app.post("/api/lead", async (c) => {
  try {
    const b = await c.req.json().catch(() => ({}));
    if (b._hp) return c.json({ success: true }); // bot honeypot → silently accept
    const name = String(b.name || b.fullName || "").trim();
    const email = String(b.email || "").trim();
    if (!name && !email) return c.json({ success: false, error: "name or email required" }, 400);
    const db = getDb();
    const { workflowLogs } = await import("../db/schema");
    const { syncLeadToMaster } = await import("./master-sheet-sync");
    const res = await db.insert(clients).values({
      userId: 1,
      name: name || email,
      email,
      phone: String(b.phone || "").trim() || null,
      company: String(b.company || b.business || "").trim() || null,
      website: String(b.website || "").trim() || null,
      status: "lead",
      workflowStatus: "new_lead",
      leadSource: String(b.source || "website").trim() || "website",
      painPoints: String(b.message || b.inquiry || b.notes || "").trim() || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: clients.id });
    const clientId = res[0]?.id;
    if (clientId) {
      await db.insert(workflowLogs).values({
        clientId, fromStatus: null, toStatus: "new_lead",
        action: "website_lead_created", notes: `Source: ${String(b.source || "website")}`,
        createdAt: new Date(),
      });
      const lead = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0];
      if (lead) syncLeadToMaster(lead as any);
    }
    return c.json({ success: true, clientId });
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
    const { checkSecret } = await import("./lib/admin-auth");
    if (!checkSecret(body.token, "BULK_IMPORT_TOKEN")) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const db = getDb();
    const { clients } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const { ensureComplianceForClient } = await import("./task-generator");

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
          const taskResult = await ensureComplianceForClient(client.id, { userId: 1, assignedTo: clientData.assignedTo });
          results.tasksCreated += taskResult?.tasks || 0;
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
// Inbound SMS from the Android gateway app (capcom6/android-sms-gateway-style).
// Accepts the common shapes: {payload:{message,phoneNumber}} or {message,from}.
app.post("/api/sms/inbound", async (c) => {
  const secret = c.req.header("x-sms-secret") || c.req.query("secret") || "";
  if (secret !== (process.env.SMS_WEBHOOK_SECRET || "figgy-sms-2026")) {
    return c.json({ success: false, error: "Invalid SMS secret" }, 401);
  }
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  try {
    const { ingestInboundSms } = await import("./message-router");
    const p = body?.payload ?? body ?? {};
    const from = String(p.phoneNumber ?? p.from ?? p.address ?? p.sender ?? "");
    const text = String(p.message ?? p.text ?? p.body ?? "");
    const externalId = p.messageId ?? p.id ?? null;
    if (!from || !text) return c.json({ success: false, error: "missing from/message" }, 400);
    const saved = await ingestInboundSms(from, text, externalId);
    return c.json({ success: true, id: saved?.id ?? null });
  } catch (e) {
    console.error("[sms] inbound failed:", e instanceof Error ? e.message : e);
    return c.json({ success: false, error: "ingest failed" }, 500);
  }
});

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
    if (op === "seedEmployees") {
      const { seedPayrollEmployees } = await import("./seed-payroll-employees");
      return c.json({ success: true, op, ...(await seedPayrollEmployees()) });
    }
    if (op === "tasks") {
      // Read-only: diagnose why the calendar may look empty — how many tasks
      // exist, how many have due dates, completion split, and a small sample.
      const { getDb } = await import("./queries/connection");
      const { tasks } = await import("../db/schema");
      const db = getDb();
      const all = await db.select().from(tasks);
      const withDue = (all as any[]).filter((t) => t.dueDate != null);
      const openWithDue = withDue.filter((t) => !t.completed);
      const sample = (all as any[]).slice(0, 15).map((t) => ({
        id: t.id, title: t.title, clientId: t.clientId, dueDate: t.dueDate,
        completed: t.completed, status: t.status, stage: t.stage, userId: t.userId,
      }));
      return c.json({
        success: true, op, total: all.length,
        withDueDate: withDue.length, openWithDueDate: openWithDue.length,
        completed: (all as any[]).filter((t) => t.completed).length,
        sample,
      });
    }
    if (op === "backfillDueDates") {
      // One-shot: give every open task that has NO due date a sensible date so
      // it shows on the calendar. Spreads them across the next 10 business-ish
      // days by client so they don't all stack on today.
      const { getDb } = await import("./queries/connection");
      const { tasks } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");
      const db = getDb();
      const all = await db.select().from(tasks);
      const open = (all as any[]).filter((t) => !t.completed && t.dueDate == null);
      let i = 0; const updated: number[] = [];
      for (const t of open) {
        const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + (i % 10) + 1);
        await db.update(tasks).set({ dueDate: d }).where(eq(tasks.id, t.id));
        updated.push(t.id); i++;
      }
      return c.json({ success: true, op, updated: updated.length });
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
  const handle = () => fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
  // Demo requests run against a SEPARATE demo.db — never the real books.
  const isDemo = c.req.header("x-demo-mode") === "true";
  return isDemo ? dbContext.run({ demo: true }, handle) : handle();
});

// ── FIGS AT WORK — browser agent (Stage 1). Admin-only + dormant unless
// FIGGY_BROWSER_AGENT=on. Drives a single capped Chromium session Markie watches. ──
async function requireAdmin(c: any): Promise<boolean> {
  try {
    const ctx = await createContext({ req: c.req.raw } as any);
    return ctx?.user?.role === "admin";
  } catch { return false; }
}
app.get("/api/figs-browser/status", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  const { sessionInfo } = await import("./browser-agent");
  return c.json(await sessionInfo());
});
// In-app on/off switch for Figs' browser (so Markie never has to touch Railway).
app.post("/api/figs-browser/enable", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const b = await c.req.json().catch(() => ({}));
    const { setBrowserEnabled, isBrowserEnabled } = await import("./browser-agent");
    await setBrowserEnabled(!!b?.on);
    return c.json({ ok: true, enabled: await isBrowserEnabled() });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/start", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try { const { ensureSession } = await import("./browser-agent"); await ensureSession(); return c.json({ ok: true }); }
  catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/goto", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try { const { goto } = await import("./browser-agent"); const { url } = await c.req.json(); return c.json(await goto(String(url || ""))); }
  catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.get("/api/figs-browser/screenshot", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { screenshot } = await import("./browser-agent");
    const png = await screenshot();
    return new Response(png as any, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/act", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { click, type, pressKey } = await import("./browser-agent");
    const body = await c.req.json();
    if (body.action === "click") await click(Number(body.x), Number(body.y));
    else if (body.action === "type") await type(String(body.text || ""));
    else if (body.action === "key") await pressKey(String(body.key || "Enter"));
    else return c.json({ ok: false, error: "unknown action" }, 200);
    return c.json({ ok: true });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/stop", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  const { stopSession } = await import("./browser-agent");
  await stopSession("user stop");
  return c.json({ ok: true });
});

// ── Figs' login vault (Stage 2) — admin only; secrets encrypted at rest. ──
app.get("/api/figs-browser/credentials", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { listCredentials } = await import("./browser-credentials");
    return c.json({ ok: true, credentials: await listCredentials() });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e), credentials: [] }, 200); }
});
app.post("/api/figs-browser/credentials", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { saveCredential } = await import("./browser-credentials");
    const b = await c.req.json();
    if (!b?.username || !b?.password || !b?.provider) return c.json({ ok: false, error: "provider, username, password required" }, 200);
    const res = await saveCredential({
      provider: String(b.provider), label: b.label ?? null, clientId: b.clientId ?? null,
      loginUrl: b.loginUrl ?? null, username: String(b.username), password: String(b.password),
    });
    return c.json({ ok: true, ...res });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/credentials/delete", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { deleteCredential } = await import("./browser-credentials");
    const b = await c.req.json();
    await deleteCredential(Number(b?.id));
    return c.json({ ok: true });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/login", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { getDecryptedCredential, markCredentialUsed } = await import("./browser-credentials");
    const { loginWithCredential } = await import("./browser-agent");
    const b = await c.req.json();
    const cred = await getDecryptedCredential(Number(b?.id));
    if (!cred) return c.json({ ok: false, error: "credential not found" }, 200);
    const res = await loginWithCredential(cred);
    await markCredentialUsed(Number(b?.id));
    return c.json({ ok: true, ...res });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});

// ── Stage 3: the browser BRAIN (supervised computer-use autopilot). Admin only. ──
app.get("/api/figs-browser/brain/status", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try { const { brainStatus } = await import("./browser-brain"); return c.json(brainStatus()); }
  catch (e) { return c.json({ active: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/brain/start", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { startBrain, advanceBrain } = await import("./browser-brain");
    const { goal } = await c.req.json();
    if (!goal) return c.json({ ok: false, error: "goal required" }, 200);
    await startBrain(String(goal));
    advanceBrain().catch((e) => console.error("[figs-brain] advance failed:", e instanceof Error ? e.message : e));
    return c.json({ ok: true });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/brain/start-routine", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try {
    const { clientId } = await c.req.json();
    const db = getDb();
    const rows = (await db.all(sql.raw(`SELECT name, company, qboRealmId, usesHubdoc, bankSource, workflowNotes FROM clients WHERE id = ${Number(clientId)} LIMIT 1`))) as any[];
    const cl = rows[0];
    if (!cl) return c.json({ ok: false, error: "client not found" }, 200);
    const name = cl.company || cl.name;
    const parts: string[] = [`Do the morning bookkeeping routine for ${name}.`];
    if (cl.usesHubdoc) parts.push("Start in Hubdoc: process the receipts and publish the ones you're confident on; flag anything unsure to Ask Markie.");
    parts.push("Then go into QuickBooks and match the posted transactions in the bank feed.");
    if (cl.bankSource === "manual") parts.push("This client sends MANUAL statements (no live bank feed) — key in the bank/credit-card transactions from the statement.");
    else parts.push("Post any prior-month bank and credit-card feed transactions needed to close the month, then reconcile each account and attach the statement to the reconciliation report.");
    if (cl.workflowNotes) parts.push(`Client notes: ${cl.workflowNotes}`);
    parts.push("Ask my approval before anything that publishes, posts, or reconciles.");
    const goal = parts.join(" ");
    const { startBrain, advanceBrain } = await import("./browser-brain");
    await startBrain(goal);
    advanceBrain().catch((e) => console.error("[figs-brain] routine advance failed:", e instanceof Error ? e.message : e));
    return c.json({ ok: true, goal });
  } catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/brain/continue", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try { const { advanceBrain } = await import("./browser-brain"); advanceBrain().catch(() => {}); return c.json({ ok: true }); }
  catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/brain/approve", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try { const { approvePending } = await import("./browser-brain"); approvePending().catch((e) => console.error("[figs-brain] approve:", e)); return c.json({ ok: true }); }
  catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/brain/deny", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try { const { denyPending } = await import("./browser-brain"); const b = await c.req.json().catch(() => ({})); denyPending(b?.note).catch((e) => console.error("[figs-brain] deny:", e)); return c.json({ ok: true }); }
  catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});
app.post("/api/figs-browser/brain/stop", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  try { const { stopBrain } = await import("./browser-brain"); stopBrain(); return c.json({ ok: true }); }
  catch (e) { return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200); }
});

// ── FIGS CHROME EXTENSION (runs in Markie's REAL, logged-in browser) ──────────
// The extension is the eyes+hands; api/figs-ext-brain.ts is the brain. Auth is a
// shared token (cross-origin from his Chrome → no cookie reliance). CORS is open
// on these routes because a browser extension calls them.
async function getExtToken(create = false): Promise<string> {
  const { getDb } = await import("./queries/connection");
  const { appSettings } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const row = await db.select().from(appSettings).where(eq(appSettings.key, "figs_ext_token")).limit(1);
  if ((row[0] as any)?.value) return (row[0] as any).value;
  if (!create) return "";
  const tok = "fxt_" + (await import("crypto")).randomBytes(24).toString("hex");
  await db.insert(appSettings).values({ key: "figs_ext_token", value: tok });
  return tok;
}
async function requireExtToken(c: any): Promise<boolean> {
  const tok = c.req.header("x-figs-token") || "";
  if (!tok) return false;
  const real = await getExtToken(false);
  return !!real && tok === real;
}
const extCors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,x-figs-token", "Access-Control-Allow-Methods": "POST,GET,OPTIONS" };
app.options("/api/figs-ext/*", (c) => new Response(null, { status: 204, headers: extCors }));
// Admin: mint/show the token to paste into the extension once.
app.get("/api/figs-ext/token", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);
  return c.json({ token: await getExtToken(true) });
});
app.post("/api/figs-ext/start", async (c) => {
  if (!(await requireExtToken(c))) return c.json({ error: "bad token" }, 401, extCors);
  try { const b = await c.req.json(); const { extStart } = await import("./figs-ext-brain"); return c.json(extStart(String(b?.goal || "")), 200, extCors); }
  catch (e) { return c.json({ error: e instanceof Error ? e.message : String(e) }, 200, extCors); }
});
app.post("/api/figs-ext/step", async (c) => {
  if (!(await requireExtToken(c))) return c.json({ error: "bad token" }, 401, extCors);
  try { const b = await c.req.json(); const { extStep } = await import("./figs-ext-brain"); return c.json(await extStep(String(b?.sessionId), String(b?.shot || ""), b?.elements || [], String(b?.pageText || "")), 200, extCors); }
  catch (e) { return c.json({ error: e instanceof Error ? e.message : String(e) }, 200, extCors); }
});
app.post("/api/figs-ext/approve", async (c) => {
  if (!(await requireExtToken(c))) return c.json({ error: "bad token" }, 401, extCors);
  try { const b = await c.req.json(); const { extApprove } = await import("./figs-ext-brain"); return c.json(await extApprove(String(b?.sessionId)), 200, extCors); }
  catch (e) { return c.json({ error: e instanceof Error ? e.message : String(e) }, 200, extCors); }
});
app.post("/api/figs-ext/deny", async (c) => {
  if (!(await requireExtToken(c))) return c.json({ error: "bad token" }, 401, extCors);
  try { const b = await c.req.json(); const { extDeny } = await import("./figs-ext-brain"); return c.json(await extDeny(String(b?.sessionId), b?.note), 200, extCors); }
  catch (e) { return c.json({ error: e instanceof Error ? e.message : String(e) }, 200, extCors); }
});
app.post("/api/figs-ext/stop", async (c) => {
  if (!(await requireExtToken(c))) return c.json({ error: "bad token" }, 401, extCors);
  try { const b = await c.req.json(); const { extStop } = await import("./figs-ext-brain"); return c.json(extStop(String(b?.sessionId)), 200, extCors); }
  catch (e) { return c.json({ error: e instanceof Error ? e.message : String(e) }, 200, extCors); }
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

async function startServer() {
  console.log(`[BOOT] gfb-crm starting — build ${BUILD_TAG} (realm-id column early-guard fix)`);
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  // CRITICAL, must run before anything reads `clients`: the live DB's clients
  // table is missing columns the app SELECTs, which makes every read throw (empty
  // Clients page). Add any missing columns first.
  try {
    const { ensureClientsColumns, ensureOnboardingColumns, ensureTaskColumns, ensurePayrollTables, ensureClientRequestTables, ensureSmsTable, ensureIntercoTables, ensurePracticeSnapshotsTable } = await import("./ensure-clients-schema");
    await ensureClientsColumns();
    await ensureOnboardingColumns();
    await ensureTaskColumns();
    await ensurePayrollTables();
    await ensureClientRequestTables();
    await ensureSmsTable();
    await ensureIntercoTables();
    await ensurePracticeSnapshotsTable();
    const { ensureGroupBookTables } = await import("./ensure-group-book-schema");
    await ensureGroupBookTables();
    const { ensureRbacSchema } = await import("./ensure-rbac-schema");
    await ensureRbacSchema();
    // Owner (Markie) is always admin — he was stuck as senior_bookkeeper with no
    // way to self-promote (changing your own role needs admin).
    const { ensureOwnerAdmin } = await import("./ensure-owner-admin");
    await ensureOwnerAdmin();
    // Zero-touch token-encryption key: if no FIGGY_TOKEN_KEY/APP_SECRET env is set,
    // generate + persist one so QBO tokens are encrypted without manual config.
    try {
      const { ensureTokenKey } = await import("./qbo-oauth");
      const src = await ensureTokenKey();
      if (src !== "env") console.log(`[qbo-oauth] token key ready (${src})`);
    } catch (e) { console.error("[qbo-oauth] ensureTokenKey boot failed:", e instanceof Error ? e.message : e); }
    const { ensurePersonalSchema } = await import("./ensure-personal-schema");
    await ensurePersonalSchema();
    const { ensureLifeSchema } = await import("./ensure-life-schema");
    await ensureLifeSchema();
    const { ensureLearningSchema } = await import("./ensure-learning-schema");
    await ensureLearningSchema();
    const { ensureAuditSchema } = await import("./ensure-audit-schema");
    await ensureAuditSchema();
    const { ensureChatSchema } = await import("./ensure-chat-schema");
    await ensureChatSchema();
    const { ensureConnectorsSchema } = await import("./ensure-connectors-schema");
    await ensureConnectorsSchema();
    const { ensureCalendarSchema } = await import("./ensure-calendar-schema");
    await ensureCalendarSchema();
    const { ensureCashflowSchema } = await import("./ensure-cashflow-schema");
    await ensureCashflowSchema();
    const { ensureRateHistorySchema } = await import("./ensure-rate-history-schema");
    await ensureRateHistorySchema();
    const { ensureEmployeeSchema } = await import("./ensure-employee-schema");
    await ensureEmployeeSchema();
    const { ensureEmployeeYtdColumns } = await import("./ensure-employee-ytd-schema");
    await ensureEmployeeYtdColumns();
    const { ensureRevRecSchema } = await import("./ensure-revrec-schema");
    await ensureRevRecSchema();
    const { ensureBankedHoursSchema } = await import("./ensure-banked-hours-schema");
    await ensureBankedHoursSchema();
    const { ensureLoanSchema } = await import("./ensure-loan-schema");
    await ensureLoanSchema();
    // Genealogy: make sure family_members + the tree/scan/share columns & tables
    // exist at startup (idempotent) so the family-tree router is safe even before
    // /api/phoenix/seed runs.
    try {
      const { ensurePhoenixSchema } = await import("./ensure-phoenix-schema");
      await ensurePhoenixSchema();
      const { ensureGenealogySchema } = await import("./ensure-genealogy-schema");
      await ensureGenealogySchema();
      const { backfillGenealogyFields } = await import("./genealogy-scan");
      const { getDb: _g } = await import("./queries/connection");
      const { sql: _s } = await import("drizzle-orm");
      const owners = (await _g().all(_s`SELECT DISTINCT userId FROM family_members`)) as any[];
      for (const o of owners) await backfillGenealogyFields(o.userId);
    } catch (e) { console.error("[genealogy] startup schema/backfill failed:", e instanceof Error ? e.message : e); }
    // Repair legacy date rows stored in MILLISECONDS in a seconds column (they
    // render as year ~58000). Anything above year-2100-in-seconds is really ms → ÷1000.
    try {
      const { getDb } = await import("./queries/connection");
      const { sql } = await import("drizzle-orm");
      const db = getDb();
      const THRESH = 4102444800; // 2100-01-01 in epoch SECONDS
      for (const [t, cols] of [
        ["tasks", ["dueDate", "completedAt", "createdAt", "updatedAt"]],
        ["recurring_tasks", ["nextDueDate", "startDate", "endDate", "createdAt", "updatedAt"]],
        ["client_task_rules", ["nextDueDate", "lastRunAt", "createdAt", "updatedAt"]],
      ] as Array<[string, string[]]>) {
        for (const col of cols) {
          try { await db.run(sql.raw(`UPDATE ${t} SET "${col}" = "${col}"/1000 WHERE "${col}" > ${THRESH}`)); } catch { /* col may not exist */ }
        }
      }
    } catch (e) { console.error("[repair] task date repair failed (non-fatal):", e instanceof Error ? e.message : e); }
    // Numbered-company display: show the operating name first, numbered legal
    // entity second (e.g. "Sher-E-Punjab (1001196626 Ontario Ltd.)"). Idempotent.
    try {
      const { getDb } = await import("./queries/connection");
      const { clients } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");
      const { reorderNumberedName } = await import("./client-name");
      const db = getDb();
      const rows = (await db.select().from(clients)) as any[];
      for (const cl of rows) {
        const patch: Record<string, string> = {};
        const newName = reorderNumberedName(cl.name);
        if (newName && newName !== cl.name) patch.name = newName;
        const newCompany = reorderNumberedName(cl.company);
        if (newCompany && newCompany !== cl.company) patch.company = newCompany;
        if (Object.keys(patch).length) {
          try { await db.update(clients).set(patch).where(eq(clients.id, cl.id)); } catch { /* ignore per-row */ }
        }
      }
    } catch (e) { console.error("[repair] client name reorder failed (non-fatal):", e instanceof Error ? e.message : e); }
    // Doc Kings is a flow-through / wholesale-billing client (we just resell the
    // QBO subscription) — mark it wholesale and pause any compliance tasks that
    // were generated before the clientType existed. Idempotent.
    try {
      const { getDb } = await import("./queries/connection");
      const { clients, tasks, clientTaskRules } = await import("../db/schema");
      const { eq, and, ne, like } = await import("drizzle-orm");
      const db = getDb();
      const matches = (await db.select().from(clients).where(like(clients.name, "%Doc King%"))) as any[];
      for (const cl of matches) {
        if (cl.clientType !== "wholesale") {
          await db.update(clients).set({ clientType: "wholesale" }).where(eq(clients.id, cl.id));
        }
        // Pause its rules + delete open tasks (tasks have no active column).
        await db.update(clientTaskRules).set({ active: false }).where(eq(clientTaskRules.clientId, cl.id));
        await db.delete(tasks).where(and(eq(tasks.clientId, cl.id), ne(tasks.status, "completed")));
      }
    } catch (e) { console.error("[normalize] Doc Kings wholesale failed (non-fatal):", e instanceof Error ? e.message : e); }
    // Seed client-level payroll features for the clients we know use them, so the
    // pay run surfaces the right components on deploy. Only fills flags that are
    // still null/0 → never overrides a choice made in the UI. Idempotent.
    try {
      const { getDb } = await import("./queries/connection");
      const { clients, employees } = await import("../db/schema");
      const { eq, and, like, isNull } = await import("drizzle-orm");
      const db = getDb();
      const setFlags = async (nameLike: string, flags: Record<string, number>) => {
        const matches = (await db.select().from(clients).where(like(clients.name, nameLike))) as any[];
        for (const cl of matches) {
          const patch: Record<string, number> = {};
          for (const [k, v] of Object.entries(flags)) if (!cl[k]) patch[k] = v;
          if (Object.keys(patch).length) await db.update(clients).set(patch).where(eq(clients.id, cl.id));
        }
        return matches;
      };
      // Clark Collingwood (Clark Pools): dividends, phone allowance, reimbursements.
      // NOTE: Clark Pools is hourly/Jobber — NO share-bonus / revenue-share column
      // (Markie 2026-06-22). bonuses + revenue-share intentionally NOT seeded here.
      const cw = await setFlags("%Collingwood%", {
        payrollDividends: 1, payrollPhoneAllowance: 1, payrollReimbursements: 1,
      });
      // ONE-TIME corrective — SHARE BONUS / REVENUE SHARE IS ORIGINALITY-ONLY.
      // (Markie, confirmed repeatedly: Originality is the ONLY client with a share
      // bonus. No other client — incl. Clark Pools — gets the column.) Clears the
      // flags on every non-Originality client. Guarded by a marker so it runs once
      // and never fights a deliberate re-enable from the UI.
      try {
        const { appSettings } = await import("../db/schema");
        const marker = await db.select().from(appSettings).where(eq(appSettings.key, "fix_sharebonus_originality_only_v1")).limit(1);
        if (!marker[0]) {
          const all = (await db.select().from(clients)) as any[];
          for (const cl of all) {
            if (/originality/i.test(cl.name || "")) continue; // Originality keeps it
            if (cl.payrollBonuses || cl.payrollRevenueShare) {
              await db.update(clients).set({ payrollBonuses: 0, payrollRevenueShare: 0 } as any).where(eq(clients.id, cl.id));
            }
          }
          await db.insert(appSettings).values({ key: "fix_sharebonus_originality_only_v1", value: new Date().toISOString() });
        }
      } catch (e) { console.error("[normalize] share-bonus originality-only corrective failed (non-fatal):", e instanceof Error ? e.message : e); }
      // Dividends feature on → ensure the T5 filing task exists (idempotent;
      // unified rule engine — one task system, dedups by ruleType).
      const { ensureComplianceForClient } = await import("./task-generator");
      for (const cl of cw) {
        await ensureComplianceForClient(cl.id, { userId: (cl as any).userId || 1, assignedTo: (cl as any).assignedTo });
      }
      // Originality: revenue share + CRA comparison.
      const orig = await setFlags("%Originality%", { payrollRevenueShare: 1, payrollCraComparison: 1 });
      // Seed Originality's 2026 YTD gross carryforward (from their payroll sheet,
      // as of the Jun 15 2026 run) so the CRA calc maxes CPP/EI correctly. Only
      // fills employees whose opening is still null. Matched by last name.
      const origYtd: Record<string, number> = {
        Gillham: 160409.60, Tran: 69565.28, Bejtic: 60366.67, Watt: 54801.50,
        "Lambert-Taylor": 53279.90, Bhagawati: 47909.94, "Mc Nally": 46951.80,
        Empey: 31939.97, Shafie: 30805.25, Bongiorno: 55778.38,
      };
      for (const cl of orig) {
        for (const [last, ytd] of Object.entries(origYtd)) {
          await db.update(employees).set({ ytdGrossOpening: ytd })
            .where(and(eq(employees.clientId, cl.id), like(employees.lastName, last), isNull(employees.ytdGrossOpening)));
        }
      }
    } catch (e) { console.error("[normalize] payroll features seed failed (non-fatal):", e instanceof Error ? e.message : e); }
    // SINs are stored ENCRYPTED at rest (revealed only via the FIGGY_SIN_PIN
    // code gate). Encrypt any legacy plaintext SINs in place. Idempotent.
    try {
      const { getDb } = await import("./queries/connection");
      const { employees } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");
      const { encryptSecret, isEncrypted } = await import("./sensitive");
      const db = getDb();
      const rows = (await db.select().from(employees)) as any[];
      for (const e of rows) {
        if (e.sin && !isEncrypted(e.sin)) {
          await db.update(employees).set({ sin: encryptSecret(String(e.sin)) }).where(eq(employees.id, e.id));
        }
      }
    } catch (e) { console.error("[privacy] SIN encrypt-at-rest failed (non-fatal):", e instanceof Error ? e.message : e); }
    if (process.env.FIGGY_SKIP_EMPLOYEE_SEED !== "on") {
      try { const { seedPayrollEmployees } = await import("./seed-payroll-employees"); const r = await seedPayrollEmployees(); console.log("[seed] payroll employees:", JSON.stringify(r)); }
      catch (e) { console.error("[seed] payroll employees failed (non-fatal):", e instanceof Error ? e.message : e); }
    }
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
    try {
      const { seedAiAgents } = await import("./seed-ai-agents");
      await seedAiAgents();
    } catch (e) {
      console.error("[seed] seedAiAgents failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { seedHstDates } = await import("./seed-hst-dates");
      const h = await seedHstDates();
      console.log(`[seed] HST sheet dates: ${h.updated} clients, ${h.tasks} tasks dated`);
    } catch (e) {
      console.error("[seed] seedHstDates failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { seedClientWebsites } = await import("./seed-client-websites");
      const w = await seedClientWebsites();
      console.log(`[seed] client websites: ${w.filled} filled from email domains`);
    } catch (e) {
      console.error("[seed] seedClientWebsites failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { seedGovRegistry } = await import("./seed-gov-registry");
      const g = await seedGovRegistry();
      console.log(`[seed] gov registry: ${g.patched}/${g.matched} client cards populated (bio/registry#/incorp/corp type/status)`);
    } catch (e) {
      console.error("[seed] seedGovRegistry failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { seedTriageEmails } = await import("./seed-triage-emails");
      const te = await seedTriageEmails();
      if (te.set) console.log(`[seed] triage emails: ${te.set} backfilled`);
    } catch (e) {
      console.error("[seed] seedTriageEmails failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { seedPayrollHistoryLinks } = await import("./seed-payroll-history-links");
      const ph = await seedPayrollHistoryLinks();
      if (ph.set) console.log(`[seed] payroll history links: ${ph.set} set`);
    } catch (e) {
      console.error("[seed] seedPayrollHistoryLinks failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { seedDockKingFlowthrough } = await import("./seed-dock-king-flowthrough");
      const d = await seedDockKingFlowthrough();
      if (d.matched) console.log(`[seed] Dock King flow-through: ${d.updated} set wholesale, ${d.tasksPaused} tasks/rules paused (${d.matched} matched)`);
    } catch (e) {
      console.error("[seed] seedDockKingFlowthrough failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    try {
      const { seedTaxRateReviewTasks } = await import("./seed-tax-rate-reviews");
      const t = await seedTaxRateReviewTasks();
      console.log(`[seed] tax-rate review reminders: ${t.created} created (${t.ensured} ensured)`);
    } catch (e) {
      console.error("[seed] seedTaxRateReviewTasks failed (non-fatal):", e instanceof Error ? e.message : e);
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
    // Re-date recurring compliance tasks to Markie's rules (year-end → 30th of
    // month after; T4 → Jan 20; HST quarterly → 15th), flag Align as QBO autopay,
    // Columbus as prospect, West York weekly. Idempotent — safe every boot.
    try {
      const { reconcileOvernight } = await import("./reconcile-overnight");
      const r = await reconcileOvernight();
      console.log(`[reconcile] year-end ${r.yearEndRedated}, T4 ${r.t4Redated}, HST ${r.hstRedated} re-dated; Align autopay=${r.alignFlagged} (-${r.alignTasksRetired} tasks/-${r.alignRulesRetired} rules); Columbus prospect=${r.columbusProspect}; West York weekly=${r.westYorkWeekly}${r.notes.length ? " | " + r.notes.join("; ") : ""}`);
    } catch (e) {
      console.error("[reconcile] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Seed Clark Collingwood (client 7) payroll roster from their old payroll
    // sheet — fill-only + isolation-checked, so Markie can run a real pay run.
    try {
      const { seedCollingwoodPayroll } = await import("./seed-collingwood-payroll");
      const r = await seedCollingwoodPayroll();
      if (r) console.log(`[seed-collingwood] created ${r.created}, filled ${r.filled}, banked ${r.banked}${r.skipped ? " | skipped: " + r.skipped : ""}`);
    } catch (e) {
      console.error("[seed-collingwood] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Load this period's hours + phone allowances into the OPEN Collingwood draft run
    // so Markie can run payroll today without the Jobber import (stop-gap, draft-only).
    try {
      const { seedCollingwoodRunHours } = await import("./seed-collingwood-run-hours");
      const r = await seedCollingwoodRunHours();
      if (r) console.log(`[seed-collingwood-run] run ${r.run}, filled ${r.filled}, phoneSet ${r.phoneSet}${r.skipped ? " | skipped: " + r.skipped : ""}`);
    } catch (e) {
      console.error("[seed-collingwood-run] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Recurring payroll reminders (task + 4h morning calendar block) for the payroll
    // clients — biweekly Wed (Clark OS/CW, Auld Spot, Sher-E-Punjab) + weekly Wed
    // (West York). Rolling 8-week window, idempotent.
    try {
      const { ensurePayrollReminders } = await import("./seed-payroll-recurring");
      const r = await ensurePayrollReminders();
      if (r) console.log(`[payroll-reminders] +${r.tasksAdded} tasks, +${r.eventsAdded} blocks, -${r.tasksRemoved ?? 0} stray${r.skipped ? " | skipped: " + r.skipped : ""}`);
    } catch (e) {
      console.error("[payroll-reminders] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Clients who RUN THEIR OWN payroll → off the payroll page, year-end recon task only.
    try {
      const { markClientRunPayroll } = await import("./seed-client-run-payroll");
      const r = await markClientRunPayroll();
      if (r?.updated?.length) console.log(`[client-run-payroll] ${r.updated.join(", ")}`);
    } catch (e) {
      console.error("[client-run-payroll] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — Sher-E-Punjab pay runs from the Google sheet (per-employee).
    try {
      const { backfillSherPayroll } = await import("./seed-sher-backfill");
      const r = await backfillSherPayroll();
      if (r?.runsAdded) console.log(`[sher-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[sher-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — Clark Owen Sound pay runs from the Google sheet (per-employee).
    try {
      const { backfillOwenSoundPayroll } = await import("./seed-os-backfill");
      const r = await backfillOwenSoundPayroll();
      if (r?.runsAdded) console.log(`[os-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[os-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — Clark Collingwood pay runs from the Google sheet (per-employee).
    try {
      const { backfillCollingwoodPayroll } = await import("./seed-collingwood-backfill");
      const r = await backfillCollingwoodPayroll();
      if (r?.runsAdded) console.log(`[cw-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[cw-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — The Auld Spot Pub pay runs from the Google sheet (per-employee).
    try {
      const { backfillAuldPayroll } = await import("./seed-auld-backfill");
      const r = await backfillAuldPayroll();
      if (r?.runsAdded) console.log(`[auld-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[auld-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — Originality.AI regular + revenue-share runs from the Google sheet.
    try {
      const { backfillOriginalityPayroll } = await import("./seed-originality-backfill");
      const r = await backfillOriginalityPayroll();
      if (r?.runsAdded) console.log(`[og-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[og-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — 2303851 Ontario Inc (Stacey Gillham salary, Jan–Jun half).
    try {
      const { backfill2303851Payroll } = await import("./seed-2303851-backfill");
      const r = await backfill2303851Payroll();
      if (r?.runsAdded) console.log(`[2303851-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[2303851-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — Fractal SaaS Inc (Andrew Raines monthly autopay $4,500).
    try {
      const { backfillFractalPayroll } = await import("./seed-fractal-backfill");
      const r = await backfillFractalPayroll();
      if (r?.runsAdded) console.log(`[fractal-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[fractal-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Year backfill — Motion Invest Inc (Van Boxmeer + Gunn, Jan–Apr).
    try {
      const { backfillMotionInvestPayroll } = await import("./seed-motioninvest-backfill");
      const r = await backfillMotionInvestPayroll();
      if (r?.runsAdded) console.log(`[motioninvest-backfill] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[motioninvest-backfill] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Motion Invest quarterly revenue-share bonus (net-profit based; posts due quarters).
    try {
      const { backfillMotionInvestRevShare } = await import("./seed-motioninvest-revshare");
      const r = await backfillMotionInvestRevShare();
      if (r?.runsAdded) console.log(`[mi-revshare] +${r.runsAdded} runs`);
    } catch (e) {
      console.error("[mi-revshare] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Tag related entities into company groups (Jon Gillham's portfolio, etc.).
    try {
      const { seedCompanyGroups } = await import("./seed-company-groups");
      const r = await seedCompanyGroups();
      if (r?.tagged) console.log(`[company-groups] tagged ${r.tagged}`);
    } catch (e) {
      console.error("[company-groups] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Scaffold the interco tracker — a current-month period shell per group payer.
    try {
      const { seedIntercoScaffold } = await import("./seed-interco-scaffold");
      const r = await seedIntercoScaffold();
      if (r?.created) console.log(`[interco-scaffold] created ${r.created}`);
    } catch (e) {
      console.error("[interco-scaffold] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Flag Go Fig Bookz as the firm self-client (anchors Practice Health).
    try {
      const { seedFirmClient } = await import("./seed-firm-client");
      await seedFirmClient();
    } catch (e) {
      console.error("[firm-client] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Recreate Jon Gillham's control book into the CRM group_* tables (idempotent;
    // seeds only when empty so manual edits aren't clobbered).
    try {
      const { seedJonControlBook } = await import("./seed-jon-control-book");
      const r = await seedJonControlBook();
      if (r?.seeded) console.log(`[jon-control-book] seeded ${r.entities} entities`);
    } catch (e) {
      console.error("[jon-control-book] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Build the separate, fully-fake demo.db for "Try Demo Mode" (never the real books).
    try {
      const { prepareDemoDb } = await import("./prepare-demo-db");
      await prepareDemoDb();
    } catch (e) {
      console.error("[demo-db] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Pull Markie's personal records (health/finance/travel) into his private Phoenix hub.
    try {
      const { seedPhoenixPersonal } = await import("./seed-phoenix-personal");
      const r = await seedPhoenixPersonal();
      if (r?.seeded) console.log(`[phoenix-personal] seeded ${r.count} entries`);
      const { seedPhoenixPersonalV2 } = await import("./seed-phoenix-personal-v2");
      const r2 = await seedPhoenixPersonalV2();
      if (r2?.seeded) console.log(`[phoenix-personal-v2] seeded ${r2.count} entries`);
    } catch (e) {
      console.error("[phoenix-personal] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Re-date compliance tasks (start + due) + clean up junk (inactive clients,
    // auto-paid payroll, dupes). Idempotent.
    try {
      const { rescheduleAndCleanupTasks } = await import("./reschedule-tasks");
      await rescheduleAndCleanupTasks();
    } catch (e) {
      console.error("[reschedule] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Dedup + name-correct Clark OS / Collingwood / Sher rosters (merge swapped/dupe
    // rows, repoint their pay-run lines, fix the "Last, First" split).
    try {
      const { dedupEmployees } = await import("./seed-employee-dedup");
      const r = await dedupEmployees();
      if (r && (r.merged || r.renamed)) console.log(`[emp-dedup] merged ${r.merged}, renamed ${r.renamed}`);
    } catch (e) {
      console.error("[emp-dedup] failed (non-fatal):", e instanceof Error ? e.message : e);
    }
    // Seed the TouchBistro restaurant rosters + rates (Sher-E-Punjab, Auld Spot).
    try {
      const { seedTouchbistroPayroll } = await import("./seed-touchbistro-payroll");
      const r = await seedTouchbistroPayroll();
      console.log(`[seed-touchbistro] created ${r.created}, filled ${r.filled}${r.skipped.length ? " | skipped: " + r.skipped.join("; ") : ""}`);
    } catch (e) {
      console.error("[seed-touchbistro] failed (non-fatal):", e instanceof Error ? e.message : e);
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

  // Re-derive each client's QBO realm ID from its live connection onto the
  // client file (so the realm ID is always visible on the master + never lost).
  // When new links happen, also push the clients to the Google Client Master
  // sheet so the realm column lands there too (only when something changed, so
  // we don't hammer the Sheets proxy every boot).
  const { ensureClientRealmSync } = await import("./ensure-client-realm-sync");
  const realmSync = await ensureClientRealmSync();
  if (realmSync && (realmSync.linked || realmSync.autoLinked)) {
    try {
      const { pushAllClientsToMaster } = await import("./master-sheet-sync");
      await pushAllClientsToMaster();
    } catch (e) {
      console.error("[realm-sync] master-sheet push failed (non-fatal):", e instanceof Error ? e.message : e);
    }
  }

  // Start QBO + GOOGLE auto-sync schedulers. The Google one (every 30 min +
  // once on boot) pulls Calendar/Tasks/Gmail FROM Google into the CRM — the
  // inbound half of two-way sync. The outbound half (CRM → Google) is pushed
  // live from task/calendar create+edit via google-push.ts.
  const { startAllSchedulers } = await import("./all-sync-scheduler");
  startAllSchedulers();

  // QBO native-token keep-alive. The boot call is DEBOUNCED (runs at most once per
  // ~20h) so back-to-back deploys can't churn/rotate refresh tokens and brick them
  // (the 2026-06-26 lockout). The daily timer FORCES a real sweep to hold the
  // rolling 100-day window. Best-effort + isolated — one failure flags only that
  // connection for reconnect.
  setTimeout(() => { keepAliveNativeConnections().catch(() => {}); }, 60_000);
  setInterval(() => { keepAliveNativeConnections(7, { force: true }).catch(() => {}); }, 24 * 60 * 60 * 1000);

  // Dashboard trend snapshots: capture shortly after boot, then daily.
  const { capturePracticeSnapshot } = await import("./dashboard-router");
  setTimeout(() => { capturePracticeSnapshot().catch(() => {}); }, 90_000);
  setInterval(() => { capturePracticeSnapshot().catch(() => {}); }, 24 * 60 * 60 * 1000);

  // Tax-rate auto-refresh (no live API → AI web-fetch). Checks shortly after boot,
  // then daily; only actually refetches when stale or in a Jun/Dec refresh window.
  const { maybeRefreshTaxRates } = await import("./tax-rate-autofetch");
  setTimeout(() => { maybeRefreshTaxRates().catch(() => {}); }, 150_000);
  setInterval(() => { maybeRefreshTaxRates().catch(() => {}); }, 24 * 60 * 60 * 1000);

  // Family-tree monthly web scan: a daily tick that only fires on the 28th (Markie's
  // cadence) and only if this month hasn't run. Gated on ANTHROPIC_API_KEY; writes
  // discoveries to the review inbox (never auto-merged). Cheap + idempotent.
  const { maybeRunMonthlyGenealogyScan } = await import("./genealogy-scan");
  setTimeout(() => { maybeRunMonthlyGenealogyScan().catch(() => {}); }, 180_000);
  setInterval(() => { maybeRunMonthlyGenealogyScan().catch(() => {}); }, 24 * 60 * 60 * 1000);

  // One-time: make hasPayroll the source of truth by seeding it for the known
  // payroll clients (idempotent — skips any already flagged).
  const { backfillHasPayroll, seedPayrollSchedules } = await import("./payroll-router");
  backfillHasPayroll().catch(() => {});
  seedPayrollSchedules().catch(() => {});

  // INBOUND sheet → CRM sync (bidirectional): apply edits made in the Google
  // master sheet back into the CRM. Shortly after boot, then every 20 min.
  // Best-effort; opt out with FIGGY_SHEET_SYNC_DISABLE=on.
  if (process.env.FIGGY_SHEET_SYNC_DISABLE !== "on") {
    const runInbound = async () => {
      try {
        const { pullMasterIntoCrm } = await import("./sheet-inbound-sync");
        const r = await pullMasterIntoCrm();
        console.log(`[inbound] clients ${r.clients.updated}u/${r.clients.created}c, leads ${r.leads.updated}u/${r.leads.created}c`);
      } catch (e) { console.error("[inbound] sync failed (non-fatal):", e instanceof Error ? e.message : e); }
    };
    setTimeout(runInbound, 120_000);
    setInterval(runInbound, 20 * 60 * 1000);
  }

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer();
