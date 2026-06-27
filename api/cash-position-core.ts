/**
 * CASH POSITION — pure decision core (no I/O).
 * =============================================================================
 * Purpose:  The "do they have enough money?" brain. Given a client's bank cash, what
 *           they owe on credit cards, the cash their next payroll needs, and a minimum
 *           buffer Markie wants kept in the account, decide: is there enough for
 *           payroll? is the balance heading below the buffer (→ transfer money IN)? is
 *           the credit card high vs cash? Plain-English flags for the cockpit.
 * Scope:    Balances only — pulled from the chart of accounts (Account.CurrentBalance),
 *           NOT every transaction. Markie's ask: a summary + a heads-up, per client.
 * Honest:   QBO's API does NOT expose the bank-feed "For Review" queue, so "what's left
 *           to post" can't be pulled here — surfaced as a known gap in the UI, not faked.
 * =============================================================================
 */

export interface CashInputs {
  cashTotal: number;            // sum of bank account balances (CAD-equiv)
  creditCardOwed: number;       // sum of credit-card balances owed (positive)
  payrollNeed: number | null;   // cash the next payroll run needs (null = no payroll)
  minBuffer: number;            // the floor Markie wants kept in the bank
}

export type CashStatus = "ok" | "watch" | "alert";

export interface CashPosition {
  cashTotal: number;
  creditCardOwed: number;
  payrollNeed: number | null;
  minBuffer: number;
  afterPayroll: number | null;  // cash left after the next payroll run
  headroom: number;             // cash − buffer
  enoughForPayroll: boolean | null;
  payrollShortfall: number;     // how much short of covering payroll (0 if fine)
  needsTransfer: boolean;       // balance is/▶ going below the buffer → move money IN
  suggestedTransfer: number;    // amount to bring post-payroll cash back to the buffer
  ccHigh: boolean;              // credit card owed ≥ cash on hand
  status: CashStatus;
  flags: string[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number) => `$${r2(Math.abs(n)).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function assessCashPosition(input: CashInputs): CashPosition {
  const cash = r2(input.cashTotal || 0);
  const cc = r2(Math.abs(input.creditCardOwed || 0));
  const need = input.payrollNeed != null ? r2(input.payrollNeed) : null;
  const buffer = r2(input.minBuffer || 0);

  const afterPayroll = need != null ? r2(cash - need) : null;
  const headroom = r2(cash - buffer);
  const enoughForPayroll = need == null ? null : cash >= need;
  const payrollShortfall = need != null && cash < need ? r2(need - cash) : 0;

  // "Going below" the buffer = the balance the client will be left with (after the
  // upcoming payroll, if any) is under the floor.
  const effectiveCash = afterPayroll != null ? afterPayroll : cash;
  const needsTransfer = effectiveCash < buffer;
  const suggestedTransfer = needsTransfer ? r2(buffer - effectiveCash) : 0;
  const ccHigh = cash > 0 ? cc >= cash : cc > 0;

  const flags: string[] = [];
  if (payrollShortfall > 0) flags.push(`Not enough to cover the next payroll — short ${money(payrollShortfall)}.`);
  else if (enoughForPayroll === true && need != null) flags.push(`Payroll covered — ${money(afterPayroll!)} left after the run.`);
  if (needsTransfer) flags.push(`Balance is heading below the ${money(buffer)} buffer — transfer in about ${money(suggestedTransfer)}.`);
  if (cash < 0) flags.push(`Bank balance is negative (${money(cash)}).`);
  if (ccHigh && cc > 0) flags.push(`Credit card owing (${money(cc)}) is high vs cash on hand (${money(cash)}).`);
  if (!flags.length) flags.push("Healthy — cash covers the buffer and upcoming payroll.");

  let status: CashStatus = "ok";
  if (payrollShortfall > 0 || cash < 0 || (afterPayroll != null && afterPayroll < 0)) status = "alert";
  else if (needsTransfer || ccHigh) status = "watch";

  return {
    cashTotal: cash, creditCardOwed: cc, payrollNeed: need, minBuffer: buffer,
    afterPayroll, headroom, enoughForPayroll, payrollShortfall, needsTransfer,
    suggestedTransfer, ccHigh, status, flags,
  };
}
