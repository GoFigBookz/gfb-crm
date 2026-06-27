/**
 * SMART MONEY — business-opportunities core (pure, deterministic).
 * =============================================================================
 * Purpose:  Help clients (and Go Fig Bookz itself) SAVE / MAKE money: find current
 *           government grants, WSIB rebate/safety programs, tax credits, cost-saving
 *           programs, and the best-fit business credit card. The actual lookup is a
 *           live web search run by the brain (opportunities-router); THIS file is the
 *           pure part — build the targeted search prompt from a client profile, and
 *           normalize the model's JSON answer into clean opportunity records.
 * Honesty:  Every result is an AI web-research SUGGESTION with a source link, to be
 *           verified before applying — never professional/financial advice. Review-gated.
 * =============================================================================
 */

export type OppCategory = "grants" | "wsib" | "tax_credit" | "cost_saving" | "credit_card" | "software";

export const OPP_CATEGORIES: { key: OppCategory; label: string; focus: string }[] = [
  { key: "grants", label: "Grants & funding", focus: "current government grants, funding programs, and subsidies the business may qualify for" },
  { key: "wsib", label: "WSIB programs", focus: "current WSIB programs, rebates, and safety-incentive programs (e.g. the Health & Safety Excellence program) that could lower premiums or earn rebates" },
  { key: "tax_credit", label: "Tax credits", focus: "current tax credits and incentives the business may qualify for (e.g. SR&ED, apprenticeship, hiring/co-op, digital adoption)" },
  { key: "cost_saving", label: "Cost-saving programs", focus: "current cost-saving programs — utility/energy rebates, group-buying, government-supported discounts" },
  { key: "credit_card", label: "Business credit cards", focus: "best-fit Canadian business credit cards for this business, matched to the stated rewards preference" },
  { key: "software", label: "Software & tools", focus: "the best-fit business software/tools to help the business run beyond accounting (e.g. proposals/quoting, CRM, scheduling, project management, inventory, e-signatures, field service) — match the stated need" },
];

export interface ClientProfile {
  name: string;
  isFirm?: boolean;            // true = Go Fig Bookz / Markie's own
  province?: string | null;    // e.g. "ON"
  country?: string;            // default Canada
  industry?: string | null;
  employees?: number | null;
  hasWSIB?: boolean;
  /** Rewards preference for the credit-card search. */
  cardPreference?: "travel" | "cashback" | "low_interest" | "no_fee" | null;
}

const NORM_PROV: Record<string, string> = {
  ontario: "ON", alberta: "AB", quebec: "QC", "british columbia": "BC", manitoba: "MB",
  saskatchewan: "SK", "nova scotia": "NS", "new brunswick": "NB", "newfoundland": "NL",
  "prince edward island": "PE",
};
export function normalizeProvince(p?: string | null): string | null {
  if (!p) return null;
  const t = p.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return NORM_PROV[t.toLowerCase()] || t;
}

export interface OppSearchPrompt { system: string; user: string }

/** Build the web-search prompt for one category, tailored to the client's profile.
 *  `opts.need` (software) describes what the client wants the tool to do, e.g.
 *  "track proposals". `opts.currentSoftware` lets us avoid recommending what they have. */
export function buildSearchPrompt(profile: ClientProfile, category: OppCategory, opts?: { need?: string; currentSoftware?: string }): OppSearchPrompt {
  const cat = OPP_CATEGORIES.find((c) => c.key === category) || OPP_CATEGORIES[0];
  const country = profile.country || "Canada";
  const prov = normalizeProvince(profile.province);
  const who = profile.isFirm
    ? `an accounting/bookkeeping firm`
    : `a ${profile.industry ? `${profile.industry} ` : ""}business`;
  const where = prov ? `in ${prov}, ${country}` : `in ${country}`;
  const size = profile.employees != null ? ` with about ${profile.employees} employee(s)` : "";
  const wsibNote = profile.hasWSIB ? " The business is WSIB-registered." : "";
  const cardNote = category === "credit_card"
    ? ` The owner's rewards preference is: ${profile.cardPreference || "cash back"}. Prioritize cards matching that preference; include annual fee, reward rate, and a notable perk.`
    : "";
  const need = (opts?.need || "").trim();
  const have = (opts?.currentSoftware || "").trim();
  const softwareNote = category === "software"
    ? ` The specific need is: ${need || "general business management beyond accounting (proposals/quoting, CRM, scheduling, project management)"}.` +
      (have ? ` They ALREADY use: ${have} — don't re-recommend those; suggest complementary or better-fit options.` : "") +
      ` For each tool put pricing in estValue (e.g. 'from $29/mo' or 'free tier') and who it suits in eligibility. Prefer tools popular with Canadian small businesses.`
    : "";

  const system =
    `You are a Canadian small-business advisor researching how a business can save money, make money, or run better. ` +
    `Find ${cat.focus}, current as of today, for ${who} ${where}${size}.${wsibNote}${cardNote}${softwareNote}\n` +
    `Use web_search to verify everything is REAL and CURRENT. Do NOT invent programs, tools, or links. ` +
    `Return ONLY a JSON array (no prose, no code fences) of up to 6 items, each:\n` +
    `{"title":"","summary":"one or two plain sentences","estValue":"e.g. 'up to $5,000' or 'from $29/mo' or '2% cash back'",` +
    `"eligibility":"who it suits / who qualifies, short","url":"official link","source":"org/site name"}\n` +
    `Only include items with a real official URL. If you find nothing credible, return [].`;
  const user = category === "software" && need
    ? `Find software to ${need} for ${profile.isFirm ? "Go Fig Bookz (my own firm)" : profile.name}.`
    : `Find ${cat.label.toLowerCase()} for ${profile.isFirm ? "Go Fig Bookz (my own firm)" : profile.name}.`;
  return { system, user };
}

export interface Opportunity {
  category: OppCategory;
  title: string;
  summary: string;
  estValue: string;
  eligibility: string;
  url: string;
  source: string;
}

const str = (v: any, max = 600) => (typeof v === "string" ? v : v == null ? "" : String(v)).trim().slice(0, max);

/** Pull the JSON array out of a model reply (tolerates code fences / surrounding prose). */
export function extractJsonArray(text: string): any[] {
  if (!text) return [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try { const v = JSON.parse(body.slice(start, end + 1)); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

/** Normalize a model reply into clean Opportunity records (drops anything without a title+url). */
export function parseOpportunities(text: string, category: OppCategory): Opportunity[] {
  return extractJsonArray(text)
    .map((r) => ({
      category,
      title: str(r?.title, 200),
      summary: str(r?.summary, 600),
      estValue: str(r?.estValue ?? r?.value, 80),
      eligibility: str(r?.eligibility, 400),
      url: str(r?.url, 500),
      source: str(r?.source, 160),
    }))
    .filter((o) => o.title && /^https?:\/\//i.test(o.url));
}

const key = (o: { title: string; url: string }) =>
  (o.url || o.title).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);

/** Drop opportunities already saved (by url/title), so a re-scan only shows new finds. */
export function dedupeAgainst<T extends { title: string; url: string }>(found: T[], existing: { title: string; url: string }[]): T[] {
  const seen = new Set(existing.map(key));
  const out: T[] = [];
  for (const f of found) {
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}
