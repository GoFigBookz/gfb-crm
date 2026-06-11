/**
 * FIGGY JR — VENDOR WEB CLASSIFIER (layer 2 of the cold-start classifier)
 * =============================================================================
 * When the name keywords (`qbo-vendor-classify.ts`) don't recognize a vendor,
 * ask Claude — with the server-side web_search tool — what kind of business it
 * is, mapped to one of our coding categories. The result is fed through the SAME
 * review-gated hint (`codingHintForVendor`, source="web"): low confidence,
 * yellow, flagged, never auto-posted, learns only on Markie's confirm.
 *
 * DEFENSIVE BY DESIGN: returns null on ANY failure (no key, disabled, no network,
 * bad/empty response, timeout). A web hiccup can never block coding or inject a
 * wrong account — the brain just falls back to the plain "needs an account" flag.
 *
 * OFF BY DEFAULT: requires BOTH `ANTHROPIC_API_KEY` and `FIGGY_WEB_CLASSIFY=on`.
 * Model via `FIGGY_CLASSIFY_MODEL` (default `claude-opus-4-8`; set
 * `claude-haiku-4-5` for ~5x cheaper high-volume classification).
 *
 * Raw REST (not the SDK) deliberately: one optional call against the stable
 * documented Messages endpoint, so the CRM doesn't take on a new dependency for
 * a feature that's dark unless a key is present. Model id + tool version per the
 * claude-api reference (2026-06).
 * =============================================================================
 */
import type { VendorCategoryId } from "./qbo-vendor-classify";

const CATEGORIES: VendorCategoryId[] = ["meals", "fuel", "shipping", "telecom", "office", "utilities"];
const LABELS: Record<VendorCategoryId, string> = {
  meals: "restaurant / takeout / food",
  fuel: "gas station / fuel",
  shipping: "courier / freight / shipping",
  telecom: "phone / internet / telecom",
  office: "office / hardware / supplies",
  utilities: "utility (power / water / gas)",
};

export async function classifyVendorByWeb(
  name: string,
  opts?: { timeoutMs?: number },
): Promise<{ category: VendorCategoryId; label: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.FIGGY_WEB_CLASSIFY !== "on" || !name?.trim()) return null;
  const model = process.env.FIGGY_CLASSIFY_MODEL || "claude-opus-4-8";
  const list = CATEGORIES.join(", ");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 15_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
        system:
          `You categorize a business vendor for bookkeeping. Use web_search ONLY if the name is unfamiliar. ` +
          `Reply with EXACTLY ONE token from this list, or "unknown" — and nothing else: ${list}.`,
        messages: [{ role: "user", content: `Vendor name: "${name}". Which category?` }],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => String(b.text ?? ""))
      .join(" ")
      .toLowerCase();
    const hit = CATEGORIES.find((c) => new RegExp(`\\b${c}\\b`).test(text));
    return hit ? { category: hit, label: LABELS[hit] } : null;
  } catch {
    return null; // network error, abort/timeout, bad JSON — degrade safely
  } finally {
    clearTimeout(timer);
  }
}
