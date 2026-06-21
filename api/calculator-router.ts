import { createRouter, authedQuery } from "./middleware";

/**
 * Calculator data sources. Currently: live FX rates from the Bank of Canada
 * Valet API (the official daily noon/indicative rates) so the currency
 * converter pulls real numbers, not hardcoded guesses. Cached in-process for a
 * few hours (rates publish once per business day). Degrades to null on failure
 * so the UI can fall back to its static rates.
 */

type FxPayload = { date: string; rates: Record<string, number>; source: string };
let fxCache: { at: number; data: FxPayload } | null = null;
const FX_TTL_MS = 6 * 60 * 60 * 1000; // 6h — BoC publishes once per business day

const STALE_MS = 21 * 24 * 60 * 60 * 1000; // ignore any feed older than ~3 weeks
const isFresh = (dateStr: string) => {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) && (Date.now() - t) < STALE_MS;
};

/** Bank of Canada — FX<CUR>CAD = CAD per 1 unit of <CUR>. NOTE: the legacy
 *  FX_RATES_DAILY group is frozen at 2019-12-31, so we use the current per-series
 *  observations endpoint and REJECT stale data. */
async function fetchBocFxRates(): Promise<FxPayload | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const series = ["FXUSDCAD", "FXEURCAD", "FXGBPCAD", "FXAUDCAD", "FXJPYCAD", "FXCNYCAD",
      "FXMXNCAD", "FXCHFCAD", "FXINRCAD", "FXBRLCAD", "FXNZDCAD", "FXSGDCAD", "FXHKDCAD",
      "FXSEKCAD", "FXNOKCAD", "FXKRWCAD", "FXRUBCAD", "FXIDRCAD", "FXMYRCAD", "FXPENCAD",
      "FXSARCAD", "FXTRYCAD", "FXTWDCAD", "FXTHBCAD", "FXVNDCAD", "FXZARCAD"].join(",");
    const res = await fetch(`https://www.bankofcanada.ca/valet/observations/${series}/json?recent=1`, {
      signal: ctrl.signal, headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const obs = json?.observations?.[0];
    if (!obs) return null;
    const date = String(obs.d ?? "");
    if (!isFresh(date)) return null;   // discontinued/stale → let the fallback take over
    const rates: Record<string, number> = { CAD: 1 };
    for (const [key, val] of Object.entries(obs)) {
      const m = /^FX([A-Z]{3})CAD$/.exec(key);
      const v = Number((val as any)?.v);
      if (m && Number.isFinite(v) && v > 0) rates[m[1]] = v;
    }
    if (Object.keys(rates).length < 2) return null;
    return { date, rates, source: "Bank of Canada" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reliable no-key fallback (open.er-api.com): rates are units-per-1-CAD; we invert
 *  to CAD-per-unit to match the BoC shape. Updated daily. */
async function fetchFallbackFxRates(): Promise<FxPayload | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/CAD", { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json?.result !== "success" || !json?.rates) return null;
    const date = String(json.time_last_update_utc ? new Date(json.time_last_update_utc).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    const rates: Record<string, number> = { CAD: 1 };
    for (const [cur, perCad] of Object.entries(json.rates)) {
      const v = Number(perCad);
      if (/^[A-Z]{3}$/.test(cur) && Number.isFinite(v) && v > 0) rates[cur] = 1 / v; // CAD per 1 unit
    }
    if (Object.keys(rates).length < 2) return null;
    return { date, rates, source: "exchangerate-api.com" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Live FX with fallback: try Bank of Canada (current + fresh), else the no-key feed. */
async function fetchLiveFx(): Promise<FxPayload | null> {
  return (await fetchBocFxRates()) ?? (await fetchFallbackFxRates());
}

export const calculatorRouter = createRouter({
  // Live FX rates (CAD per 1 unit of each currency) from the Bank of Canada.
  fxRates: authedQuery.query(async () => {
    if (fxCache && Date.now() - fxCache.at < FX_TTL_MS) return fxCache.data;
    const data = await fetchLiveFx();
    if (data) { fxCache = { at: Date.now(), data }; return data; }
    return fxCache?.data ?? null; // serve a stale cache if the fetch failed
  }),

  // Auto-fetched legislated tax rates (HST/GST per province, CPP/EI constants, US
  // SS wage base) → {key: value}. The calculators overlay these on baked-in defaults.
  taxRates: authedQuery.query(async () => {
    const { getTaxRateMap } = await import("./tax-rate-autofetch");
    return getTaxRateMap();
  }),
});
