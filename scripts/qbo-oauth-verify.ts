/**
 * Standalone verification of the QBO OAuth token-lifecycle core (Phase 0),
 * runnable with Node's type-stripping (no test runner):
 *   node --experimental-strip-types scripts/qbo-oauth-verify.ts
 *
 * Pure logic only — no network, no db. Proves the rules that keep a realm alive:
 * refresh-when-expiring, ALWAYS persist the rotated refresh token, detect
 * invalid_grant, and keep-alive selection for idle connections.
 */
import assert from "node:assert/strict";
import {
  ACCESS_TOKEN_SKEW_MS,
  KEEP_ALIVE_MAX_IDLE_DAYS,
  accessTokenExpired,
  applyTokenRotation,
  isInvalidGrant,
  needsKeepAlive,
} from "../api/qbo-oauth-core.ts";

let pass = 0;
const check = (name: string, fn: () => void) => { fn(); pass++; console.log("  ✓", name); };

const now = new Date("2026-06-16T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

// --- accessTokenExpired -------------------------------------------------------
check("null expiry -> treat as expired (force refresh)", () => {
  assert.equal(accessTokenExpired(null, now), true);
  assert.equal(accessTokenExpired(undefined, now), true);
});
check("fresh token (1h out) -> not expired", () => {
  assert.equal(accessTokenExpired(new Date(now.getTime() + 60 * 60 * 1000), now), false);
});
check("inside the skew window -> expired", () => {
  const exp = new Date(now.getTime() + ACCESS_TOKEN_SKEW_MS - 1000);
  assert.equal(accessTokenExpired(exp, now), true);
});
check("already past expiry -> expired", () => {
  assert.equal(accessTokenExpired(new Date(now.getTime() - 1000), now), true);
});
check("accepts epoch millis as well as Date", () => {
  assert.equal(accessTokenExpired(now.getTime() + 60 * 60 * 1000, now.getTime()), false);
});

// --- applyTokenRotation (the realm-killer guardrail) --------------------------
check("rotated refresh_token is persisted (NOT the old one)", () => {
  const r = applyTokenRotation({ refreshToken: "OLD" }, { access_token: "A2", refresh_token: "NEW", expires_in: 3600 }, now);
  assert.equal(r.accessToken, "A2");
  assert.equal(r.refreshToken, "NEW");
  assert.equal(r.authError, null);
});
check("response without a new refresh_token carries the previous one forward", () => {
  const r = applyTokenRotation({ refreshToken: "OLD" }, { access_token: "A2", expires_in: 3600 }, now);
  assert.equal(r.refreshToken, "OLD");
});
check("expiresAt computed from expires_in", () => {
  const r = applyTokenRotation({ refreshToken: "OLD" }, { access_token: "A2", refresh_token: "NEW", expires_in: 3600 }, now);
  assert.equal(r.expiresAt.getTime(), now.getTime() + 3600 * 1000);
  assert.equal(r.lastRefreshAt.getTime(), now.getTime());
});
check("missing expires_in falls back to 1h default", () => {
  const r = applyTokenRotation({ refreshToken: "OLD" }, { access_token: "A2", refresh_token: "NEW" }, now);
  assert.equal(r.expiresAt.getTime(), now.getTime() + 3600 * 1000);
});

// --- isInvalidGrant -----------------------------------------------------------
check("400 invalid_grant -> needs re-auth", () => {
  assert.equal(isInvalidGrant(400, '{"error":"invalid_grant"}'), true);
});
check("401 invalid_grant -> needs re-auth", () => {
  assert.equal(isInvalidGrant(401, "error=invalid_grant"), true);
});
check("transient 500 / other errors -> NOT invalid_grant (retryable)", () => {
  assert.equal(isInvalidGrant(500, "Internal Server Error"), false);
  assert.equal(isInvalidGrant(400, '{"error":"invalid_request"}'), false);
  assert.equal(isInvalidGrant(429, "rate limited"), false);
});

// --- needsKeepAlive -----------------------------------------------------------
const native = (over: Partial<{ transport: string; isActive: boolean; lastRefreshAtMs: number | null; fallbackMs: number | null }>) => ({
  transport: "native", isActive: true, lastRefreshAtMs: null, fallbackMs: null, ...over,
});
check("bridge connections are never kept alive here", () => {
  assert.equal(needsKeepAlive(native({ transport: "make_bridge" }), now), false);
});
check("inactive (needs-reauth) connections are skipped", () => {
  assert.equal(needsKeepAlive(native({ isActive: false, lastRefreshAtMs: now.getTime() }), now), false);
});
check("recently refreshed -> skipped", () => {
  assert.equal(needsKeepAlive(native({ lastRefreshAtMs: now.getTime() - 10 * DAY }), now), false);
});
check("idle past the max-idle window -> due for keep-alive", () => {
  assert.equal(needsKeepAlive(native({ lastRefreshAtMs: now.getTime() - (KEEP_ALIVE_MAX_IDLE_DAYS + 1) * DAY }), now), true);
});
check("no lastRefreshAt falls back to updatedAt anchor", () => {
  assert.equal(needsKeepAlive(native({ fallbackMs: now.getTime() - 5 * DAY }), now), false);
  assert.equal(needsKeepAlive(native({ fallbackMs: now.getTime() - (KEEP_ALIVE_MAX_IDLE_DAYS + 1) * DAY }), now), true);
});
check("no anchor at all -> refresh now (don't leave it dangling)", () => {
  assert.equal(needsKeepAlive(native({ lastRefreshAtMs: null, fallbackMs: null }), now), true);
});

console.log(`\n${pass}/${pass} checks green — QBO OAuth lifecycle core verified.`);
