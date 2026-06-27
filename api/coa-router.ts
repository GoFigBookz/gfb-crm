/**
 * CHART OF ACCOUNTS (COA) ROUTER — Markie's cleanup tool.
 * =============================================================================
 * Read-only QBO + pure-core toolkit for chart-of-accounts review and cleanup:
 *   • exportChart(clientId)         → pull the full Account list → rows + downloadable CSV
 *   • compareCharts(a, b)           → diff two clients (marry Clark OS ↔ CW: same numbers)
 *   • compareToTemplate(clientId)   → gap vs a standard chart for the business TYPE
 *   • reconcileTb(clientId, tbText) → tie QBO balances to the accountant's trial balance
 *
 * The chart of accounts is LOCKED — this tool EXPORTS + COMPARES + CHECKS only. It never
 * edits QBO accounts. "Push the cleaned chart back" is intentionally NOT here: QBO has no
 * safe bulk-rewrite, so the workflow is export → clean externally (Sheets/Excel + AI) →
 * the human applies the few real changes by hand, tied to the trial balance first.
 *
 * Inputs: clientId(s) + optional pasted trial-balance text.
 * Outputs: account rows, CSV, diff entries, reconcile entries — all read-only.
 * Errors: not-connected / ambiguous / bridge → a clear status object, never a crash.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { qboRequest } from "./qbo-router";
import { getConnectionForClient } from "./qbo-vendor-brain";
import { buildCoaCsv, diffCharts, diffToTemplate, parseTrialBalance, reconcileToTrialBalance, reviewChartForCleanup, COA_TEMPLATES, type AcctRow } from "./coa-core";

const arr = (data: any, entity: string): any[] => (data?.QueryResponse?.[entity] ?? []) as any[];
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Pull a client's full chart of accounts from QBO (read-only). Returns rows or a reason. */
async function pullChart(clientId: number): Promise<{ rows: AcctRow[] } | { error: string }> {
  const connResult = await getConnectionForClient(clientId);
  if ("error" in connResult) return { error: connResult.error };
  try {
    const data = await qboRequest(connResult.conn, `/query?query=${encodeURIComponent("SELECT * FROM Account MAXRESULTS 1000")}`);
    const rows: AcctRow[] = arr(data, "Account").map((a) => ({
      num: String(a.AcctNum ?? "").trim(),
      name: a.Name ?? "",
      type: a.AccountType ?? "",
      subType: a.AccountSubType ?? undefined,
      balance: num(a.CurrentBalance),
      active: a.Active !== false,
    }));
    return { rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: /async ack|non-JSON|bridge/i.test(msg) ? "bridge_not_returning_data" : msg };
  }
}

async function clientName(clientId: number): Promise<string> {
  const r = ((await getDb().all(sql`SELECT name FROM clients WHERE id=${clientId} LIMIT 1`)) as any[])[0];
  return r?.name ?? `Client ${clientId}`;
}

export const coaRouter = createRouter({
  /** Export one client's chart of accounts → rows + CSV (the file they clean up externally). */
  exportChart: staffQuery.input(z.object({ clientId: z.number() })).mutation(async ({ input }) => {
    const res = await pullChart(input.clientId);
    if ("error" in res) return { ok: false as const, error: res.error };
    const name = await clientName(input.clientId);
    const rows = res.rows.sort((a, b) => (a.num || "").localeCompare(b.num || "") || a.name.localeCompare(b.name));
    return { ok: true as const, clientName: name, count: rows.length, rows, csv: buildCoaCsv(rows) };
  }),

  /** Review ONE chart for a standalone cleanup (no marrying) — review-gated suggestions. */
  reviewChart: staffQuery.input(z.object({ clientId: z.number() })).mutation(async ({ input }) => {
    const res = await pullChart(input.clientId);
    if ("error" in res) return { ok: false as const, error: res.error };
    const name = await clientName(input.clientId);
    const { findings, summary } = reviewChartForCleanup(res.rows);
    return { ok: true as const, clientName: name, count: res.rows.length, findings, summary };
  }),

  /** Diff two clients' charts so they can be married (e.g. Clark OS ↔ Clark CW). */
  compareCharts: staffQuery.input(z.object({ clientIdA: z.number(), clientIdB: z.number() })).mutation(async ({ input }) => {
    const [ra, rb] = await Promise.all([pullChart(input.clientIdA), pullChart(input.clientIdB)]);
    if ("error" in ra) return { ok: false as const, error: `Chart A: ${ra.error}` };
    if ("error" in rb) return { ok: false as const, error: `Chart B: ${rb.error}` };
    const [nameA, nameB] = await Promise.all([clientName(input.clientIdA), clientName(input.clientIdB)]);
    const { entries, summary } = diffCharts(ra.rows, rb.rows);
    return { ok: true as const, nameA, nameB, entries, summary };
  }),

  /** Gap between a client's chart and a standard template for their business type. */
  compareToTemplate: staffQuery.input(z.object({ clientId: z.number(), templateKey: z.string() })).mutation(async ({ input }) => {
    const res = await pullChart(input.clientId);
    if ("error" in res) return { ok: false as const, error: res.error };
    const diff = diffToTemplate(res.rows, input.templateKey);
    if (!diff) return { ok: false as const, error: "unknown_template" };
    const name = await clientName(input.clientId);
    return { ok: true as const, clientName: name, ...diff };
  }),

  /** Available standard templates (for the picker). */
  templates: staffQuery.query(async () => Object.entries(COA_TEMPLATES).map(([key, t]) => ({ key, label: t.label, count: t.accounts.length }))),

  /** The tie-out gate: reconcile QBO chart balances to the accountant's pasted trial balance. */
  reconcileTb: staffQuery.input(z.object({ clientId: z.number(), trialBalance: z.string() })).mutation(async ({ input }) => {
    const res = await pullChart(input.clientId);
    if ("error" in res) return { ok: false as const, error: res.error };
    const tb = parseTrialBalance(input.trialBalance);
    if (!tb.length) return { ok: false as const, error: "no_tb_lines_parsed" };
    const name = await clientName(input.clientId);
    const r = reconcileToTrialBalance(res.rows, tb);
    return { ok: true as const, clientName: name, parsedLines: tb.length, ...r };
  }),
});
