/**
 * FIGGY JR — NATIVE PER-REALM QBO OAUTH (the durable connection layer)
 * =============================================================================
 * Replaces the interim committed-webhook Make bridge with first-party Intuit
 * OAuth 2.0, one connection per realm = one CRM client. The brain code is
 * unchanged — only the injected connection's `transport` differs ("native" vs
 * "make_bridge"). This module owns the security-critical parts the design doc
 * (`docs/FIGGY_JR_QBO_CONNECTION_DESIGN.md`) calls non-negotiable:
 *
 *  1. TOKENS ENCRYPTED AT REST (AES-256-GCM). Access + refresh tokens never sit
 *     in the DB as plaintext. Self-describing `enc:v1:` envelope so legacy
 *     plaintext rows keep working until the next refresh re-encrypts them.
 *  2. SIGNED STATE (HMAC-SHA256). The OAuth `state` carries the target CRM
 *     clientId and is signed + time-boxed, so the callback can bind the realm to
 *     the right client and a forged/replayed callback is rejected (CSRF).
 *  3. ROTATING REFRESH TOKEN PERSISTED on EVERY refresh (Intuit rotates the
 *     100-day refresh token ~daily; miss one persist and you get invalid_grant).
 *  4. KEEP-ALIVE: a scheduled proactive refresh keeps the rolling 100-day window
 *     alive so a quiet client's connection never silently lapses.
 *  5. RECONNECT SURFACE: on invalid_grant we mark the connection inactive +
 *     stamp `reconnectReason` (never silently fail) so the UI offers reconnect,
 *     and the brain reports "not connected" rather than guessing.
 *
 * GOLDEN RULES: read-only for the brain (this layer only authenticates; posting
 * stays gated elsewhere). Per-client isolation is preserved — a connection is
 * bound to exactly one clientId; `getConnectionForClient` stays the single
 * boundary and refuses to guess.
 *
 * KEY MATERIAL: `FIGGY_TOKEN_KEY` (preferred) or `APP_SECRET` derives the
 * AES + HMAC keys. With NEITHER set we degrade to plaintext storage + unsigned
 * state and log a loud warning (keeps local dev working) — production sets the
 * key. App `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` stay in env, never in the browser.
 * =============================================================================
 */
import crypto from "node:crypto";
import { getDb } from "./queries/connection";
import { qboConnections } from "../db/schema";
import { eq, and } from "drizzle-orm";

const QBO_BASE_URLS = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
// Minimal scope — accounting only (design doc best-practice #1). The brain reads
// Bills/Purchases/Vendors/Accounts; it never needs the payments scope.
const QBO_SCOPE = "com.intuit.quickbooks.accounting";

type Conn = typeof qboConnections.$inferSelect;
type Env = "sandbox" | "production";

// --------------------------------------------------------------------------
// Key material
// --------------------------------------------------------------------------
// Auto-generated, DB-persisted key — set once at boot by ensureTokenKey() when no
// env key is configured, so encryption is ZERO-TOUCH (Markie never has to set
// FIGGY_TOKEN_KEY). It's stable across restarts because it's persisted, so tokens
// encrypted with it stay decryptable. An explicit env key always wins.
let autoKey: string | null = null;
function secretMaterial(): string | null {
  return process.env.FIGGY_TOKEN_KEY || process.env.APP_SECRET || autoKey || null;
}

/**
 * Ensure a token-encryption key exists WITHOUT requiring an env var. If neither
 * FIGGY_TOKEN_KEY nor APP_SECRET is set, generate a strong random key once and
 * persist it in app_settings, then reuse it on every boot. Call at startup before
 * any token is read/written. Returns the source for logging.
 */
