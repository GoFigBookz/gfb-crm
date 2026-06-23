/**
 * Canonical Google OAuth redirect URI — used by BOTH the authorize step
 * (integration-router) and the token-exchange step (boot callback). Google
 * requires the two to match each other AND a value registered on the OAuth
 * client, so they MUST come from one place.
 *
 * Priority: explicit GOOGLE_REDIRECT_URI, else the app URL with any trailing
 * slash stripped (a stray slash → "…ca//api/…" → redirect_uri_mismatch).
 */
export function googleRedirectUri(): string {
  const explicit = (process.env.GOOGLE_REDIRECT_URI || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const base = (process.env.VITE_APP_URL || "https://figgy.gofig.ca").trim().replace(/\/+$/, "");
  return `${base}/api/oauth/google/callback`;
}
