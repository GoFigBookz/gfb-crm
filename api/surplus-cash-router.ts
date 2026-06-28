/**
 * SURPLUS CASH ROUTER — the on-demand GIC/HISA rate scan + tax math.
 * =============================================================================
 * scanRates: Markie presses a button → Claude (with server-side web_search) pulls
 * CURRENT Canadian GIC + high-interest-savings rates and returns a structured list
 * with an "as of" date. INFORMATION ONLY — not investment advice (the UI carries
 * the disclaimer). On whenever ANTHROPIC_API_KEY is set; otherwise a clear note.
 * analyze: pure passive-income / SBD-grind math (no network).
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { analyzeSurplusCash } from "./surplus-cash-core";

function extractJson(text: string): any | null {
  const a = text.indexOf("["); const b = text.lastIndexOf("]");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fall through */ } }
  const o = text.indexOf("{"); const c = text.lastIndexOf("}");
  if (o >= 0 && c > o) { try { return JSON.parse(text.slice(o, c + 1)); } catch { /* fall through */ } }
  return null;
}

export const surplusCashRouter = createRouter({
  analyze: authedQuery
    .input(z.object({ idleCash: z.number().min(0), ratePct: z.number().min(0).max(100), existingPassive: z.number().min(0).default(0) }))
    .query(async ({ input }) => analyzeSurplusCash(input.idleCash, input.ratePct, input.existingPassive)),

  scanRates: authedQuery
    .input(z.object({ kind: z.enum(["gic", "hisa", "both"]).default("both") }).optional())
    .mutation(async ({ input }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return { ok: false as const, error: "Rate scan needs ANTHROPIC_API_KEY set on the server.", rates: [], asOf: null };
      const kind = input?.kind ?? "both";
      const want = kind === "gic" ? "1-year and 5-year GIC rates" : kind === "hisa" ? "business/personal high-interest savings account rates" : "current 1-year & 5-year GIC rates AND high-interest savings account rates";
      const model = process.env.FIGGY_CLASSIFY_MODEL || "claude-haiku-4-5";
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model,
            max_tokens: 1200,
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
            system: "You are a Canadian bookkeeping assistant gathering CURRENT posted deposit rates for a client conversation. Use web_search to find today's published Canadian rates. Return ONLY a JSON array, no prose. Each item: {\"institution\":string,\"product\":string,\"term\":string,\"ratePct\":number,\"notes\":string}. Include a mix of banks, EQ Bank, Wealthsimple, and credit unions / brokered GICs where available. Do not editorialize or recommend.",
            messages: [{ role: "user", content: `Find ${want} in Canada right now. Return the JSON array.` }],
          }),
        });
        if (!res.ok) return { ok: false as const, error: `Rate scan failed (${res.status}).`, rates: [], asOf: null };
        const data: any = await res.json();
        const text = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("\n");
        const parsed = extractJson(text);
        const rates = Array.isArray(parsed) ? parsed.filter((r: any) => r && typeof r.ratePct === "number") : [];
        return { ok: true as const, rates, asOf: text ? new Date().toISOString().slice(0, 10) : null, raw: rates.length ? undefined : text.slice(0, 400) };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e), rates: [], asOf: null };
      }
    }),
});