export async function ensureTokenKey(): Promise<"env" | "generated" | "persisted"> {
  if (process.env.FIGGY_TOKEN_KEY || process.env.APP_SECRET) return "env";
  try {
    const { getDb } = await import("./queries/connection");
    const { appSettings } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const { sql } = await import("drizzle-orm");
    await db.run(sql`CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, value text, updatedAt integer)`);
    const KEY = "figgy_token_key";
    const existing = (await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1))[0] as any;
    if (existing?.value) { autoKey = existing.value; return "persisted"; }
    autoKey = crypto.randomBytes(32).toString("hex");
    await db.insert(appSettings).values({ key: KEY, value: autoKey, updatedAt: new Date() } as any);
    return "generated";
  } catch (e) {
    console.error("[qbo-oauth] ensureTokenKey failed (tokens stay plaintext):", e instanceof Error ? e.message : e);
    return "persisted";
  }
}
let warnedNoKey = false;
function warnNoKeyOnce() {
  if (warnedNoKey) return;
  warnedNoKey = true;
  console.warn(
    "[qbo-oauth] No FIGGY_TOKEN_KEY/APP_SECRET set — QBO tokens stored UNENCRYPTED " +
    "and OAuth state UNSIGNED. Acceptable for local dev only; set a key in production.",
  );
}
/** 32-byte key for a named purpose, derived from the configured secret. */
function deriveKey(purpose: string): Buffer | null {
  const mat = secretMaterial();
  if (!mat) return null;
  return crypto.createHash("sha256").update(`figgy:${purpose}:${mat}`).digest();
}

// --------------------------------------------------------------------------
// 1. Token encryption at rest (AES-256-GCM, self-describing envelope)
// --------------------------------------------------------------------------
const ENC_PREFIX = "enc:v1:";

/** Encrypt a secret for storage. Returns plaintext unchanged if no key is set
 *  (dev) so the system still works; production always has a key. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  if (plain.startsWith(ENC_PREFIX)) return plain; // already encrypted, don't double-wrap
  const key = deriveKey("token");
  if (!key) { warnNoKeyOnce(); return plain; }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a stored secret. Pass-through for legacy plaintext (no prefix) so the
 *  cutover is seamless — rows re-encrypt themselves on the next token refresh. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return stored ?? null;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  const key = deriveKey("token");
  if (!key) { warnNoKeyOnce(); return null; } // can't read encrypted data without the key
  try {
    const [, , ivB64, tagB64, ctB64] = stored.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (e) {
    console.error("[qbo-oauth] token decrypt failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// --------------------------------------------------------------------------
// 2. Signed, time-boxed OAuth state (CSRF + client binding)
// --------------------------------------------------------------------------
export type OAuthState = { clientId: number | null; env: Env; nonce: string; ts: number };
const STATE_TTL_MS = 15 * 60 * 1000; // an authorize round-trip is seconds; 15m is generous

export function signState(payload: { clientId: number | null; env: Env }): string {
  const state: OAuthState = {
    clientId: payload.clientId ?? null,
    env: payload.env,
    nonce: crypto.randomBytes(8).toString("hex"),
    ts: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const key = deriveKey("state");
  if (!key) { warnNoKeyOnce(); return body; } // unsigned in dev
  const sig = crypto.createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify + parse state. Returns null if tampered, expired, or malformed. */
export function verifyState(raw: string | null | undefined): OAuthState | null {
  if (!raw) return null;
  const key = deriveKey("state");
  let body = raw;
  if (key) {
    const dot = raw.lastIndexOf(".");
    if (dot < 0) return null; // signature required when a key is configured
    body = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const expected = crypto.createHmac("sha256", key).update(body).digest("base64url");
    // constant-time compare; bail if lengths differ
    if (sig.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } else {
    warnNoKeyOnce();
    // tolerate either "body" or "body.sig" shape when running keyless (dev)
    const dot = raw.lastIndexOf(".");
    if (dot > 0) body = raw.slice(0, dot);
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as OAuthState;
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > STATE_TTL_MS) return null;
    if (parsed.env !== "sandbox" && parsed.env !== "production") return null;
    return parsed;
  } catch { return null; }
}

// --------------------------------------------------------------------------
// 3. Authorize URL
// --------------------------------------------------------------------------
export function getOAuthCredentials() {
  return {
    clientId: process.env.QBO_CLIENT_ID || process.env.SANDBOX_QBO_CLIENT_ID || "",
    clientSecret: process.env.QBO_CLIENT_SECRET || process.env.SANDBOX_QBO_CLIENT_SECRET || "",
    redirectUri:
      process.env.QBO_REDIRECT_URI ||
      `${(process.env.VITE_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/qbo/callback`,
  };
}

/** Build the Intuit authorize URL that starts the per-client connect flow. */
export function buildAuthorizeUrl(opts: { clientId: number | null; env?: Env }): {
  url: string; state: string;
} {
  const env: Env = opts.env ?? "production";
  const { clientId: appClientId, redirectUri } = getOAuthCredentials();
  const state = signState({ clientId: opts.clientId ?? null, env });
  const url = `${AUTHORIZE_URL}?${new URLSearchParams({
    client_id: appClientId,
    redirect_uri: redirectUri,
    scope: QBO_SCOPE,
    response_type: "code",
    state,
  })}`;
  return { url, state };
}

