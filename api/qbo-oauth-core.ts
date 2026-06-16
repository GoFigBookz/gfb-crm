/**
 * QBO OAuth — pure token-lifecycle core (Phase 0).
 *
 * Dependency-free decision logic for native QuickBooks OAuth 2.0, kept separate
 * from I/O (fetch/db) so it can be verified in isolation:
 *   node --experimental-strip-types scripts/qbo-oauth-verify.ts
 *
 * The hard-won rules this encodes (see docs/FIGS_AGENT_BROWSER_HANDOFF.md and
 * CLAUDE.md "native OAuth: token rotation persisted, keep-alive, no cascade"):
 *  - QBO access token lives ~1h; refresh token lives 100 days but ROTATES on
 *    (roughly) every refresh — so the NEW refresh_token must be persisted every
 *    time or the realm is lost (invalid_grant on the next refresh).
 *  - Concurrent refreshes that each spend the rotating refresh token are the
 *    classic multi-tenant cascade bug — the transport layer must single-flight;
 *    this core just makes the decisions deterministic and testable.
 */

/** Refresh the access token this far BEFORE it actually expires (clock skew +
 *  in-flight request budget). 5 min matches the existing scheduler heuristic. */
export const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000;

/** QBO access tokens default to 1h when the response omits expires_in. */
export const DEFAULT_ACCESS_TOKEN_TTL_S = 3600;

/** The refresh token is valid 100 days; refresh idle realms well before that so
 *  a quiet client never silently dies. 70 days leaves a 30-day safety margin. */
export const KEEP_ALIVE_MAX_IDLE_DAYS = 70;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Should we refresh the access token before using it?
 * No expiry on record -> treat as expired (force a refresh). Otherwise refresh
 * once we're within the skew window of expiry.
 */
export function accessTokenExpired(
  expiresAt: Date | number | null | undefined,
  now: Date | number,
  skewMs: number = ACCESS_TOKEN_SKEW_MS,
): boolean {
  if (expiresAt == null) return true;
  const exp = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt;
  const t = now instanceof Date ? now.getTime() : now;
  return exp - t < skewMs;
}

/** Intuit signals a spent/revoked refresh token with HTTP 400 + invalid_grant.
 *  That realm needs re-authorization; retrying or refreshing again won't fix it. */
export function isInvalidGrant(status: number, body: string): boolean {
  if (status !== 400 && status !== 401) return false;
  return /invalid_grant/i.test(body || "");
}

/** Shape of Intuit's token endpoint success payload (the fields we use). */
export interface QboTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** The persisted token fields after a successful (re)authorization. */
export interface RotatedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  lastRefreshAt: Date;
  authError: null;
}

/**
 * Compute the new persisted token state from a token-endpoint response.
 * CRITICAL: always keep the rotated refresh_token. Intuit returns a fresh
 * refresh_token on most refreshes; if (and only if) the response omits one, the
 * previous token is still valid and is carried forward. Dropping a rotated token
 * is what kills a realm, so this is the single place that decision is made.
 */
export function applyTokenRotation(
  prev: { refreshToken: string | null | undefined },
  resp: QboTokenResponse,
  now: Date = new Date(),
): RotatedTokens {
  const refreshToken = resp.refresh_token ?? prev.refreshToken ?? "";
  const ttl = resp.expires_in ?? DEFAULT_ACCESS_TOKEN_TTL_S;
  return {
    accessToken: resp.access_token,
    refreshToken,
    expiresAt: new Date(now.getTime() + ttl * 1000),
    lastRefreshAt: now,
    authError: null,
  };
}

/**
 * Should an otherwise-idle native connection be proactively refreshed to keep
 * its rotating refresh token alive? True once it's been longer than maxIdleDays
 * since the last successful refresh (falling back to last update for rows that
 * predate lastRefreshAt). Bridge/inactive connections are never kept alive here.
 */
export function needsKeepAlive(
  conn: {
    transport: string;
    isActive: boolean;
    lastRefreshAtMs: number | null;
    fallbackMs: number | null;
  },
  now: Date | number,
  maxIdleDays: number = KEEP_ALIVE_MAX_IDLE_DAYS,
): boolean {
  if (conn.transport !== "native") return false;
  if (!conn.isActive) return false;
  const t = now instanceof Date ? now.getTime() : now;
  const last = conn.lastRefreshAtMs ?? conn.fallbackMs;
  if (last == null) return true; // never refreshed and no anchor -> refresh now
  return t - last > maxIdleDays * DAY_MS;
}
