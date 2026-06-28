/**
 * CRYPTO BOOKKEEPING CORE — pure ACB + realized gain/loss engine (CRA method).
 * =============================================================================
 * Canadian tax treats cryptocurrency as a COMMODITY. Each disposition (sell, or
 * spending/sending crypto, or trading one coin for another) is a taxable event
 * valued at fair-market-value in CAD on the transaction date. Cost is tracked by
 * the ADJUSTED COST BASE (ACB) method — a moving average per asset.
 *
 * This file is PURE: it takes transactions already valued in CAD (the router
 * fetches historical CAD prices from CoinGecko) and computes the ACB pool,
 * per-disposal gain/loss, and the remaining holdings. No I/O, fully testable.
 *
 * Model: each row is ONE asset + ONE direction. A crypto-to-crypto trade is two
 * rows (dispose A at FMV, acquire B at FMV). A receipt of crypto as payment is an
 * `acquire` at FMV; spending crypto is a `dispose` at FMV.
 *
 * Inputs:  CryptoTxn[] (date, asset, direction, qty, cadValue, feeCad?).
 * Outputs: { disposals, holdings, totals } — realized gain/loss + ACB ledger.
 * Errors:  pure — never throws; a disposal with no holdings is flagged, not crashed.
 * Limitations (flagged, not silently handled): the CRA SUPERFICIAL-LOSS rule
 *   (re-acquire within 30 days) is NOT auto-applied — disposals are marked so a
 *   human can review. Capital-vs-business income is a downstream label (a toggle
 *   in the UI), not decided here.
 * =============================================================================
 */

export type CryptoDirection = "acquire" | "dispose";

export interface CryptoTxn {
  date: string;            // ISO yyyy-mm-dd (used only for ordering + display)
  asset: string;           // ticker, e.g. "BTC"
  direction: CryptoDirection;
  qty: number;             // positive magnitude of the asset moved
  cadValue: number;        // FMV of the qty in CAD at the transaction date
  feeCad?: number;         // CAD fee (added to cost on acquire; reduces proceeds on dispose)
}

export interface Disposal {
  date: string;
  asset: string;
  qty: number;
  proceeds: number;        // CAD received, net of selling fee
  costBasis: number;       // ACB of the units disposed
  gainLoss: number;        // proceeds − costBasis (negative = capital loss)
  oversold: boolean;       // true if disposed more than held (data gap → review)
}

export interface Holding {
  asset: string;
  qty: number;
  acb: number;             // total adjusted cost base of the remaining qty (CAD)
  avgCost: number;         // acb / qty (CAD per unit)
}

export interface CryptoResult {
  disposals: Disposal[];
  holdings: Holding[];
  totals: { proceeds: number; costBasis: number; gainLoss: number };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Run the full ACB ledger over a set of transactions (any order — sorted by date). */
export function computeAcb(txns: CryptoTxn[]): CryptoResult {
  const pool = new Map<string, { qty: number; acb: number }>();
  const disposals: Disposal[] = [];

  const ordered = [...txns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const t of ordered) {
    const fee = t.feeCad || 0;
    const p = pool.get(t.asset) || { qty: 0, acb: 0 };

    if (t.direction === "acquire") {
      p.qty += t.qty;
      p.acb += t.cadValue + fee;           // fees on a buy are added to cost base
      pool.set(t.asset, p);
      continue;
    }

    // dispose
    const oversold = t.qty > p.qty + 1e-9;
    const qtySold = oversold ? p.qty : t.qty;            // can't dispose more than held
    const costBasis = p.qty > 0 ? p.acb * (qtySold / p.qty) : 0;
    const proceeds = t.cadValue - fee;                   // selling fees reduce proceeds
    disposals.push({
      date: t.date, asset: t.asset, qty: t.qty,
      proceeds: round2(proceeds), costBasis: round2(costBasis),
      gainLoss: round2(proceeds - costBasis), oversold,
    });
    p.qty = Math.max(0, p.qty - qtySold);
    p.acb = Math.max(0, p.acb - costBasis);
    pool.set(t.asset, p);
  }

  const holdings: Holding[] = [];
  for (const [asset, p] of pool) {
    if (p.qty <= 1e-9 && p.acb <= 0.005) continue;       // fully disposed
    holdings.push({ asset, qty: round2(p.qty), acb: round2(p.acb), avgCost: p.qty > 0 ? round2(p.acb / p.qty) : 0 });
  }
  holdings.sort((a, b) => b.acb - a.acb);

  const totals = disposals.reduce(
    (s, d) => ({ proceeds: s.proceeds + d.proceeds, costBasis: s.costBasis + d.costBasis, gainLoss: s.gainLoss + d.gainLoss }),
    { proceeds: 0, costBasis: 0, gainLoss: 0 },
  );
  return { disposals, holdings, totals: { proceeds: round2(totals.proceeds), costBasis: round2(totals.costBasis), gainLoss: round2(totals.gainLoss) } };
}

/** Rows still missing a CAD value (the router couldn't price them) — surfaced for review. */
export function unvaluedRows(txns: CryptoTxn[]): number {
  return txns.filter((t) => !(t.cadValue > 0)).length;
}

/** Mark-to-market the current holdings at period-end CAD prices (for the balance sheet). */
export function valueHoldings(holdings: Holding[], priceCad: Record<string, number>): Array<Holding & { marketValue: number; unrealized: number }> {
  return holdings.map((h) => {
    const px = priceCad[h.asset];
    const marketValue = px ? round2(h.qty * px) : 0;
    return { ...h, marketValue, unrealized: px ? round2(marketValue - h.acb) : 0 };
  });
}
