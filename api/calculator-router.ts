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

/** Bank of Canada quotes each pair as FX<CUR>CAD = CAD per 1 unit of <CUR>. */
async function fetchBocFxRates(): Promise<FxPayload | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=1", {
      signal: ctrl.signal, headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const obs = json?.observations?.[0];
    if (!obs) return null;
    const date = String(obs.d ?? "");
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

export const calculatorRouter = createRouter({
  // Live FX rates (CAD per 1 unit of each currency) from the Bank of Canada.
  fxRates: authedQuery.query(async () => {
    if (fxCache && Date.now() - fxCache.at < FX_TTL_MS) return fxCache.data;
    const data = await fetchBocFxRates();
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
