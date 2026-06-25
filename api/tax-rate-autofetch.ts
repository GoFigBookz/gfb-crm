/**
 * FIGGY JR — TAX-RATE AUTO-FETCH (scheduled, AI web-lookup → DB rates table)
 * =============================================================================
 * Markie chose "fully auto-apply + notify" (2026-06-21). Legislated tax rates have
 * no live API, so a scheduled job asks Claude (server-side web_search) for the
 * CURRENT rates, writes them to the `tax_rates` table, and the calculators read
 * from it (fallback = baked-in defaults). A Triage card notes what changed.
 *
 * LOW-STAKES BY DESIGN: the CRM does NOT run payroll (QBO Payroll does). These
 * rates feed the reference calculators + the Originality revenue-share tax-adequacy
 * check only — never real remittances — so auto-applying a web-fetched rate is safe,
 * and the Triage card gives a glance to catch an obviously-wrong scrape.
 *
 * DEFENSIVE: no ANTHROPIC_API_KEY / disabled / bad response → does nothing (the
 * calculators just keep using their baked-in defaults). Off: FIGGY_TAXRATE_FETCH=off.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { taxRates, triageFindings } from "../db/schema";
import { sql, eq } from "drizzle-orm";

const PROVINCES = ["AB", "NB", "NL", "NS", "ON", "PE", "NT", "NU", "YT"];

export async function ensureTaxRatesTable(): Promise<void> {
  const db = getDb();
  try {
    await db.run(sql`CREATE TABLE IF NOT EXISTS tax_rates (
      id integer PRIMARY KEY AUTOINCREMENT,
      key text NOT NULL,
      value real NOT NULL,
      label text,
      effectiveYear integer,
      source text,
      updatedAt integer
    )`);
  } catch (e) { console.error("[tax-fetch] ensure table failed:", e instanceof Error ? e.message : e); }
}

/** Upsert one rate by key (latest write wins). */
async function put(key: string, value: number, label: string, year: number, source: string) {
  const db = getDb();
  const existing = await db.select().from(taxRates).where(eq(taxRates.key, key)).limit(1);
  const row = { key, value, label, effectiveYear: year, source, updatedAt: new Date() };
  if (existing[0]) await db.update(taxRates).set(row).where(eq(taxRates.key, key));
  else await db.insert(taxRates).values(row);
}

/** The whole rates table as a {key: value} map (for the calculators / tRPC). */
export async function getTaxRateMap(): Promise<Record<string, number>> {
  const db = getDb();
  try {
    await ensureTaxRatesTable();
    const rows = await db.select().from(taxRates);
    const m: Record<string, number> = {};
    for (const r of rows as any[]) m[r.key] = r.value;
    return m;
  } catch { return {}; }
}

/**
 * Fetch current rates via web_search and apply them. Returns a summary of changes.
 * Best-effort: returns { ok:false } on any failure without touching the table.
 */
