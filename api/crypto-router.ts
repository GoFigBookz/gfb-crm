/**
 * CRYPTO ROUTER — parse a client's crypto report, value it in CAD, run the ACB
 * engine, and return a gains + holdings report. For crypto-company clients
 * (Adbank, Motion Invest). Read-only; computes, never posts.
 * =============================================================================
 * Pricing: CoinGecko free API fills the CAD value for any row the report didn't
 * already price (most exchange reports DO include a CAD/fiat value — we prefer
 * that and only call out for the gaps). Defensive: a pricing miss leaves the row
 * unvalued + flagged, never crashes the report.
 * Inputs:  parse({ text }) → editable rows; analyze({ rows, client? }) → report.
 * Outputs: disposals, holdings (+ period-end CAD value), realized gain/loss,
 *          mining/income total, and any rows we couldn't value.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { parseCryptoCsv } from "./crypto-parse-core";
import { computeAcb, valueHoldings, type CryptoTxn } from "./crypto-core";

// Ticker → CoinGecko id for the common coins; unknown tickers skip pricing (flagged).
const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", USDT: "tether", USDC: "usd-coin", BNB: "binancecoin",
  XRP: "ripple", ADA: "cardano", SOL: "solana", DOGE: "dogecoin", DOT: "polkadot",
  LTC: "litecoin", BCH: "bitcoin-cash", TRX: "tron", MATIC: "matic-network", AVAX: "avalanche-2",
  LINK: "chainlink", XLM: "stellar", ATOM: "cosmos", XMR: "monero", ETC: "ethereum-classic",
  ALGO: "algorand", VET: "vechain", FIL: "filecoin", APE: "apecoin", SHIB: "shiba-inu",
  NEAR: "near", UNI: "uniswap", AAVE: "aave", SAND: "the-sandbox", MANA: "decentraland",
};

const priceCache = new Map<string, number>(); // `${id}@${ddmmyyyy}` → cad

async function historicalCad(asset: string, isoDate: string): Promise<number | null> {
  const id = COIN_IDS[asset];
  if (!id) return null;
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return null;
  const dmy = `${d}-${m}-${y}`;
  const key = `${id}@${dmy}`;
  if (priceCache.has(key)) return priceCache.get(key)!;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/history?date=${dmy}&localization=false`);
    if (!res.ok) return null;
    const j: any = await res.json();
    const cad = j?.market_data?.current_price?.cad;
    if (typeof cad === "number") { priceCache.set(key, cad); return cad; }
  } catch { /* defensive — pricing miss is non-fatal */ }
  return null;
}

async function currentCad(assets: string[]): Promise<Record<string, number>> {
  const ids = assets.map((a) => COIN_IDS[a]).filter(Boolean);
  if (!ids.length) return {};
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=cad`);
    if (!res.ok) return {};
    const j: any = await res.json();
    const out: Record<string, number> = {};
    for (const a of assets) { const id = COIN_IDS[a]; if (id && j?.[id]?.cad != null) out[a] = j[id].cad; }
    return out;
  } catch { return {}; }
}

const rowInput = z.object({
  date: z.string(),
  asset: z.string(),
  direction: z.enum(["acquire", "dispose"]),
  qty: z.number(),
  cadValue: z.number().default(0),
  feeCad: z.number().default(0),
  income: z.boolean().default(false),
});

export const cryptoRouter = createRouter({
  // Parse a pasted report into editable rows (pure; no network).
  parse: authedQuery
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const r = parseCryptoCsv(input.text);
      const knownAssets = r.rows.map((x) => x.asset);
      const unsupported = Array.from(new Set(knownAssets.filter((a) => !COIN_IDS[a])));
      return { ...r, unsupportedForPricing: unsupported };
    }),

  // Value (fill CAD gaps), run ACB, and report gains + holdings.
  analyze: authedQuery
    .input(z.object({ rows: z.array(rowInput).min(1).max(5000) }))
    .mutation(async ({ input }) => {
      const rows = input.rows.map((r) => ({ ...r }));
      const unpriced: Array<{ date: string; asset: string }> = [];

      // Fill CAD value only where the report didn't give one. Dedup lookups + cap
      // the number of external calls so a huge report can't hammer the free API.
      let lookups = 0;
      const LOOKUP_CAP = 80;
      for (const r of rows) {
        if (r.cadValue > 0) continue;
        if (lookups >= LOOKUP_CAP) { unpriced.push({ date: r.date, asset: r.asset }); continue; }
        lookups++;
        const px = await historicalCad(r.asset, r.date);
        if (px != null) r.cadValue = +(r.qty * px).toFixed(2);
        else unpriced.push({ date: r.date, asset: r.asset });
      }

      const txns: CryptoTxn[] = rows.map((r) => ({
        date: r.date, asset: r.asset, direction: r.direction, qty: r.qty, cadValue: r.cadValue, feeCad: r.feeCad,
      }));
      const result = computeAcb(txns);

      // Period-end (today) value of remaining holdings.
      const prices = await currentCad(result.holdings.map((h) => h.asset));
      const valuedHoldings = valueHoldings(result.holdings, prices);

      // Mining/staking/income total (FMV of income-flagged acquisitions).
      const incomeTotal = +rows.filter((r) => r.income && r.direction === "acquire")
        .reduce((s, r) => s + (r.cadValue || 0), 0).toFixed(2);

      return {
        result, valuedHoldings, incomeTotal,
        unpriced,
        cappedPricing: lookups >= LOOKUP_CAP,
        marketValueTotal: +valuedHoldings.reduce((s, h) => s + (h.marketValue || 0), 0).toFixed(2),
        unrealizedTotal: +valuedHoldings.reduce((s, h) => s + (h.unrealized || 0), 0).toFixed(2),
      };
    }),
});
