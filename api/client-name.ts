// Client display-name normalization.
//
// Markie's preference (2026-06-20): for numbered companies that trade under a
// real operating name, show the OPERATING name first and the numbered legal
// entity second — e.g.
//   "1001196626 Ontario Ltd. (Sher-E-Punjab)"  ->  "Sher-E-Punjab (1001196626 Ontario Ltd.)"
// Numbered companies with NO trade name (e.g. "2303851 Ontario Inc.") are left
// untouched. The legal number always stays in the string, so every substring
// match we rely on (payroll routing, bridge realm binding, import dedup) keeps
// working — this is purely a human-facing reorder.

// Matches:  <6+ digit number> <Ontario|Canada> <Inc|Ltd|Corp|Corporation>[.]  (TradeName)
// The legal-entity middle is captured loosely so casing/punctuation variants
// ("ONTARIO INC.", "Ontario Ltd") all reorder.
const NUMBERED_WITH_TRADE =
  /^\s*(\d{6,}\s+(?:ontario|canada)\s+(?:inc|ltd|corp|corporation)\.?)\s*\((.+)\)\s*$/i;

/**
 * If `name` is a numbered company with a trade name in parentheses, return it
 * reordered as "TradeName (Numbered Legal Entity)". Otherwise return it
 * unchanged (trimmed). Title-cases the legal-entity suffix for tidiness.
 */
export function reorderNumberedName(name: string | null | undefined): string {
  const raw = (name ?? "").trim();
  if (!raw) return raw;
  const m = raw.match(NUMBERED_WITH_TRADE);
  if (!m) return raw;
  const legal = tidyLegalEntity(m[1]);
  const trade = m[2].trim();
  if (!trade) return raw;
  return `${trade} (${legal})`;
}

// "2303851 ONTARIO INC." -> "2303851 Ontario Inc." (number kept verbatim).
function tidyLegalEntity(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}
