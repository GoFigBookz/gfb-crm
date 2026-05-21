import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "../lib/cookies";
import { Errors } from "@contracts/errors";
import { signSessionToken, verifySessionToken } from "../kimi/session";
import { findUserByUnionId } from "../queries/users";
import { getDb } from "../queries/connection";
import { users } from "../../db/schema";
import { eq, or } from "drizzle-orm";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const REDIRECT_URI = "https://figgy.gofig.ca/api/oauth/callback";

async function exchangeGoogleCode(code: string) {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<{ access_token: string }>;
}

async function getGoogleUserInfo(accessToken: string) {
  const resp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to get Google user info: ${resp.status}`);
  return resp.json() as Promise<{
    sub: string; email: string; name: string; picture: string;
  }>;
}

async function upsertGoogleUser(unionId: string, name: string, email: string) {
  const db = getDb();

  // Check if user exists by unionId
  const byUnionId = await db.select().from(users)
    .where(eq(users.unionId, unionId)).limit(1);

  if (byUnionId[0]) {
    await db.update(users)
      .set({ name, email, lastSignInAt: new Date() })
      .where(eq(users.unionId, unionId));
    return;
  }

  // Check if user exists by email (from old Kimi auth)
  const byEmail = await db.select().from(users)
    .where(eq(users.email, email)).limit(1);

  if (byEmail[0]) {
    // Link Google unionId to existing account
    await db.update(users)
      .set({ unionId, name, lastSignInAt: new Date() })
      .where(eq(users.email, email));
    return;
  }

  // Brand new user — insert
  await db.insert(users).values({
    unionId,
    name,
    email,
    lastSignInAt: new Date(),
  });
}

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) throw Errors.forbidden("Invalid authentication token.");
  const claim = await verifySessionToken(token);
  if (!claim) throw Errors.forbidden("Invalid authentication token.");
  const user = await findUserByUnionId(claim.unionId);
  if (!user) throw Errors.forbidden("User not found. Please re-login.");
  return user;
}

export function createOAuthCallbackHandler() {
  return async (c: Context) => {
    const code = c.req.query("code");
    const error = c.req.query("error");

    if (error) {
      return error === "access_denied"
        ? c.redirect("/", 302)
        : c.json({ error }, 400);
    }

    if (!code) return c.json({ error: "code is required" }, 400);

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID || "";
      const tokens = await exchangeGoogleCode(code);
      const userInfo = await getGoogleUserInfo(tokens.access_token);
      const unionId = `google_${userInfo.sub}`;

      await upsertGoogleUser(unionId, userInfo.name, userInfo.email);

      const token = await signSessionToken({ unionId, clientId });
      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });

      return c.redirect("/", 302);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[OAuth] Google callback failed", message);
      return c.json({ error: "OAuth callback failed", detail: message }, 500);
    }
  };
}
