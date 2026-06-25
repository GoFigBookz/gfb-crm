/**
 * INTERCO SETTLEMENT — minimal transfer suggestions.
 *
 * Given each entity's NET interco position within a group (+ = the group owes this
 * entity, i.e. it's a creditor; − = this entity owes the group, a debtor), compute
 * the fewest payments that clear everyone — biggest debtor pays biggest creditor,
 * repeat. Optionally cap each debtor's outgoing by the cash it can actually spare
 * ("sized to cash flow"); whatever can't be covered now is flagged as a shortfall.
 *
 * Pure + side-effect free. Suggestions only — nothing posts.
 */
export type NetEntity = { id: number; name: string; net: number; cashAvailable?: number | null };
export type Transfer = { fromId: number; from: string; toId: number; to: string; amount: number; capped?: boolean };
export type SettlementResult = { transfers: Transfer[]; residual: { id: number; name: string; net: number }[]; balanced: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

export function suggestSettlements(entities: NetEntity[]): SettlementResult {
  const creditors = entities.filter((e) => e.net > EPS).map((e) => ({ ...e, rem: r2(e.net) })).sort((a, b) => b.rem - a.rem);
  const debtors = entities
    .filter((e) => e.net < -EPS)
    .map((e) => ({ ...e, rem: r2(-e.net), cap: e.cashAvailable == null ? Infinity : Math.max(0, e.cashAvailable) }))
    .sort((a, b) => b.rem - a.rem);

  const transfers: Transfer[] = [];
  let ci = 0;
  for (const d of debtors) {
    while (d.rem > EPS && ci < creditors.length) {
      const c = creditors[ci];
      if (c.rem <= EPS) { ci++; continue; }
      const want = Math.min(d.rem, c.rem);
      const pay = Math.min(want, d.cap);
      if (pay > EPS) {
        transfers.push({ fromId: d.id, from: d.name, toId: c.id, to: c.name, amount: r2(pay), capped: pay < want - EPS });
        c.rem = r2(c.rem - pay);
        d.rem = r2(d.rem - pay);
        d.cap = d.cap === Infinity ? Infinity : r2(d.cap - pay);
      }
      // Cash exhausted for this debtor → stop trying to pay more.
      if (d.cap !== Infinity && d.cap <= EPS) break;
      if (want - pay > EPS) break; // couldn't fully fund this creditor; remaining is a shortfall
    }
  }

  // Anything still owed/owing after settlement (e.g. cash-capped) is residual.
  const residual = [
    ...creditors.filter((c) => c.rem > EPS).map((c) => ({ id: c.id, name: c.name, net: r2(c.rem) })),
    ...debtors.filter((d) => d.rem > EPS).map((d) => ({ id: d.id, name: d.name, net: r2(-d.rem) })),
  ];
  const groupNet = r2(entities.reduce((s, e) => s + e.net, 0));
  return { transfers, residual, balanced: Math.abs(groupNet) < 0.01 };
}
