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
  type RegisterLine,
  type StatementLine,
  type MonthReconcileResult,
} from "./reconcile-core";

type Conn = typeof qboConnections.$inferSelect;

const centsToStr = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

/** Walk a (possibly nested) QBO report and collect every Data row's ColData. */
function collectDataRows(rows: any): any[] {
  const out: any[] = [];
  for (const row of rows?.Row ?? []) {
    if (row?.ColData) out.push(row.ColData);
    if (row?.Rows) out.push(...collectDataRows(row.Rows)); // nested account sections
  }
  return out;
}

/**
 * Read ONE account's register for [startISO, endISO] from QBO's General Ledger
 * report and normalize to the owed-cents convention (credit increases a credit-
 * card liability = a charge; debit decreases it = a payment).
 *
 * NOTE (learned from the brain): a report MUST send BOTH start_date AND end_date
 * or QBO keeps its "month-to-date" macro and returns nothing.
 */
export async function fetchRegisterLines(
  conn: Conn,
  accountId: string,
  startISO: string,
  endISO: string,
): Promise<RegisterLine[]> {
  const path =
    `/reports/GeneralLedger?start_date=${startISO}&end_date=${endISO}` +
    `&account=${encodeURIComponent(accountId)}` +
    `&columns=tx_date,txn_type,doc_num,name,memo,subt_nat_amount,debt_amt,credit_amt`;
  const rep = await qboRequest(conn, path);
  const cols: { ColType: string }[] = rep?.Columns?.Column ?? [];
  const idx = (t: string) => cols.findIndex((c) => c.ColType === t);
  const iDate = idx("tx_date"), iType = idx("txn_type"), iName = idx("name");
  const iMemo = idx("memo"), iDebit = idx("debt_amt"), iCredit = idx("credit_amt"), iAmt = idx("subt_nat_amount");

  const num = (v: any) => {
    const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const out: RegisterLine[] = [];
  for (const cd of collectDataRows(rep?.Rows)) {
    if (!Array.isArray(cd)) continue;
    const typeCell = iType >= 0 ? cd[iType] : undefined;
    const id = typeCell?.id != null ? String(typeCell.id) : "";
    if (!id) continue; // section/summary rows have no txn id
    // Prefer debit/credit columns; fall back to the signed net amount.
    let chargeCents: number;
    if (iDebit >= 0 || iCredit >= 0) {
      chargeCents = Math.round((num(cd[iCredit]?.value) - num(cd[iDebit]?.value)) * 100);
    } else {
      chargeCents = Math.round(num(cd[iAmt]?.value) * 100);
    }
    const desc = [iName >= 0 ? cd[iName]?.value : "", iMemo >= 0 ? cd[iMemo]?.value : ""]
      .filter(Boolean).join(" ").trim();
    out.push({
      id,
      date: iDate >= 0 ? String(cd[iDate]?.value ?? "") : "",
      description: desc || (typeCell?.value ?? ""),
      chargeCents,
      type: typeCell?.value ? String(typeCell.value) : undefined,
    });
  }
  return out;
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
    packet: formatPacket(input, result),
    summary: {
      matched: result.matched.length,
      missingInQbo: result.missingInQbo.length,
      extraInQbo: result.extraInQbo.length,
      differenceStr: centsToStr(result.totals.differenceCents),
      ties: result.ties,
    },
  };
}

/** Human-readable monthly reconciliation packet for review (Triage / report). */
export function formatPacket(input: ReconcileMonthInput, r: MonthReconcileResult): string {
  const L: string[] = [];
  L.push(`RECONCILIATION — account ${input.accountId} — ${input.periodStart} to ${input.periodEnd}`);
  L.push(`Opening ${centsToStr(Math.round(input.openingBalance * 100))} → statement ending ${centsToStr(Math.round(input.statementEndingBalance * 100))}`);
  L.push(`Matched ${r.matched.length} • missing-in-QBO ${r.missingInQbo.length} • extra-in-QBO ${r.extraInQbo.length}`);
  L.push(`QBO Reconcile difference (clear matched): ${centsToStr(r.totals.differenceCents)}  ${r.ties ? "✅ TIES" : "⚠️ does not tie yet"}`);
  if (r.totals.statementSelfCheckCents !== 0)
    L.push(`⚠️ Statement self-check off by ${centsToStr(r.totals.statementSelfCheckCents)} — verify the opening balance / completeness.`);
  if (r.missingInQbo.length) {
    L.push(`\nON STATEMENT, NOT IN QBO (enter these — gated):`);
    for (const s of r.missingInQbo) L.push(`  ${s.date}  ${centsToStr(s.chargeCents)}  ${s.description}${s.card ? `  ·${s.card}` : ""}`);
  }
  if (r.extraInQbo.length) {
    L.push(`\nIN QBO, NOT ON STATEMENT (review — wrong period / duplicate / error):`);
    for (const x of r.extraInQbo) L.push(`  ${x.date}  ${centsToStr(x.chargeCents)}  ${x.description}  (${x.type ?? "?"} ${x.id})`);
  }
  return L.join("\n");
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
