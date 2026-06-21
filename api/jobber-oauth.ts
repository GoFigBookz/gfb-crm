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
import { jobberConnections } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./qbo-oauth";

const AUTH_URL = "https://api.getjobber.com/api/oauth/authorize";
const TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
// Jobber requires a dated API version header. Override with JOBBER_API_VERSION if needed.
export const JOBBER_API_VERSION = process.env.JOBBER_API_VERSION || "2025-01-20";

type Conn = typeof jobberConnections.$inferSelect;

export function jobberConfigured(): boolean {
  return !!(process.env.JOBBER_CLIENT_ID && process.env.JOBBER_CLIENT_SECRET);
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

export function buildAuthorizeUrl(clientId: number | null): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.JOBBER_CLIENT_ID || "");
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", signState(clientId));
  return u.toString();
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
  if (!jobberConfigured()) throw new Error("jobber_not_configured");

  const data = await postToken({
    client_id: process.env.JOBBER_CLIENT_ID!,
    client_secret: process.env.JOBBER_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: redirectUri(),
  });
  const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 3600) * 1000);
  const db = getDb();
  await ensureJobberTable();
  const existing = await db.select().from(jobberConnections).where(eq(jobberConnections.clientId, state.clientId)).limit(1);
  const row = {
    clientId: state.clientId,
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
      client_id: process.env.JOBBER_CLIENT_ID!,
      client_secret: process.env.JOBBER_CLIENT_SECRET!,
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

export async function ensureJobberTable(): Promise<void> {
  try {
    const db = getDb();
    await db.run(sql`CREATE TABLE IF NOT EXISTS jobber_connections (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      accountName text,
      accessToken text,
      refreshToken text,
      expiresAt integer,
      active integer DEFAULT 1,
      reconnectReason text,
      createdAt integer,
      updatedAt integer
    )`);
  } catch (e) { console.error("[jobber] ensure table failed:", e instanceof Error ? e.message : e); }
}
