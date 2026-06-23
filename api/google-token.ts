/**
 * Get a VALID Google access token for a connected account, refreshing via the
 * stored refresh token when expired (and persisting the new one). Shared by the
 * Gmail sync and by send/reply so both keep working past the 1-hour token life.
 */
import { getDb } from "./queries/connection";
import { connectedAccounts } from "../db/schema";
import { eq } from "drizzle-orm";

type Account = typeof connectedAccounts.$inferSelect;

/**
 * The firm's Google account — FIRM-WIDE, not per-user. There is one Gmail/Drive
 * login for the whole practice, so reads must not depend on which staff-user row
 * the OAuth happened to land on (that mismatch made it show "Not Connected" even
 * when connected). Prefers a given user's row, else any active Google account
 * with a refresh token. Selects only core columns to dodge schema drift.
 */
export async function getFirmGoogleAccount(preferUserId?: number): Promise<any | null> {
  const db = getDb();
  const rows = (await db.select({
    id: connectedAccounts.id,
    userId: connectedAccounts.userId,
    provider: connectedAccounts.provider,
    accountEmail: connectedAccounts.accountEmail,
    accessToken: connectedAccounts.accessToken,
    refreshToken: connectedAccounts.refreshToken,
    expiresAt: connectedAccounts.expiresAt,
    isActive: connectedAccounts.isActive,
  }).from(connectedAccounts)) as any[];
  const google = rows.filter((a) => a.provider === "google");
  const score = (a: any) => (a.refreshToken ? 4 : 0) + (a.isActive ? 2 : 0) + (preferUserId && a.userId === preferUserId ? 1 : 0);
  google.sort((a, b) => score(b) - score(a));
  return google[0] || null;
}

export async function getValidGoogleAccessToken(account: Account): Promise<string> {
  const notExpired = account.expiresAt && new Date(account.expiresAt) > new Date(Date.now() + 60_000);
  if (account.accessToken && notExpired) return account.accessToken;
  if (!account.refreshToken) {
    if (account.accessToken) return account.accessToken; // no refresh available — try as-is
    throw new Error("Google account not authenticated (no token). Reconnect it in Integrations.");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: account.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token refresh failed (${res.status}). Reconnect the account in Integrations.`);
  }
  await getDb().update(connectedAccounts).set({
    accessToken: data.access_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
  }).where(eq(connectedAccounts.id, account.id));
  return data.access_token as string;
}
