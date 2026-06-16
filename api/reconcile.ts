/**
 * FIGGY JR — MONTHLY STATEMENT RECONCILIATION: LIVE I/O + tRPC
 * =============================================================================
 * Wraps the pure core (reconcile-core.ts) with live QBO reads and a GATED
 * write, mirroring the vendor brain's core/IO split.
 *
 * What runs here:
 *  - fetchRegisterLines(): read ONE account's QBO register for a statement
 *    period via the General Ledger report (transport-aware qboRequest, so it
 *    works over the Make bridge), normalized to the owed-cents convention.
 *  - reconcileMonthForClient(): parse the statement CSV(s) + register, run the
 *    core, return the result plus a human-readable packet. READ-ONLY.
 *  - prepareMissingChargeWrites(): build the QBO CreditCardCharge payloads for
 *    statement charges missing from QBO — DRY-RUN by default. Posting requires
 *    an explicit confirm AND stays behind Markie's review (golden rule: nothing
 *    posts unreviewed; the QBO Finish/lock is UI-only and not done here).
 *
 * Per-client isolation: the QBO connection is resolved through the SAME single
 * boundary as the brain (getConnectionForClient) — a West York call can only
 * ever hit West York's realm.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { qboConnections } from "../db/schema";
import {
  parseBmoCsv,
  reconcileMonth,
  parseGeneralLedger,
  generalLedgerPath,
  formatPacket,
  centsToStr,
  type RegisterLine,
  type StatementLine,
  type MonthReconcileResult,
} from "./reconcile-core";

type Conn = typeof qboConnections.$inferSelect;

/** Read ONE account's register for [startISO, endISO] from QBO and normalize to
 *  the owed-cents convention (transport-aware, so it works over the Make bridge). */
export async function fetchRegisterLines(
  conn: Conn,
  accountId: string,
  startISO: string,
  endISO: string,
): Promise<RegisterLine[]> {
  const rep = await qboRequest(conn, generalLedgerPath(accountId, startISO, endISO));
  return parseGeneralLedger(rep);
}

export type ReconcileMonthInput = {
  clientId: number;
  accountId: string;            // QBO account id (BMO = 137 for West York)
  periodStart: string;          // ISO
  periodEnd: string;            // ISO statement closing date
  openingBalance: number;       // dollars owed at period start
  statementEndingBalance: number; // dollars owed at period close
  statementCsvs: { text: string; card?: string }[]; // one per card on the account
  dateWindowDays?: number;
};

export type ReconcileMonthOutput =
  | { ok: false; error: string }
  | { ok: true; result: MonthReconcileResult; packet: string;
      summary: { matched: number; missingInQbo: number; extraInQbo: number; differenceStr: string; ties: boolean } };

/** Read-only: parse statement(s) + pull the QBO register + run the core. */
export async function reconcileMonthForClient(input: ReconcileMonthInput): Promise<ReconcileMonthOutput> {
  const connResult = await getConnectionForClient(input.clientId);
  if ("error" in connResult) return { ok: false, error: connResult.error };
  const conn = connResult.conn;

  const statementLines: StatementLine[] = input.statementCsvs.flatMap((c) => parseBmoCsv(c.text, c.card));
  if (statementLines.length === 0) return { ok: false, error: "no_statement_lines_parsed" };

  let registerLines: RegisterLine[];
  try {
    registerLines = await fetchRegisterLines(conn, input.accountId, input.periodStart, input.periodEnd);
  } catch (e) {
    return { ok: false, error: `qbo_register_read_failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  const result = reconcileMonth({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    openingBalanceCents: Math.round(input.openingBalance * 100),
    statementEndingBalanceCents: Math.round(input.statementEndingBalance * 100),
    statementLines,
    registerLines,
    dateWindowDays: input.dateWindowDays,
  });

  return {
    ok: true,
    result,
    packet: formatPacket(
      { accountId: input.accountId, periodStart: input.periodStart, periodEnd: input.periodEnd,
        openingBalanceCents: Math.round(input.openingBalance * 100),
        statementEndingBalanceCents: Math.round(input.statementEndingBalance * 100) },
      result,
    ),
    summary: {
      matched: result.matched.length,
      missingInQbo: result.missingInQbo.length,
      extraInQbo: result.extraInQbo.length,
      differenceStr: centsToStr(result.totals.differenceCents),
      ties: result.ties,
    },
  };
}

/**
 * Build the QBO CreditCardCharge (Purchase) payloads for statement charges that
 * aren't in QBO. DRY-RUN by default — returns the payloads it WOULD post. Only
 * posts when confirm===true, which the UI must gate behind Markie's review.
 * Payments/credits (negative owed) are never auto-created here.
 */
export async function prepareMissingChargeWrites(
  input: { clientId: number; accountId: string; missing: StatementLine[]; confirm?: boolean },
): Promise<{ ok: false; error: string } | { ok: true; posted: number; dryRun: boolean; payloads: any[] }> {
  const connResult = await getConnectionForClient(input.clientId);
  if ("error" in connResult) return { ok: false, error: connResult.error };
  const conn = connResult.conn;

  const charges = input.missing.filter((m) => m.chargeCents > 0); // only charges, never payments
  const payloads = charges.map((m) => ({
    AccountRef: { value: input.accountId },         // the credit-card account
    PaymentType: "CreditCard",
    TxnDate: m.date,
    PrivateNote: `Figgy: entered from BMO statement — ${m.description}`,
    Line: [{
      Amount: Math.abs(m.chargeCents) / 100,
      DetailType: "AccountBasedExpenseLineDetail",
      Description: m.description,
      // Account for the expense side is intentionally left for review — Figgy
      // does not guess the chart (golden rule). The reviewer sets it, or the
      // vendor brain suggests it, before this is posted.
      AccountBasedExpenseLineDetail: { AccountRef: { value: "" } },
    }],
  }));

  if (!input.confirm) return { ok: true, posted: 0, dryRun: true, payloads };

  let posted = 0;
  for (const body of payloads) {
    if (!body.Line[0].AccountBasedExpenseLineDetail.AccountRef.value) continue; // never post without an account
    await qboRequest(conn, `/purchase`, "POST", body);
    posted++;
  }
  return { ok: true, posted, dryRun: false, payloads };
}

const csvInput = z.object({ text: z.string().min(1), card: z.string().optional() });

export const reconcileRouter = createRouter({
  /** Read-only month reconciliation. Posts nothing. */
  runMonth: staffQuery
    .input(z.object({
      clientId: z.number(),
      accountId: z.string().min(1),
      periodStart: z.string(),
      periodEnd: z.string(),
      openingBalance: z.number(),
      statementEndingBalance: z.number(),
      statementCsvs: z.array(csvInput).min(1),
      dateWindowDays: z.number().min(0).max(31).optional(),
    }))
    .mutation(async ({ input }) => reconcileMonthForClient(input)),

  /** Gated entry of missing charges. Dry-run unless confirm===true. */
  enterMissing: staffQuery
    .input(z.object({
      clientId: z.number(),
      accountId: z.string().min(1),
      missing: z.array(z.object({ date: z.string(), description: z.string(), chargeCents: z.number(), card: z.string().optional() })),
      confirm: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => prepareMissingChargeWrites(input)),
});
