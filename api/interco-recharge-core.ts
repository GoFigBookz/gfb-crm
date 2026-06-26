/**
 * INTER-COMPANY RECHARGE — pure core (Markie 2026-06-26, first client: Alderson → Ovita Holdings).
 * =============================================================================
 * PURPOSE: One company (the PAYER, e.g. Alderson) pays costs that belong to a
 * related company (the COUNTERPARTY, e.g. Ovita Holdings) and recharges them via a
 * sales invoice + a mirror bill. This builds BOTH draft documents from a list of
 * the payer's net (pre-HST) expenses, so the books move the cost across cleanly and
 * the HST flows correctly.
 *
 * HST TREATMENT (Markie confirmed 2026-06-26): the recharge is a TAXABLE SERVICE
 * ("project management"), so the payer CHARGES HST (output tax) and the counterparty
 * CLAIMS the ITC. Base = sum of NET expense amounts (the payer already recovered the
 * input HST via ITC on the original purchases), HST = base × rate (ON = 13%). If a
 * Section 156 election were in place this would be nil — `chargeHst=false` covers it.
 *
 * INPUTS:  period label, payer/counterparty names, the revenue account (payer side)
 *          + expense account (counterparty side), HST rate %, chargeHst flag, and the
 *          expense line list ({description, net}).
 * OUTPUTS: { invoice, bill, validation } — the payer's Invoice (customer = counterparty,
 *          income = revenue account) and the counterparty's Bill (vendor = payer,
 *          expense = expense account), each with subtotal/hst/total, plus a tie-out.
 * ERRORS:  validation flags negative/empty lines and any invoice≠bill mismatch.
 * LIMITATIONS: DRAFT ONLY — nothing posts to QBO here (golden rule: review first).
 *          Accounts are passed in explicitly; never guessed (locked chart).
 * =============================================================================
 */

export type RechargeExpense = { description: string; net: number; sourceRef?: string };

export type RechargeInput = {
  periodLabel: string;
  payerName: string;          // who paid + invoices (Alderson)
  counterpartyName: string;   // who is billed (Ovita Holdings)
  revenueAccount: string;     // payer-side income account (Sales)
  expenseAccount: string;     // counterparty-side expense (Alderson Project Management Costs)
  hstRatePct: number;         // e.g. 13 for Ontario
  chargeHst: boolean;         // false only if a Section 156 election makes it nil
  expenses: RechargeExpense[];
};

export type RechargeLine = { description: string; account: string; amount: number; sourceRef?: string };
export type RechargeDoc = {
  type: "invoice" | "bill";
  party: string;              // customer (invoice) or vendor (bill)
  account: string;            // income (invoice) or expense (bill)
  lines: RechargeLine[];
  subtotal: number;
  hst: number;
  total: number;
};

export type RechargeResult = {
  periodLabel: string;
  hstRatePct: number;
  chargeHst: boolean;
  invoice: RechargeDoc;       // posts in the PAYER's books (Alderson)
  bill: RechargeDoc;          // posts in the COUNTERPARTY's books (Holdings)
  validation: { ok: boolean; errors: string[] };
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Build the draft recharge invoice (payer) + mirror bill (counterparty). Pure. */
export function buildRecharge(input: RechargeInput): RechargeResult {
  const rate = input.chargeHst ? (input.hstRatePct || 0) / 100 : 0;
  const lines: RechargeLine[] = (input.expenses || [])
    .filter((e) => e && Number.isFinite(e.net))
    .map((e) => ({
      description: e.description || "Recharged cost",
      account: input.revenueAccount,
      amount: round2(e.net),
      sourceRef: e.sourceRef,
    }));

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const hst = round2(subtotal * rate);
  const total = round2(subtotal + hst);

  const invoice: RechargeDoc = {
    type: "invoice",
    party: input.counterpartyName,    // billed customer
    account: input.revenueAccount,
    lines,
    subtotal, hst, total,
  };
  // Mirror bill: same money, expense side, vendor = payer.
  const bill: RechargeDoc = {
    type: "bill",
    party: input.payerName,           // vendor
    account: input.expenseAccount,
    lines: lines.map((l) => ({ ...l, account: input.expenseAccount })),
    subtotal, hst, total,
  };

  const errors: string[] = [];
  if (lines.length === 0) errors.push("No expense lines to recharge.");
  if (lines.some((l) => l.amount < 0)) errors.push("One or more expense lines are negative — review before recharging.");
  if (!input.revenueAccount) errors.push("Missing payer-side revenue account.");
  if (!input.expenseAccount) errors.push("Missing counterparty-side expense account.");
  if (round2(invoice.total) !== round2(bill.total)) errors.push("Invoice total does not equal mirror-bill total.");

  return {
    periodLabel: input.periodLabel,
    hstRatePct: input.hstRatePct,
    chargeHst: input.chargeHst,
    invoice,
    bill,
    validation: { ok: errors.length === 0, errors },
  };
}
