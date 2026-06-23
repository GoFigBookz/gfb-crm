/**
 * ADMIN/WEBHOOK SECRET CHECK — fails CLOSED.
 * A provided token is valid only if the matching env secret is configured AND
 * matches. If the secret isn't set (or is too short), NOTHING is accepted — no
 * guessable hardcoded default. This replaces the old `env || "gfb-*-2026"`
 * pattern that let anyone trigger admin endpoints by guessing the default.
 */
export function checkSecret(provided: string | undefined | null, envName: string): boolean {
  const secret = process.env[envName];
  if (!secret || secret.length < 8) return false; // not configured → deny everything
  return provided === secret;
}
