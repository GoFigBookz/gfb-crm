/**
 * JOBBER OAUTH 2.0 — per-client connection for timesheet-hours import.
 * =============================================================================
 * Mirrors the hardened QBO OAuth (api/qbo-oauth.ts): tokens encrypted at rest
 * (reusing encryptSecret/decryptSecret), signed+time-boxed state (CSRF + clientId
 * binding), refresh-token ROTATION persisted on every refresh. Jobber access tokens
 * last ~60 min; refresh tokens rotate, so we always store the newest one.
 *
 * Credentials come from env (NEVER committed): JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET.
 * Redirect URI must EXACTLY match the one registered in the Jobber Developer app.
 * =============================================================================
 */
import crypto from "crypto";
import { getDb } from "./queries/connection";
import { jobberConnections, appSettings } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./qbo-oauth";

const AUTH_URL = "https://api.getjobber.com/api/oauth/authorize";
const TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
// Jobber requires a dated API version header. Override with JOBBER_API_VERSION if needed.
export const JOBBER_API_VERSION = process.env.JOBBER_API_VERSION || "2025-01-20";

type Conn = typeof jobberConnections.$inferSelect;

export async function ensureAppSettings(): Promise<void> {
  try { await getDb().run(sql`CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text, updatedAt integer)`); }
  catch (e) { console.error("[jobber] ensure app_settings failed:", e instanceof Error ? e.message : e); }
}
// Credentials: in-app encrypted store (set via the UI) takes precedence, then env.
async function getCred(key: string, envVal: string | undefined): Promise<string | null> {
  try {
    const rows = await getDb().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    const stored = (rows[0] as any)?.value;
    if (stored) return decryptSecret(stored) || null;
  } catch { /* table may not exist yet → fall through to env */ }
  return envVal || null;
}
export const getJobberClientId = () => getCred("jobber_client_id", process.env.JOBBER_CLIENT_ID);
export const getJobberClientSecret = () => getCred("jobber_client_secret", process.env.JOBBER_CLIENT_SECRET);

export async function setJobberCreds(clientId: string, secret: string): Promise<void> {
  await ensureAppSettings();
  const db = getDb();
  for (const [k, v] of [["jobber_client_id", clientId], ["jobber_client_secret", secret]] as [string, string][]) {
    const enc = encryptSecret(v.trim())!;
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, k)).limit(1);
    if (existing[0]) await db.update(appSettings).set({ value: enc, updatedAt: new Date() }).where(eq(appSettings.key, k));
    else await db.insert(appSettings).values({ key: k, value: enc });
  }
}
export async function jobberConfigured(): Promise<boolean> {
  return !!(await getJobberClientId()) && !!(await getJobberClientSecret());
}
function redirectUri(): string {
  return process.env.JOBBER_REDIRECT_URI || "https://figgy.gofig.ca/api/jobber/callback";
}
function stateKey(): string {
  return process.env.FIGGY_TOKEN_KEY || process.env.APP_SECRET || "figgy-jobber-dev";
}

// --- signed, time-boxed OAuth state (binds clientId; CSRF-safe) -------------
export function signState(clientId: number | null): string {
  const body = `${clientId ?? ""}.${Date.now()}.${crypto.randomBytes(8).toString("hex")}`;
  const sig = crypto.createHmac("sha256", stateKey()).update(body).digest("hex").slice(0, 32);
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}
export function verifyState(raw: string | null | undefined): { clientId: number | null } | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString();
    const parts = decoded.split(".");
    if (parts.length !== 4) return null;
    const [cid, ts, nonce, sig] = parts;
    const body = `${cid}.${ts}.${nonce}`;
    const expect = crypto.createHmac("sha256", stateKey()).update(body).digest("hex").slice(0, 32);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    if (Date.now() - Number(ts) > 15 * 60 * 1000) return null; // 15-min window
    return { clientId: cid ? Number(cid) : null };
  } catch { return null; }
}

export async function buildAuthorizeUrl(clientId: number | null): Promise<string> {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", (await getJobberClientId()) || "");
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", signState(clientId));
  return u.toString();
}

/**
 * Fetch the connected Jobber ACCOUNT identity (id + name) using a fresh access
 * token. This is the linchpin of per-client isolation: each Jobber account is a
 * separate company, so storing the account id lets us (a) show which company is
 * linked and (b) REFUSE to bind the same Jobber account to two CRM clients
 * (the silent-re-auth trap, where the browser is still logged into the first
 * account and Jobber returns it again). Best-effort: returns null on any error.
 */
async function fetchJobberAccount(accessToken: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(JOBBER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "X-JOBBER-GRAPHQL-VERSION": JOBBER_API_VERSION,
      },
      body: JSON.stringify({ query: "query { account { id name } }" }),
    });
    const json: any = await res.json().catch(() => ({}));
    const acc = json?.data?.account;
    if (!res.ok || json?.errors || !acc?.id) return null;
    return { id: String(acc.id), name: String(acc.name ?? "") };
  } catch {
    return null;
  }
}

