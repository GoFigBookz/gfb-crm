/**
 * DUPLICATE-CLIENT DETECTOR — pure core (read-only, deterministic).
 * =============================================================================
 * Purpose:  Surface LIKELY duplicate client cards for a human to review (Markie:
 *           "merge-duplicate client cards tool"). This is the SAFE half — detection
 *           only. It never merges: merging re-points data across many tables and a
 *           blind merge could collapse two separate QBO realms into one, which would
 *           violate the per-client-isolation golden rule (Clark OS / Clark CW must
 *           NEVER merge). So we detect + explain + let the human decide.
 * Signals:  exact-ish name match (normalized), shared email / phone / HST # / tax ID.
 *           Each shared identifier is strong; a name-only match is weaker.
 * Output:   candidate pairs with the reasons + a strength score, strongest first.
 * =============================================================================
 */

export interface DupClient {
  id: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  hstNumber?: string | null;
  taxId?: string | null;
  status?: string | null;
}

export interface DupPair {
  a: DupClient;
  b: DupClient;
  reasons: string[];
  score: number;          // higher = more likely a duplicate
  strength: "strong" | "likely" | "possible";
}

const normName = (s?: string | null) =>
  (s || "").toLowerCase()
    .replace(/\b(inc|incorporated|ltd|limited|corp|corporation|co|company|the|and|&)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

const normEmail = (s?: string | null) => (s || "").toLowerCase().trim();
const digits = (s?: string | null) => (s || "").replace(/\D/g, "");
const normId = (s?: string | null) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// HST/BN numbers in Canada: the first 9 digits are the business number; the RT0001
// suffix is just the program account. Compare on the 9-digit BN so RT/RP variants tie.
const bn9 = (s?: string | null) => digits(s).slice(0, 9);

/**
 * Compare every pair of clients once and keep those that share a strong identifier
 * or have an (near-)identical normalized name. O(n²) — fine for a firm's client list.
 */
export function findDuplicateClients(clients: DupClient[]): DupPair[] {
  const pairs: DupPair[] = [];
  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const a = clients[i], b = clients[j];
      const reasons: string[] = [];
      let score = 0;

      const an = normName(a.name), bn = normName(b.name);
      if (an && bn && an === bn) { reasons.push("Same name"); score += 5; }
      else if (an && bn && (an.includes(bn) || bn.includes(an)) && Math.min(an.length, bn.length) >= 4) {
        reasons.push("Name contains the other"); score += 3;
      }

      const ae = normEmail(a.email), be = normEmail(b.email);
      if (ae && be && ae === be) { reasons.push("Same email"); score += 5; }

      const ap = digits(a.phone), bp = digits(b.phone);
      if (ap && bp && ap.length >= 7 && ap === bp) { reasons.push("Same phone"); score += 4; }

      const ah = bn9(a.hstNumber), bh = bn9(b.hstNumber);
      if (ah && bh && ah.length === 9 && ah === bh) { reasons.push("Same HST/business number"); score += 6; }

      const at = normId(a.taxId), bt = normId(b.taxId);
      if (at && bt && at === bt) { reasons.push("Same tax ID"); score += 6; }

      // Surface anything with at least a name-contains hint (3) or stronger; the
      // human confirms. Strong = a shared hard identifier (HST/tax/email + more).
      if (score >= 3) {
        pairs.push({
          a, b, reasons, score,
          strength: score >= 8 ? "strong" : score >= 5 ? "likely" : "possible",
        });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