export async function fetchAndApplyTaxRates(opts?: { force?: boolean }): Promise<{ ok: boolean; changed: string[]; year?: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.FIGGY_TAXRATE_FETCH === "off") return { ok: false, changed: [] };
  await ensureTaxRatesTable();
  const before = await getTaxRateMap();
  const model = process.env.FIGGY_CLASSIFY_MODEL || "claude-haiku-4-5";
  const year = new Date().getFullYear() + (new Date().getMonth() >= 10 ? 1 : 0); // Nov/Dec → next year
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        system:
          `You are a Canadian/US tax-rate researcher. Look up the CURRENT (for tax year ${year}) ` +
          `combined GST/HST rates and CRA payroll constants and return ONLY one JSON object, no prose:\n` +
          `{"year":${year},"ca_hst":{"AB":0.05,"NB":0.15,"NL":0.15,"NS":0.14,"ON":0.13,"PE":0.15,"NT":0.05,"NU":0.05,"YT":0.05},` +
          `"ca_cpp_rate":0.0595,"ca_cpp_ympe":0,"ca_cpp_exemption":3500,"ca_cpp_max":0,` +
          `"ca_cpp2_rate":0.04,"ca_cpp2_yampe":0,"ca_cpp2_max":0,` +
          `"ca_ei_rate":0.0163,"ca_ei_mie":0,"ca_ei_max":0,"us_ss_wage_base":0}\n` +
          `Use decimals for rates (13% = 0.13). Use 0 only if you genuinely cannot verify a value. ` +
          `HST keys must be the combined rate (e.g. Nova Scotia is 0.14 since 2025-04-01).`,
        messages: [{ role: "user", content: `Current ${year} GST/HST + CPP/EI constants, as the JSON object.` }],
      }),
    });
    if (!res.ok) return { ok: false, changed: [] };
    const data: any = await res.json();
    const text: string = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("\n");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, changed: [] };
    let p: any; try { p = JSON.parse(m[0]); } catch { return { ok: false, changed: [] }; }
    const yr = Number(p.year) || year;
    const src = `web_search ${new Date().toISOString().slice(0, 10)}`;
    const changed: string[] = [];
    const apply = async (key: string, val: any, label: string) => {
      const n = Number(val);
      if (!isFinite(n) || n <= 0) return;                 // skip unverified / zero
      if (before[key] == null || Math.abs(before[key] - n) > 1e-9) changed.push(`${label}: ${before[key] ?? "—"} → ${n}`);
      await put(key, n, label, yr, src);
    };
    if (p.ca_hst && typeof p.ca_hst === "object") {
      for (const prov of PROVINCES) await apply(`ca.hst.${prov}`, p.ca_hst[prov], `${prov} GST/HST`);
    }
    await apply("ca.cpp.rate", p.ca_cpp_rate, "CPP rate");
    await apply("ca.cpp.ympe", p.ca_cpp_ympe, "CPP YMPE");
    await apply("ca.cpp.exemption", p.ca_cpp_exemption, "CPP exemption");
    await apply("ca.cpp.max", p.ca_cpp_max, "CPP max");
    await apply("ca.cpp2.rate", p.ca_cpp2_rate, "CPP2 rate");
    await apply("ca.cpp2.yampe", p.ca_cpp2_yampe, "CPP2 YAMPE");
    await apply("ca.cpp2.max", p.ca_cpp2_max, "CPP2 max");
    await apply("ca.ei.rate", p.ca_ei_rate, "EI rate");
    await apply("ca.ei.mie", p.ca_ei_mie, "EI MIE");
    await apply("ca.ei.max", p.ca_ei_max, "EI max");
    await apply("us.ss.wageBase", p.us_ss_wage_base, "US Social Security wage base");

    // Notify in Triage (only when something changed).
    if (changed.length) {
      try {
        const db = getDb();
        const rowId = `taxrates-${yr}-${new Date().toISOString().slice(0, 10)}`;
        const dup = await db.select().from(triageFindings).where(eq(triageFindings.sourceData, rowId)).limit(1);
        if (!dup[0]) {
          await db.insert(triageFindings).values({
            agentName: "Figs", findingType: "review", severity: "info",
            title: `Tax rates auto-updated for ${yr} (${changed.length} change${changed.length > 1 ? "s" : ""})`,
            description: `Auto-fetched current rates and applied them to the calculators:\n` + changed.join("\n") +
              `\n\nSource: ${src}. Glance to confirm; edit /calculators or the tax_rates table if any look wrong.`,
            suggestedAction: "Review the updated tax rates", sourceData: rowId, status: "new",
          });
        }
      } catch (e) { console.error("[tax-fetch] triage note failed:", e instanceof Error ? e.message : e); }
    }
    return { ok: true, changed, year: yr };
  } catch (e) {
    console.error("[tax-fetch] fetch failed:", e instanceof Error ? e.message : e);
    return { ok: false, changed: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Should we refresh now? In a refresh window (Jun / Dec) or if the table is empty
 *  / older than ~150 days. Keeps it to ~twice a year without external scheduling. */
export async function maybeRefreshTaxRates(): Promise<void> {
  if (process.env.FIGGY_TAXRATE_FETCH === "off") return;
  try {
    await ensureTaxRatesTable();
    const db = getDb();
    const rows = await db.select().from(taxRates);
    const month = new Date().getMonth(); // 0-based: 5=Jun, 11=Dec
    const inWindow = month === 5 || month === 11;
    let stale = rows.length === 0;
    if (!stale) {
      const newest = Math.max(...rows.map((r: any) => +new Date(r.updatedAt || 0)));
      stale = (Date.now() - newest) > 150 * 24 * 60 * 60 * 1000;
    }
    // Only fetch when it's worth it: empty/stale, or in a refresh window not yet done this month.
    if (!stale && !inWindow) return;
    if (inWindow && !stale) {
      // already refreshed within ~150d and we're in-window → skip (avoid daily refetch)
      const newest = Math.max(...rows.map((r: any) => +new Date(r.updatedAt || 0)));
      if ((Date.now() - newest) < 25 * 24 * 60 * 60 * 1000) return;
    }
    const r = await fetchAndApplyTaxRates();
    if (r.ok) console.log(`[tax-fetch] applied ${r.changed.length} rate change(s) for ${r.year}`);
  } catch (e) { console.error("[tax-fetch] maybeRefresh failed:", e instanceof Error ? e.message : e); }
}
