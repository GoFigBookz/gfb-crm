/**
 * FIGGY JR — LIVE GOVERNMENT REGISTRY LOOKUP (on client add)
 * =============================================================================
 * Markie (2026-06-21): "when I add a client it does the government registry
 * search like my client master directory and adds the bio, CRA number,
 * registration number, incorporation date, all of that."
 *
 * Given a business name (+ optional province/known CRA BN), asks Claude — with
 * the server-side web_search tool — to look the company up in Canada's Business
 * Registries / Ontario Business Registry / OpenCorporates and return structured
 * registry facts as JSON. Mirrors the curated research that built the Client
 * Master directory, but live, per new client.
 *
 * DEFENSIVE: returns null on ANY failure (no key, disabled, no network, bad
 * JSON, timeout). Never blocks client creation; the card is just left for manual
 * fill. ON whenever ANTHROPIC_API_KEY is set; disable with FIGGY_GOV_LOOKUP=off.
 * Model via FIGGY_GOV_LOOKUP_MODEL (default claude-haiku-4-5 — cheap + ample).
 *
 * Raw REST (not the SDK) deliberately — one optional call against the stable
 * Messages endpoint, no new dependency for a feature that's dark without a key.
 * =============================================================================
 */
export type GovRegistryResult = {
  bio?: string;
  craBusinessNumber?: string;
  registryNumber?: string;
  incorporationDate?: string;  // YYYY-MM-DD
  corpType?: string;
  governmentStatus?: string;
  industry?: string;
  website?: string;
  address?: string;
  phone?: string;
};

const clean = (v: any): string | undefined => {
  const s = String(v ?? "").trim();
  if (!s || /^(n\/?a|none|unknown|null)$/i.test(s)) return undefined;
  return s;
};

export async function lookupGovRegistry(
  name: string,
  opts?: { province?: string | null; knownBn?: string | null; timeoutMs?: number },
): Promise<GovRegistryResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.FIGGY_GOV_LOOKUP === "off" || !name?.trim()) return null;
  const model = process.env.FIGGY_GOV_LOOKUP_MODEL || "claude-haiku-4-5";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 30_000);
  const hints = [
    opts?.province ? `Province/region: ${opts.province}.` : "",
    opts?.knownBn ? `Known CRA business number: ${opts.knownBn}.` : "",
  ].filter(Boolean).join(" ");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        system:
          `You are a Canadian corporate-registry researcher. Look up the business in Canada's Business ` +
          `Registries (ised-isde.canada.ca/cbr-rec), the Ontario Business Registry, and OpenCorporates. ` +
          `Return ONLY a single JSON object (no prose, no markdown fence) with these keys: ` +
          `bio (2-3 sentence description of what the business does), craBusinessNumber (9 digits), ` +
          `registryNumber (incorporation/registry number), incorporationDate (YYYY-MM-DD), ` +
          `corpType (e.g. "Ontario Business Corp" / "Federal Business Corp"), governmentStatus ` +
          `(e.g. "Active"), industry (short label), website (domain), address, phone. ` +
          `Use "" for any field you cannot verify — never guess a CRA number or a date.`,
        messages: [{ role: "user", content: `Business legal/operating name: "${name}". ${hints}`.trim() }],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => String(b.text ?? ""))
      .join("\n");
    const m = text.match(/\{[\s\S]*\}/); // first JSON object in the reply
    if (!m) return null;
    let parsed: any;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
    const out: GovRegistryResult = {
      bio: clean(parsed.bio),
      craBusinessNumber: clean(parsed.craBusinessNumber)?.replace(/\D/g, "").slice(0, 9) || undefined,
      registryNumber: clean(parsed.registryNumber),
      incorporationDate: clean(parsed.incorporationDate),
      corpType: clean(parsed.corpType),
      governmentStatus: clean(parsed.governmentStatus),
      industry: clean(parsed.industry),
      website: clean(parsed.website)?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      address: clean(parsed.address),
      phone: clean(parsed.phone),
    };
    // Only return if we actually learned something useful.
    return Object.values(out).some(Boolean) ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