async function postToken(params: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Jobber token ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

/** Exchange the authorization code and persist an (encrypted) connection. */
export async function exchangeAndPersist(input: { code: string; stateRaw: string }): Promise<void> {
  const state = verifyState(input.stateRaw);
  if (!state) throw new Error("invalid_or_expired_state");
  if (!state.clientId) throw new Error("missing_client_in_state");
  const cid = await getJobberClientId(), csec = await getJobberClientSecret();
  if (!cid || !csec) throw new Error("jobber_not_configured");

  const data = await postToken({
    client_id: cid,
    client_secret: csec,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: redirectUri(),
  });
  const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000);
  const db = getDb();
  await ensureJobberTable();

  // Identify WHICH Jobber account this token belongs to and store its name so the
  // UI shows which account each client is linked to. We do NOT block linking the
  // same account to multiple clients: some firms run several CRM clients out of ONE
  // Jobber account (e.g. Clark Pools' two locations). Hours stay separated at
  // import time — each pay run only fills employees on THAT client's roster.
  const acc = await fetchJobberAccount(data.access_token);

  const existing = await db.select().from(jobberConnections).where(eq(jobberConnections.clientId, state.clientId)).limit(1);
  const row = {
    clientId: state.clientId,
    accountName: acc?.name ?? null,
    jobberAccountId: acc?.id ?? null,
    accessToken: encryptSecret(data.access_token),
    refreshToken: encryptSecret(data.refresh_token),
    expiresAt, active: true, reconnectReason: null, updatedAt: new Date(),
  };
  if (existing[0]) await db.update(jobberConnections).set(row).where(eq(jobberConnections.clientId, state.clientId));
  else await db.insert(jobberConnections).values(row);
}

/** Refresh + persist the rotated refresh token. */
async function refreshToken(conn: Conn): Promise<Conn> {
  const rt = decryptSecret(conn.refreshToken);
  if (!rt) throw new Error("no_refresh_token");
  let data: any;
  try {
    data = await postToken({
      client_id: (await getJobberClientId())!,
      client_secret: (await getJobberClientSecret())!,
      grant_type: "refresh_token",
      refresh_token: rt,
    });
  } catch (e) {
    const db = getDb();
    await db.update(jobberConnections).set({ active: false, reconnectReason: "refresh_failed", updatedAt: new Date() }).where(eq(jobberConnections.id, conn.id));
    throw new Error("Jobber reconnect required — refresh failed. Click Connect Jobber again.");
  }
  const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000);
  const db = getDb();
  const patch = {
    accessToken: encryptSecret(data.access_token),
    refreshToken: encryptSecret(data.refresh_token || rt), // rotate if a new one came back
    expiresAt, active: true, updatedAt: new Date(),
  };
  await db.update(jobberConnections).set(patch).where(eq(jobberConnections.id, conn.id));
  return { ...conn, ...patch } as Conn;
}

/** The active connection for a client, with a guaranteed-valid access token. */
export async function getValidConnection(clientId: number): Promise<Conn | null> {
  await ensureJobberTable();
  const db = getDb();
  const rows = await db.select().from(jobberConnections).where(eq(jobberConnections.clientId, clientId)).limit(1);
  let conn = rows[0];
  if (!conn || !conn.active) return null;
  // Refresh if expiring within 2 minutes.
  if (!conn.expiresAt || conn.expiresAt.getTime() - Date.now() < 120_000) {
    conn = await refreshToken(conn);
  }
  return conn;
}

export function bearerFor(conn: Conn): string {
  return decryptSecret(conn.accessToken) || "";
}

/** Mark a client's Jobber connection inactive (so it can be re-connected to the
 *  correct account). Used when a wrong account got linked. */
export async function disconnectJobber(clientId: number): Promise<void> {
  await ensureJobberTable();
  const db = getDb();
  await db.update(jobberConnections)
    .set({ active: false, reconnectReason: "disconnected", updatedAt: new Date() })
    .where(eq(jobberConnections.clientId, clientId));
}

export async function ensureJobberTable(): Promise<void> {
  try {
    const db = getDb();
    await db.run(sql`CREATE TABLE IF NOT EXISTS jobber_connections (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      accountName text,
      jobberAccountId text,
      accessToken text,
      refreshToken text,
      expiresAt integer,
      active integer DEFAULT 1,
      reconnectReason text,
      createdAt integer,
      updatedAt integer
    )`);
    // Add columns missing on older tables (idempotent, PRAGMA-checked).
    const have = new Set<string>();
    try {
      const res: any = await db.run(sql`PRAGMA table_info(jobber_connections)`);
      for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
    } catch { /* best-effort */ }
    for (const [col, type] of [["accountName", "text"], ["jobberAccountId", "text"], ["reconnectReason", "text"]] as [string, string][]) {
      if (!have.has(col)) {
        try { await db.run(sql.raw(`ALTER TABLE jobber_connections ADD COLUMN ${col} ${type}`)); } catch { /* already there */ }
      }
    }
  } catch (e) { console.error("[jobber] ensure table failed:", e instanceof Error ? e.message : e); }
}
