/**
 * Get a VALID Google access token for a connected account, refreshing via the
 * stored refresh token when expired (and persisting the new one). Shared by the
 * Gmail sync and by send/reply so both keep working past the 1-hour token life.
 */
import { getDb } from "./queries/connection";
import { connectedAccounts } from "../db/schema";
import { eq } from "drizzle-orm";

type Account = typeof connectedAccounts.$inferSelect;

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
