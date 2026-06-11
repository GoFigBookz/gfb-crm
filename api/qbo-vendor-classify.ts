/**
 * FIGGY JR — VENDOR COLD-START CLASSIFIER (review-gated HINT)
 * =============================================================================
 * When a vendor has NO coding history, Figgy can't learn from the past — but it
 * can still offer a HINT about what kind of business it is (gas station,
 * restaurant, …) so Markie isn't staring at a blank "needs an account".
 *
 * GOLDEN-RULE SAFE: this is a SUGGESTION ONLY.
 *  - It maps to an account that ALREADY EXISTS in the locked chart (per-client
 *    map of real account ids) — it never invents an account.
 *  - It is always LOW confidence and stays FLAGGED for human review — never
 *    auto-posts.
 *  - Only once Markie confirms does the brain learn it (Vendor Memory); after
 *    that the vendor is coded from history like everyone else.
 *
 * Two layers:
 *  1) NAME KEYWORDS (this file) — instant, free, offline. Covers the common
 *     buckets (gas/fuel, restaurants/takeout, …).
 *  2) WEB LOOKUP (pluggable, wired separately) — for names the keywords don't
 *     recognize: search the web to classify the vendor into one of these same
 *     categories, then feed it through the SAME review-gated hint. See
 *     `codingHintForVendor(..., webCategory?)`.
 *
 * Tax note (Clark OS): meals use the M&E tax code (7, 50%-deductible, rate ref
 * 15); fuel uses HST-on (6). The per-client category map carries the tax code.
 * =============================================================================
 */

export type VendorCategoryId = "meals" | "fuel" | "office" | "telecom" | "utilities" | "shipping";

const KEYWORD_RULES: { category: VendorCategoryId; label: string; re: RegExp }[] = [
  { category: "fuel", label: "gas station / fuel",
    re: /\b(esso|shell|petro[-\s]?canada|petrocan|ultramar|husky|pioneer|mobil|chevron|irving|costco gas|canadian tire gas|circle k|7[-\s]?eleven|gas bar|gasoline|petroleum|fuel)\b/i },
  { category: "meals", label: "restaurant / takeout",
    re: /\b(restaurant|takeout|take[-\s]?out|caf[eé]|coffee|tim hortons|timhortons|mcdonald'?s?|starbucks|subway|pizza|pizzeria|grill|diner|bistro|tavern|\bpub\b|brewery|wendy'?s?|burger king|harvey'?s?|a&w|kfc|taco|sushi|deli|bakery|donut|doughnut|eatery|steakhouse)\b/i },
  { category: "shipping", label: "courier / freight",
    re: /\b(fedex|ups|purolator|dhl|canpar|loomis|canada post|freight|courier)\b/i },
  { category: "telecom", label: "phone / internet",
    re: /\b(bell|rogers|telus|fido|koodo|videotron|cogeco|virgin plus|mobile|wireless|telecom)\b/i },
];

/** Match a vendor name to a category by keyword. Returns null if unrecognized. */
export function classifyVendorByName(name: string): { category: VendorCategoryId; label: string; matched: string } | null {
  const n = (name || "").toLowerCase();
  for (const r of KEYWORD_RULES) {
    const m = n.match(r.re);
    if (m) return { category: r.category, label: r.label, matched: m[0] };
  }
  return null;
}

export type CategoryCoding = { accountId: string; accountName: string; taxCode: string | null };
/** Per-client map: category -> a REAL account in that client's locked chart. */
export type CategoryCodingMap = Partial<Record<VendorCategoryId, CategoryCoding>>;

export type VendorCodingHint = {
  category: VendorCategoryId;
  accountId: string;
  accountName: string;
  taxCode: string | null;
  confidence: number; // a hint, not history — always low
  rationale: string;
  source: "name" | "web";
};

/**
 * Build a review-gated coding hint for a vendor with no history.
 * `webCategory` (optional) is the result of the web-lookup layer; if provided it
 * takes precedence over name keywords. Returns null when nothing classifies OR
 * the category isn't mapped to a real account for this client (never guesses).
 */
export function codingHintForVendor(
  name: string,
  map: CategoryCodingMap,
  webCategory?: { category: VendorCategoryId; label: string } | null,
): VendorCodingHint | null {
  const hit = webCategory
    ? { category: webCategory.category, label: webCategory.label, matched: "web lookup" }
    : classifyVendorByName(name);
  if (!hit) return null;
  const coding = map[hit.category];
  if (!coding) return null; // category not in this client's chart map -> no guess
  return {
    category: hit.category,
    accountId: coding.accountId,
    accountName: coding.accountName,
    taxCode: coding.taxCode,
    confidence: 40,
    rationale: `No prior history for this vendor. ${webCategory ? "A web lookup suggests" : `The name "${name}" looks like`} a ${hit.label}${webCategory ? "" : ` (matched "${hit.matched}")`} → suggest ${coding.accountName}${coding.taxCode ? ` at tax code ${coding.taxCode}` : ""}. Please confirm — Figgy will then remember this vendor.`,
    source: webCategory ? "web" : "name",
  };
}
