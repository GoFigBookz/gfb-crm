/**
 * RESELLER ENGINE — listing generator (Markie 2026-06-27: "I want a whole system I
 * can sell my stuff with"; Rose first, then 700 frames).
 * =============================================================================
 * Purpose:  Skye drafts ready-to-post resale listings for a Side-Sales product,
 *           tailored per channel (Marketplace / Kijiji / eBay / niche groups).
 *           You paste-and-post — Facebook Marketplace has NO public listing API,
 *           and unofficial auto-posters violate Meta ToS, so drafts are the safe play.
 * Inputs:   a product (name, category, condition, floor + target price, discreet flag,
 *           notes) + the channels to draft for.
 * Outputs:  one { channel, title, body, price, hashtags } per channel.
 * Model:    uses the cheap workhorse (Haiku) for a one-shot draft — pennies. If no
 *           key/parse fails, falls back to a deterministic template so it ALWAYS
 *           returns usable listings (never blocks on the AI).
 * Limitations: drafts only — never posts. Respects the "discreet" flag (tasteful,
 *           no explicit wording) for sensitive items.
 * =============================================================================
 */
import Anthropic from "@anthropic-ai/sdk";

export interface ListingProduct {
  name: string; category?: string | null; condition?: string | null;
  minPrice?: number | null; targetPrice?: number | null; discreet?: boolean | null; notes?: string | null;
}
export interface DraftListing { channel: string; title: string; body: string; price: number | null; hashtags: string; }

const CHANNEL_NOTES: Record<string, string> = {
  marketplace: "Facebook Marketplace — short punchy title, friendly local-pickup tone, condition + why-selling, clear price. Add 'porch pickup / can ship'.",
  kijiji: "Kijiji — practical, detail-forward, local. Title with the key noun first for search.",
  ebay: "eBay — keyword-rich title (brand, model, size, condition), structured description, shipping noted, buyer-search optimized.",
  groups: "Niche Facebook/community groups — warm, member-to-member tone; lead with the benefit + a soft CTA to DM.",
};

const fmtPrice = (n?: number | null) => (n != null && n > 0 ? `$${n}` : "");

/** Deterministic fallback so listings always generate, even with no model. */
function templateListing(p: ListingProduct, channel: string): DraftListing {
  const price = p.targetPrice || p.minPrice || null;
  const cond = p.condition || "Brand new";
  const discreetTail = p.discreet ? " Discreet packaging, ships from Canada." : "";
  return {
    channel,
    title: `${p.name}${p.category ? ` — ${p.category}` : ""} (${cond})`,
    body: `${cond} ${p.name}.${p.notes ? ` ${p.notes}.` : ""} ${fmtPrice(price)} ${channel === "ebay" ? "Ships fast." : "Local pickup or can ship."}${discreetTail} Message to grab it.`.replace(/\s+/g, " ").trim(),
    price,
    hashtags: [p.category, p.name].filter(Boolean).map((s) => "#" + String(s).replace(/[^a-z0-9]+/gi, "")).join(" "),
  };
}

/** Generate channel-tailored listings for a product. AI draft → template fallback. */
export async function generateListings(p: ListingProduct, channels: string[]): Promise<DraftListing[]> {
  const chans = channels.length ? channels : ["marketplace", "kijiji", "ebay"];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // The cheap workhorse — a resale listing never needs a premium model.
  const model = process.env.FIGGY_ASSISTANT_MODEL || "claude-haiku-4-5";
  if (!apiKey || process.env.FIGGY_LLM_PROVIDER === "openai") {
    return chans.map((c) => templateListing(p, c)); // honest fallback (no Anthropic key / non-Anthropic provider)
  }
  try {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
    const discreet = p.discreet
      ? "This item is SENSITIVE/DISCREET — keep it tasteful and non-explicit; emphasize 'brand new, sealed, discreet packaging' and avoid anything that would get the post removed."
      : "";
    const system = "You are Skye, a sharp resale marketer. Write listings that sell fast and honestly — strong scroll-stopping title, concise persuasive body (condition, what it is, why it's a great buy), and a clear price + DM call-to-action. Never exaggerate or misrepresent condition. Canadian seller. Output ONLY valid JSON, no prose.";
    const user = [
      `Product: ${p.name}`,
      p.category ? `Category: ${p.category}` : "",
      p.condition ? `Condition: ${p.condition}` : "Condition: Brand new",
      p.targetPrice ? `Target price: $${p.targetPrice}` : "",
      p.minPrice ? `Floor (don't go below): $${p.minPrice}` : "",
      p.notes ? `Notes: ${p.notes}` : "",
      discreet,
      "",
      `Write ONE listing for EACH of these channels: ${chans.join(", ")}.`,
      "Channel guidance:",
      ...chans.map((c) => `- ${c}: ${CHANNEL_NOTES[c] || "general resale listing"}`),
      "",
      'Return JSON: {"listings":[{"channel":"...","title":"...","body":"...","price":<number or null>,"hashtags":"#a #b"}]}',
    ].filter(Boolean).join("\n");

    const data: any = await client.messages.create({ model, max_tokens: 1200, system, messages: [{ role: "user", content: user }] } as any);
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json);
    const list: DraftListing[] = (parsed.listings || []).map((l: any) => ({
      channel: String(l.channel || "").toLowerCase() || "marketplace",
      title: String(l.title || p.name),
      body: String(l.body || ""),
      price: typeof l.price === "number" ? l.price : (p.targetPrice || p.minPrice || null),
      hashtags: String(l.hashtags || ""),
    }));
    // Make sure every requested channel has a listing (fill gaps from template).
    return chans.map((c) => list.find((l) => l.channel === c) || templateListing(p, c));
  } catch {
    return chans.map((c) => templateListing(p, c)); // any failure → still usable
  }
}