// --------------------------------------------------------------------------
// 4. Code exchange + persist (binds realm -> CRM client, encrypts tokens)
// --------------------------------------------------------------------------
async function fetchCompanyInfo(env: Env, realmId: string, accessToken: string) {
  try {
    const res = await fetch(
      `${QBO_BASE_URLS[env]}/v3/company/${realmId}/companyinfo/${realmId}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    if (!res.ok) return { companyName: null as string | null, companyEmail: null as string | null };
    const j = await res.json();
    return {
      companyName: j.CompanyInfo?.CompanyName ?? null,
      companyEmail: j.CompanyInfo?.Email?.Address ?? null,
    };
  } catch { return { companyName: null, companyEmail: null }; }
}

/**
 * Exchange an authorization code and upsert the native connection, bound to the
 * clientId carried in (verified) state. Tokens are encrypted before storage.
 * Returns the realm + company for the redirect message.
 */
export async function exchangeAndPersist(input: {
  code: string; realmId: string; stateRaw: string;
}): Promise<{ realmId: string; companyName: string | null; clientId: number | null }> {
  const state = verifyState(input.stateRaw);
  if (!state) throw new Error("invalid_or_expired_state");
  const env = state.env;
  const { clientId: appClientId, clientSecret, redirectUri } = getOAuthCredentials();
  if (!appClientId || !clientSecret) throw new Error("qbo_app_credentials_not_configured");

  const params = new URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", input.code);
  params.append("redirect_uri", redirectUri);
  params.append("client_id", appClientId);
  params.append("client_secret", clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`token_exchange_failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  const { companyName, companyEmail } = await fetchCompanyInfo(env, input.realmId, data.access_token);

  const db = getDb();
  const existing = (await db.select().from(qboConnections)
    .where(eq(qboConnections.realmId, input.realmId)).limit(1))[0];

  const common = {
    companyName: companyName || existing?.companyName || null,
    companyEmail: companyEmail || existing?.companyEmail || null,
    accessToken: encryptSecret(data.access_token),
    refreshToken: encryptSecret(data.refresh_token),
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    environment: env,
    transport: "native" as const,
    // Carry the client binding from state; preserve a prior binding if state had none.
    clientId: state.clientId ?? existing?.clientId ?? null,
    isActive: true,
    reconnectReason: null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(qboConnections).set(common).where(eq(qboConnections.id, existing.id));
  } else {
    await db.insert(qboConnections).values({ userId: 1, realmId: input.realmId, accountType: "ca_clients", ...common });
  }
  return { realmId: input.realmId, companyName: common.companyName, clientId: common.clientId };
}

// --------------------------------------------------------------------------
// 5. Hardened refresh (rotation persisted, invalid_grant -> reconnect surface)
// --------------------------------------------------------------------------
export class ReconnectRequiredError extends Error {
  constructor(public readonly connectionId: number, message: string) {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

/**
 * Refresh a native connection's access token. Persists the rotated refresh token
 * (encrypted) on every call. On invalid_grant marks the connection inactive with
 * a reconnect reason and throws ReconnectRequiredError — never silently fails.
 */
export async function refreshNativeToken(connection: Conn): Promise<Conn> {
  const { clientId: appClientId, clientSecret } = getOAuthCredentials();
  const refreshToken = decryptSecret(connection.refreshToken);
  if (!refreshToken) {
    await markReconnect(connection.id, "missing_refresh_token");
    throw new ReconnectRequiredError(connection.id, "missing_refresh_token");
  }
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);
  params.append("client_id", appClientId);
  params.append("client_secret", clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  if (!res.ok) {
    const errText = await res.text();
    // invalid_grant = the refresh token is dead (revoked / lapsed / rotation missed).
    if (res.status === 400 && /invalid_grant/i.test(errText)) {
      await markReconnect(connection.id, "invalid_grant");
      throw new ReconnectRequiredError(connection.id, `invalid_grant — reconnect required`);
    }
    throw new Error(`token_refresh_failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const newAccess = data.access_token as string;
  // Intuit rotates the refresh token ~daily; persist whatever it returns (or keep
  // the current one if absent) — missing this is the classic lockout bug.
  const newRefresh = (data.refresh_token as string) || refreshToken;
  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

  const encAccess = encryptSecret(newAccess);
  const encRefresh = encryptSecret(newRefresh);
  const db = getDb();
  await db.update(qboConnections)
    .set({ accessToken: encAccess, refreshToken: encRefresh, expiresAt, isActive: true, reconnectReason: null, updatedAt: new Date() })
    .where(eq(qboConnections.id, connection.id));

  return { ...connection, accessToken: encAccess, refreshToken: encRefresh, expiresAt, isActive: true, reconnectReason: null };
}

async function markReconnect(connectionId: number, reason: string): Promise<void> {
  try {
    const db = getDb();
    await db.update(qboConnections)
      .set({ isActive: false, reconnectReason: reason, updatedAt: new Date() })
      .where(eq(qboConnections.id, connectionId));
    console.warn(`[qbo-oauth] connection #${connectionId} needs reconnect: ${reason}`);
  } catch (e) {
    console.error("[qbo-oauth] markReconnect failed:", e instanceof Error ? e.message : e);
  }
}

/** The bearer token to put on a QBO request (decrypted). */
export function accessTokenFor(connection: Conn): string {
  return decryptSecret(connection.accessToken) || "";
}

/** Refresh if the access token is within 5 min of expiry (proactive). Native
 *  transport only — bridge connections have no local tokens. */
export async function ensureValidNativeToken(connection: Conn): Promise<Conn> {
  const expiry = connection.expiresAt;
  if (!expiry || expiry.getTime() - Date.now() < 5 * 60 * 1000) {
    return refreshNativeToken(connection);
  }
  return connection;
}

// --------------------------------------------------------------------------
// 6. Keep-alive — never let a quiet client's 100-day window lapse
// --------------------------------------------------------------------------
/**
 * Proactively refresh native connections so the rolling 100-day refresh token
 * stays alive even for clients we haven't read in weeks. Refreshes when the
 * access token is expired/near-expiry OR the connection hasn't been touched in
 * `staleDays`. Best-effort + isolated: one failure never blocks the others.
 */
export async function keepAliveNativeConnections(staleDays = 7): Promise<{ refreshed: number; reconnect: number; skipped: number }> {
  const db = getDb();
  let refreshed = 0, reconnect = 0, skipped = 0;
  let rows: Conn[] = [];
  try {
    rows = await db.select().from(qboConnections)
      .where(and(eq(qboConnections.transport, "native"), eq(qboConnections.isActive, true)));
  } catch (e) {
    console.error("[qbo-oauth] keep-alive query failed:", e instanceof Error ? e.message : e);
    return { refreshed, reconnect, skipped };
  }
  const staleMs = staleDays * 86_400_000;
  for (const c of rows) {
    try {
      const nearExpiry = !c.expiresAt || c.expiresAt.getTime() - Date.now() < 10 * 60 * 1000;
      const stale = !c.updatedAt || Date.now() - c.updatedAt.getTime() > staleMs;
      if (!nearExpiry && !stale) { skipped++; continue; }
      await refreshNativeToken(c);
      refreshed++;
    } catch (e) {
      if (e instanceof ReconnectRequiredError) reconnect++;
      else console.error(`[qbo-oauth] keep-alive refresh #${c.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  if (refreshed || reconnect) console.log(`[qbo-oauth] keep-alive: refreshed ${refreshed}, reconnect-needed ${reconnect}, skipped ${skipped}`);
  return { refreshed, reconnect, skipped };
}

/** Add the nullable `reconnectReason` column (libsql ALTER is nullable-only —
 *  mirrors bridge-bootstrap / vendor-learning). Safe to call repeatedly. */
export async function ensureOAuthColumns(): Promise<void> {
  const db = getDb();
  const { sql } = await import("drizzle-orm");
  const have = new Set<string>();
  try {
    const res: any = await db.run(sql`PRAGMA table_info(qbo_connections)`);
    for (const r of (res?.rows ?? res ?? [])) have.add(String((r as any).name ?? (r as any)[1] ?? ""));
  } catch (e) { console.error("[qbo-oauth] table_info failed:", e instanceof Error ? e.message : e); }
  if (!have.has("reconnectReason")) {
    try { await db.run(sql`ALTER TABLE qbo_connections ADD COLUMN "reconnectReason" text`); console.log("[qbo-oauth] added column: reconnectReason"); }
    catch (e) { console.error("[qbo-oauth] add reconnectReason failed:", e instanceof Error ? e.message : e); }
  }
}
