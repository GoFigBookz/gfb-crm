/**
 * QBO CONNECTION RELINK — pure name-matcher.
 * =============================================================================
 * Purpose:  A QBO realm can get authorized via the generic "Connect to QuickBooks"
 *           button with no clientId in the (signed) OAuth state, so it persists with
 *           clientId = null — an active token bound to NO CRM client. This matches such
 *           an orphaned connection to the right CRM client BY NAME so the per-client
 *           lookup (getConnectionForClient) can find it.
 * Safety:   ISOLATION FIRST — same rule as the bridge bootstrap: bind ONLY when exactly
 *           one active client matches; refuse ambiguous (would cross-pollinate two
 *           clients' books) and refuse none. Never overwrites an existing clientId.
 * Pure:     no DB, no I/O — the caller passes the realm's companyName + the client list.
 * =============================================================================
 */

export interface RelinkClient { id: number; name?: string | null; company?: string | null; status?: string | null }
export type RelinkMatch =
  | { result: "matched"; clientId: number; clientName: string }
  | { result: "ambiguous"; candidates: string[] }
  | { result: "none" };

/** Generic corporate words that don't identify a specific company — never match on these alone. */
const STOP = new Set([
  "inc", "incorporated", "ltd", "limited", "llc", "corp", "corporation", "company", "group",
  "holdings", "the", "and", "construction", "painting", "consulting", "developments",
  "development", "enterprises", "services", "solutions", "ontario", "canada", "industries",
  "international", "global", "capital", "ventures", "co", "pub", "cafe", "café", "health",
]);

/** Significant tokens (>3 chars, alphanumeric, not a generic corporate word). */
export function significantTokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

/**
 * Match a connection's companyName to exactly one active CRM client by shared significant
 * token. Returns matched / ambiguous / none. Inactive clients are ignored. The exactly-one
 * rule is the isolation guard — a wrong bind would mix two clients' books.
 */
export function matchConnectionToClient(companyName: string, clients: RelinkClient[]): RelinkMatch {
  const want = new Set(significantTokens(companyName));
  if (want.size === 0) return { result: "none" };
  const hits = clients.filter((c) => {
    if (c.status && c.status !== "active") return false;
    const ct = new Set([...significantTokens(c.name || ""), ...significantTokens(c.company || "")]);
    for (const w of want) if (ct.has(w)) return true;
    return false;
  });
  if (hits.length === 0) return { result: "none" };
  if (hits.length > 1) return { result: "ambiguous", candidates: hits.map((c) => c.name || c.company || `#${c.id}`) };
  const c = hits[0];
  return { result: "matched", clientId: c.id, clientName: c.name || c.company || `#${c.id}` };
}
