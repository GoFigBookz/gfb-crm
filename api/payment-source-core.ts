/**
 * PAYMENT-SOURCE / DOUBLE-POST FINDER — pure core (Markie 2026-06-26).
 * =============================================================================
 * PURPOSE: Catch the classic mess — an expense recorded against the BANK account
 * when it was actually paid on a CREDIT CARD (or paid by another entity), so the
 * bank line never clears and/or the cost is double-counted. Given a flat list of
 * payments (each with the source account it was booked against), it finds the same
 * vendor+amount appearing under TWO different source accounts → a likely double-post
 * / wrong-source posting to investigate.
 * INPUTS:  payments [{ vendor, amount, date, account, paymentType?, ref? }].
 * OUTPUTS: { duplicates: [...groups spanning ≥2 source accounts], byAccount: totals,
 *           summary }. Pure + deterministic; nothing is changed.
 * NOTE: a "duplicate" here is a STRONG HINT, not proof — two real, separate payments
 *       to the same vendor for the same amount can exist. The human confirms.
 * =============================================================================
 */
export type Payment = {
  vendor: string;
  amount: number;
  date: string;        // yyyy-mm-dd
  account: string;     // the source account it was booked against (bank / credit card)
  entity?: string;     // the company/entity it was booked in (for cross-entity scans)
  paymentType?: string;
  ref?: string;
};

export type DupGroup = {
  vendor: string;
  amount: number;
  accounts: string[];          // the distinct source accounts it appears under
  entities: string[];          // the distinct entities it appears in ("who has it")
  items: Payment[];
};

export type PaymentSourceResult = {
  duplicates: DupGroup[];
  byAccount: { account: string; count: number; total: number }[];
  summary: { payments: number; flaggedGroups: number; flaggedAmount: number };
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
const normVendor = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const key = (p: Payment) => `${normVendor(p.vendor)}|${round2(Math.abs(p.amount))}`;

export function findCrossAccountDuplicates(payments: Payment[]): PaymentSourceResult {
  const groups = new Map<string, Payment[]>();
  for (const p of payments) {
    if (!p || !Number.isFinite(p.amount) || round2(Math.abs(p.amount)) === 0) continue;
    const k = key(p);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }

  const duplicates: DupGroup[] = [];
  for (const items of groups.values()) {
    const accounts = Array.from(new Set(items.map((i) => i.account).filter(Boolean)));
    const entities = Array.from(new Set(items.map((i) => i.entity).filter(Boolean))) as string[];
    // Flag when the same vendor+amount shows up under ≥2 source accounts OR in ≥2
    // entities — i.e. it was likely paid from a different account/company than where
    // the unreconciled expense sits. That's "who actually paid it".
    if (accounts.length >= 2 || entities.length >= 2) {
      duplicates.push({
        vendor: items[0].vendor,
        amount: round2(Math.abs(items[0].amount)),
        accounts,
        entities,
        items: items.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")),
      });
    }
  }
  duplicates.sort((a, b) => b.amount - a.amount);

  const byAcc = new Map<string, { count: number; total: number }>();
  for (const p of payments) {
    const a = p.account || "(none)";
    const e = byAcc.get(a) ?? { count: 0, total: 0 };
    e.count++; e.total = round2(e.total + Math.abs(p.amount || 0));
    byAcc.set(a, e);
  }
  const byAccount = Array.from(byAcc.entries()).map(([account, v]) => ({ account, ...v }))
    .sort((a, b) => b.total - a.total);

  const flaggedAmount = round2(duplicates.reduce((s, d) => s + d.amount, 0));
  return {
    duplicates,
    byAccount,
    summary: { payments: payments.length, flaggedGroups: duplicates.length, flaggedAmount },
  };
}
