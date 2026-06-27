/**
 * SMART MONEY ROUTER — find + track money-saving/making opportunities.
 * =============================================================================
 * - scan: build a profile-tailored prompt (opportunities-core) and run a LIVE web
 *   search via the brain (Claude + web_search) for one category. Returns suggestions
 *   with source links — NOT saved, NOT advice; Markie reviews and saves the good ones.
 * - list / save / setStatus / update / remove: the per-client (and firm) tracker.
 * Defensive: no ANTHROPIC_API_KEY → scan returns a clear "off" result; manual save
 * still works. Off switch: FIGGY_OPPORTUNITIES=off.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import {
  buildSearchPrompt, parseOpportunities, dedupeAgainst, normalizeProvince,
  OPP_CATEGORIES, type OppCategory, type ClientProfile,
} from "./opportunities-core";

const catEnum = z.enum(["grants", "wsib", "tax_credit", "cost_saving", "credit_card"]);

/** Build the search profile from a client row (or the firm when clientId is null). */
async function profileFor(clientId: number | null, cardPreference?: ClientProfile["cardPreference"]): Promise<ClientProfile> {
  if (clientId == null) {
    return { name: "Go Fig Bookz", isFirm: true, province: "ON", country: "Canada", industry: "accounting / bookkeeping", cardPreference: cardPreference ?? null };
  }
  const c = ((await getDb().all(sql`SELECT name, address, industry, hasWSIB, hasPayroll, clientType FROM clients WHERE id=${clientId} LIMIT 1`)) as any[])[0] || {};
  // Province from the address tail (e.g. "…, Owen Sound, ON").
  const m = String(c.address || "").match(/\b([A-Z]{2})\b\s*$/);
  return {
    name: c.name || `Client ${clientId}`,
    province: normalizeProvince(m?.[1] || "ON"),
    country: "Canada",
    industry: c.industry || null,
    hasWSIB: !!c.hasWSIB,
    cardPreference: cardPreference ?? null,
  };
}

/** Run the live web-search scan for one category. Returns {ok, items, error?}. */
async function runScan(profile: ClientProfile, category: OppCategory): Promise<{ ok: boolean; items: ReturnType<typeof parseOpportunities>; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.FIGGY_OPPORTUNITIES === "off") return { ok: false, items: [], error: "ai_off" };
  const model = process.env.FIGGY_OPP_MODEL || process.env.FIGGY_CLASSIFY_MODEL || "claude-haiku-4-5";
  const { system, user } = buildSearchPrompt(profile, category);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 1800,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
        system, messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return { ok: false, items: [], error: `http_${res.status}` };
    const data: any = await res.json();
    const text = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("\n");
    return { ok: true, items: parseOpportunities(text, category) };
  } catch (e) {
    return { ok: false, items: [], error: e instanceof Error ? e.message : "scan_failed" };
  } finally { clearTimeout(timer); }
}

export const opportunitiesRouter = createRouter({
  categories: staffQuery.query(() => OPP_CATEGORIES),

  /** Live scan for one category (review-gated; nothing is saved here). */
  scan: staffQuery
    .input(z.object({ clientId: z.number().nullable(), category: catEnum, cardPreference: z.enum(["travel", "cashback", "low_interest", "no_fee"]).optional() }))
    .mutation(async ({ input }) => {
      const profile = await profileFor(input.clientId, input.cardPreference ?? null);
      const r = await runScan(profile, input.category);
      // Hide ones already saved for this client/category so a re-scan only shows new finds.
      const saved = (await getDb().all(sql`SELECT title, url FROM client_opportunities
        WHERE category=${input.category} AND ${input.clientId == null ? sql`clientId IS NULL` : sql`clientId=${input.clientId}`}`)) as any[];
      const fresh = dedupeAgainst(r.items, saved.map((s) => ({ title: s.title, url: s.url || "" })));
      return { ok: r.ok, error: r.error, profile: { name: profile.name, province: profile.province, industry: profile.industry }, items: fresh };
    }),

  list: staffQuery.input(z.object({ clientId: z.number().nullable() })).query(async ({ input }) => {
    const db = getDb();
    return (await db.all(sql`SELECT * FROM client_opportunities
      WHERE ${input.clientId == null ? sql`clientId IS NULL` : sql`clientId=${input.clientId}`}
      ORDER BY (status='won') DESC, (status='applied') DESC, createdAt DESC`)) as any[];
  }),

  save: staffQuery
    .input(z.object({
      clientId: z.number().nullable(), category: catEnum, title: z.string().min(1).max(200),
      summary: z.string().max(800).optional(), estValue: z.string().max(120).optional(),
      eligibility: z.string().max(600).optional(), url: z.string().max(600).optional(), source: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb(); const now = Date.now();
      await db.run(sql`INSERT INTO client_opportunities (clientId, category, title, summary, estValue, eligibility, url, source, status, savedBy, createdAt, updatedAt)
        VALUES (${input.clientId}, ${input.category}, ${input.title}, ${input.summary ?? null}, ${input.estValue ?? null},
        ${input.eligibility ?? null}, ${input.url ?? null}, ${input.source ?? null}, 'suggested', ${ctx.user.id}, ${now}, ${now})`);
      return { ok: true as const };
    }),

  setStatus: staffQuery
    .input(z.object({ id: z.number(), status: z.enum(["suggested", "reviewing", "applied", "won", "dismissed"]) }))
    .mutation(async ({ input }) => {
      await getDb().run(sql`UPDATE client_opportunities SET status=${input.status}, updatedAt=${Date.now()} WHERE id=${input.id}`);
      return { ok: true as const };
    }),

  update: staffQuery
    .input(z.object({ id: z.number(), notes: z.string().max(1000).nullable().optional(), estValue: z.string().max(120).nullable().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb(); const cur = ((await db.all(sql`SELECT notes, estValue FROM client_opportunities WHERE id=${input.id} LIMIT 1`)) as any[])[0];
      if (!cur) return { ok: false as const };
      await db.run(sql`UPDATE client_opportunities SET notes=${input.notes === undefined ? cur.notes : input.notes}, estValue=${input.estValue === undefined ? cur.estValue : input.estValue}, updatedAt=${Date.now()} WHERE id=${input.id}`);
      return { ok: true as const };
    }),

  remove: staffQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await getDb().run(sql`DELETE FROM client_opportunities WHERE id=${input.id}`); return { ok: true as const };
  }),
});
