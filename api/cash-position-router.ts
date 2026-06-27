/**
 * CASH POSITION ROUTER — "do they have enough money?" per client.
 * =============================================================================
 * Pulls ONLY account BALANCES from the chart of accounts (Account.CurrentBalance) —
 * NOT transactions — for a client's QBO connection, then runs the cash-position core:
 * cash on hand, credit-card owing, enough for the next payroll?, is the balance heading
 * below Markie's buffer (→ transfer money IN)? On-demand (not every page load) to respect
 * the Make ops cap. Defensive: not connected / pull fails → a clear status, never a crash.
 *
 * HONEST GAP: QBO's API does NOT expose the bank-feed "For Review" queue, so "what's
 * left to post" can't be pulled here — the UI says so rather than faking a number.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { bankBreakdownFromAccounts, staleFeedFromTransactionList } from "./qbo-cashflow";
import { assessCashPosition, type StaleAccount } from "./cash-position-core";

const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Near-term payroll cash need, estimated from the client's most recent real pay run
 *  (gross + ~6% employer burden). null = no payroll history. A planning estimate. */
async function payrollNeedFor(clientId: number): Promise<number | null> {
  const r = ((await getDb().all(sql`SELECT totalGross, totalNet FROM pay_runs WHERE clientId=${clientId} ORDER BY id DESC LIMIT 1`)) as any[])[0];
  if (!r) return null;
  const gross = num(r.totalGross), net = num(r.totalNet);
  if (gross <= 0 && net <= 0) return null;
  return Math.round((gross > 0 ? gross * 1.06 : net) * 100) / 100;
}

async function bufferFor(clientId: number): Promise<number> {
  const r = ((await getDb().all(sql`SELECT minCashBuffer FROM clients WHERE id=${clientId} LIMIT 1`)) as any[])[0];
  return num(r?.minCashBuffer);
}

export const cashPositionRouter = createRouter({
  /** Saved buffer (the cash floor) for a client. */
  buffer: staffQuery.input(z.object({ clientId: z.number() })).query(async ({ input }) => ({ minCashBuffer: await bufferFor(input.clientId) })),

  setBuffer: staffQuery.input(z.object({ clientId: z.number(), minCashBuffer: z.number().min(0) })).mutation(async ({ input }) => {
    await getDb().run(sql`UPDATE clients SET minCashBuffer=${input.minCashBuffer} WHERE id=${input.clientId}`);
    return { ok: true as const };
  }),

  /** Live cash position for one client (on-demand pull of account balances). */
  forClient: staffQuery.input(z.object({ clientId: z.number() })).mutation(async ({ input }) => {
    const connResult = await getConnectionForClient(input.clientId);
    if ("error" in connResult) {
      return { connected: false as const, reason: connResult.error };
    }
    const conn = connResult.conn;
    try {
      // Balances only — the chart of accounts carries CurrentBalance per account.
      const data = await qboRequest(conn, `/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType IN ('Bank','Credit Card') MAXRESULTS 200")}`);
      const accounts = arr(data, "Account").map((a) => ({
        name: a.Name, accountType: a.AccountType,
        currentBalance: num(a.CurrentBalance), currencyRef: a.CurrencyRef?.value, active: a.Active,
      }));
      const bb = bankBreakdownFromAccounts(accounts);
      const payrollNeed = await payrollNeedFor(input.clientId);
      const minBuffer = await bufferFor(input.clientId);

      // "Is each account up to date?" — last posting date per account from a recent
      // TransactionList (best-effort; one report). Markie: flag if older than ~5 days.
      let staleAccounts: StaleAccount[] = [];
      try {
        const now = new Date();
        const end = now.toISOString().slice(0, 10);
        const start = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
        const report = await qboRequest(conn, `/reports/TransactionList?start_date=${start}&end_date=${end}&columns=tx_date,account_name,subt_nat_amount`);
        const stale = staleFeedFromTransactionList(report, now, 5);
        const bankNames = new Set(bb.bankAccounts.map((a) => a.name));
        staleAccounts = Object.entries(stale.perAccount)
          .filter(([name]) => bankNames.has(name))   // only the bank/credit-card accounts
          .map(([name, days]) => ({ name, days }));
      } catch (e) { console.error(`[cash-position] stale-feed (client ${input.clientId}):`, e instanceof Error ? e.message : e); }

      const position = assessCashPosition({ cashTotal: bb.cashTotal, creditCardOwed: bb.creditCardOwed, payrollNeed, minBuffer, staleAccounts, staleThresholdDays: 5 });
      return {
        connected: true as const,
        asOf: new Date().toISOString(),
        position,
        bankAccounts: bb.bankAccounts,
        cashCad: bb.cashCad, cashUsd: bb.cashUsd,
        // Honest: QBO's API can't expose the bank-feed "For Review" queue.
        bankFeedToPost: null as null,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { connected: true as const, error: /async ack|non-JSON|bridge/i.test(msg) ? "bridge_not_returning_data" : msg };
    }
  }),
});
