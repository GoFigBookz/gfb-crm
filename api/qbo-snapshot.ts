/**
 * QBO → CRM SCHEDULED SYNC + FINANCIAL SNAPSHOT (Markie 2026-06-24)
 * =============================================================================
 * Answers "QuickBooks is connected — why isn't it syncing?": the old scheduler
 * only QUEUED (a no-op heartbeat). This pulls each connected client's books on a
 * schedule and caches a cheap per-client snapshot the dashboard/cockpit read —
 * so nothing fans out live QBO on every board load (Make ops cap).
 *
 * Per connection (isolated — one realm per connection, never cross-pollinated):
 *   1. doSync customers / invoices / payments / accounts  → qbo_* tables
 *   2. Balance Sheet from the synced Chart of Accounts (reliable: Account
 *      CurrentBalance by Classification) → assets / liabilities / equity
 *   3. P&L from the ProfitAndLoss report (defensive parse) → revenue / net
 *   4. upsert ONE clientDashboardSnapshots row per client per day (source=qbo)
 *
 * Cheap by design: one snapshot/day/client, derived from data already pulled.
 * Read-only — never writes to QBO. Disable with FIGGY_QBO_SYNC_DISABLE=on.
 */
import { getDb } from "./queries/connection";
import { qboConnections, qboAccounts, qboInvoices, clientDashboardSnapshots, clientCashSnapshots, qboSyncLogs, clients, employees } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { qboRequest, ensureValidToken, doSyncCustomers, doSyncInvoices, doSyncPayments, doSyncAccounts } from "./qbo-router";
import { bankBreakdownFromAccounts, estimateUpcomingPayroll, nextPayrollDate, staleFeedFromTransactionList } from "./qbo-cashflow";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function sameCalendarDay(a: Date | null, b: Date): boolean {
  if (!a) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Sum QBO Account CurrentBalance by Classification → a Balance Sheet snapshot.
 *  Reliable because the Account query is already proven on the bridge; balance
 *  sheet accounts (Asset/Liability/Equity) carry a meaningful CurrentBalance. */
export function balanceSheetFromAccounts(
  rows: Array<{ classification?: string | null; currentBalance?: number | null; active?: boolean | null }>,
): { assets: number; liabilities: number; equity: number } {
  let assets = 0, liabilities = 0, equity = 0;
  for (const a of rows) {
    if (a.active === false) continue;
    const bal = Number(a.currentBalance) || 0;
    switch ((a.classification || "").toLowerCase()) {
      case "asset": assets += bal; break;
      case "liability": liabilities += bal; break;
      case "equity": equity += bal; break;
    }
  }
  return { assets, liabilities, equity };
}

/** Pull a numeric Summary value for a top-level report group ("Income",
 *  "Expenses", "NetIncome", "CostOfGoodsSold"). Walks the report defensively so
 *  a shape we haven't seen yet returns null rather than throwing. */
export function reportGroupValue(report: any, group: string): number | null {
  const rows: any[] = report?.Rows?.Row ?? [];
  const want = group.toLowerCase();
  let found: number | null = null;
  const visit = (row: any) => {
    if (found != null) return;
    if (row?.group && String(row.group).toLowerCase() === want) {
      const cols: any[] = row?.Summary?.ColData ?? [];
      // last numeric column = the total amount
      for (let i = cols.length - 1; i >= 0; i--) {
        const v = cols[i]?.value;
        if (v != null && v !== "" && !isNaN(Number(v))) { found = Number(v); return; }
      }
    }
    const kids: any[] = row?.Rows?.Row ?? [];
    for (const k of kids) visit(k);
  };
  for (const r of rows) visit(r);
  return found;
}

/** Parse revenue / expenses / netIncome from a QBO ProfitAndLoss report.
 *  netIncome is taken straight from QBO; expenses are reconciled to
 *  revenue − netIncome so the three always tie out. */
export function profitAndLossFromReport(report: any): { revenue: number | null; expenses: number | null; netIncome: number | null } {
  const revenue = reportGroupValue(report, "Income");
  const net = reportGroupValue(report, "NetIncome");
  let expenses: number | null = null;
  if (revenue != null && net != null) {
    expenses = revenue - net;
  } else {
    const exp = reportGroupValue(report, "Expenses");
    // QBO labels the cost-of-goods section "COGS" (older feeds: "CostOfGoodsSold").
    const cogs = reportGroupValue(report, "COGS") ?? reportGroupValue(report, "CostOfGoodsSold");
    if (exp != null || cogs != null) expenses = (exp || 0) + (cogs || 0);
  }
  return { revenue, expenses, netIncome: net };
}

export interface ConnectionSyncResult {
  connectionId: number;
  clientId: number | null;
  company: string;
  ok: boolean;
  customers?: number;
  invoices?: number;
  payments?: number;
  accounts?: number;
  financials?: { revenue: number | null; expenses: number | null; netIncome: number | null; assets: number; liabilities: number; equity: number } | null;
  error?: string;
}

/** Build + upsert the per-client daily cash-flow snapshot from already-synced
 *  accounts/invoices (0 extra QBO calls) + one Bill query (AP) + one
 *  TransactionList (stale-feed proxy) + CRM payroll obligation. Isolated to this
 *  connection's clientId. Assumes accounts/invoices were just synced. */
export async function captureCashSnapshot(connection: typeof qboConnections.$inferSelect): Promise<void> {
  if (connection.clientId == null) return;
  const db = getDb();
  const clientId = connection.clientId;
  const now = new Date();

  // Cash / CC / uncategorized from the synced Chart of Accounts (no extra call).
  const acctRows = await db.select({ name: qboAccounts.name, accountType: qboAccounts.accountType, currentBalance: qboAccounts.currentBalance, currencyRef: qboAccounts.currencyRef, active: qboAccounts.active })
    .from(qboAccounts).where(eq(qboAccounts.connectionId, connection.id));
  const bank = bankBreakdownFromAccounts(acctRows as any[]);

  // AR from synced invoices (no extra call).
  const invRows = await db.select({ balance: qboInvoices.balance }).from(qboInvoices).where(eq(qboInvoices.connectionId, connection.id));
  const arOutstanding = (invRows as any[]).reduce((s, i) => s + (Number(i.balance) || 0), 0);

  // AP — one Bill query (best-effort).
  let apOutstanding = 0;
  try {
    const billData = await qboRequest(connection, "/query?query=SELECT * FROM Bill MAXRESULTS 1000");
    const bills = (billData?.QueryResponse?.Bill || []) as any[];
    apOutstanding = bills.reduce((s, b) => s + (Number(b.Balance) || 0), 0);
  } catch (e) { console.error(`[cashflow] AP query (conn ${connection.id}):`, e instanceof Error ? e.message : e); }

  // Stale-feed proxy — one TransactionList (best-effort).
  let stale = { maxStaleDays: null as number | null, staleAccounts: [] as string[], perAccount: {} as Record<string, number> };
  try {
    const start = new Date(now.getTime() - 120 * 86400000).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    const report = await qboRequest(connection, `/reports/TransactionList?start_date=${start}&end_date=${end}&columns=tx_date,account_name,subt_nat_amount`);
    stale = staleFeedFromTransactionList(report, now);
    // Fold per-account staleness into the bank account lines for the UI.
    for (const ba of bank.bankAccounts) { const d = stale.perAccount[ba.name]; if (d != null) ba.staleDays = d; }
  } catch (e) { console.error(`[cashflow] TransactionList (conn ${connection.id}):`, e instanceof Error ? e.message : e); }

  // Payroll obligation (CRM-derived) → CAD coverage.
  const clientRow = (await db.select({ payrollFrequency: clients.payrollFrequency, hasPayroll: clients.hasPayroll }).from(clients).where(eq(clients.id, clientId)).limit(1))[0] as any;
  let upcomingPayrollAmount: number | null = null, coversPayroll: boolean | null = null, payrollShortfall: number | null = null;
  let upcomingPayrollDate: Date | null = null;
  if (clientRow?.hasPayroll) {
    const emps = await db.select({ payType: employees.payType, annualSalary: employees.annualSalary, hourlyRate: employees.hourlyRate, hoursPerWeek: employees.hoursPerWeek, isActive: employees.isActive, isContractor: employees.isContractor })
      .from(employees).where(eq(employees.clientId, clientId));
    upcomingPayrollAmount = estimateUpcomingPayroll(emps as any[], clientRow.payrollFrequency);
    if (upcomingPayrollAmount != null) {
      upcomingPayrollDate = nextPayrollDate(clientRow.payrollFrequency, now);
      coversPayroll = bank.cashCad >= upcomingPayrollAmount;
      payrollShortfall = coversPayroll ? 0 : Math.round((upcomingPayrollAmount - bank.cashCad) * 100) / 100;
    }
  }

  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const row = {
    clientId, connectionId: connection.id, date,
    cashTotal: bank.cashTotal, cashCad: bank.cashCad, cashUsd: bank.cashUsd, creditCardOwed: bank.creditCardOwed,
    bankAccounts: JSON.stringify(bank.bankAccounts),
    arOutstanding, apOutstanding,
    uncategorizedBalance: bank.uncategorizedBalance, uncategorizedCount: bank.uncategorizedCount,
    staleFeedDays: stale.maxStaleDays, staleAccounts: JSON.stringify(stale.staleAccounts),
    upcomingPayrollAmount, upcomingPayrollDate, coversPayroll, payrollShortfall,
  };
  // One row per client per day.
  const ex = (await db.select({ id: clientCashSnapshots.id }).from(clientCashSnapshots)
    .where(and(eq(clientCashSnapshots.clientId, clientId), eq(clientCashSnapshots.date, date))).limit(1))[0];
  if (ex) await db.update(clientCashSnapshots).set(row).where(eq(clientCashSnapshots.id, ex.id));
  else await db.insert(clientCashSnapshots).values(row);
}

/** Sync one connection's entities + write its daily financial snapshot. */
export async function syncConnection(connection: typeof qboConnections.$inferSelect): Promise<ConnectionSyncResult> {
  const out: ConnectionSyncResult = {
    connectionId: connection.id, clientId: connection.clientId ?? null,
    company: connection.companyName || `realm ${connection.realmId}`, ok: false,
  };
  const db = getDb();
  try {
    await ensureValidToken(connection);

    // 1. Entities — each is independently best-effort so one failure (e.g. a
    //    realm without Payments) doesn't sink the whole connection.
    try { out.customers = (await doSyncCustomers(connection.id)).recordsSynced; } catch (e) { console.error(`[qbo-sync] customers ${out.company}:`, e instanceof Error ? e.message : e); }
    try { out.invoices = (await doSyncInvoices(connection.id)).recordsSynced; } catch (e) { console.error(`[qbo-sync] invoices ${out.company}:`, e instanceof Error ? e.message : e); }
    try { out.payments = (await doSyncPayments(connection.id)).recordsSynced; } catch (e) { console.error(`[qbo-sync] payments ${out.company}:`, e instanceof Error ? e.message : e); }
    try { out.accounts = (await doSyncAccounts(connection.id)).recordsSynced; } catch (e) { console.error(`[qbo-sync] accounts ${out.company}:`, e instanceof Error ? e.message : e); }

    // 2+3. Financial snapshot — only for client-bound connections (the cockpit
    //      is per client; an unassigned/triage realm has nowhere to show it).
    if (connection.clientId != null) {
      const acctRows = await db.select({ classification: qboAccounts.classification, currentBalance: qboAccounts.currentBalance, active: qboAccounts.active })
        .from(qboAccounts).where(eq(qboAccounts.connectionId, connection.id));
      const bs = balanceSheetFromAccounts(acctRows as any[]);

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), 0, 1); // calendar YTD
      let pl: { revenue: number | null; expenses: number | null; netIncome: number | null } = { revenue: null, expenses: null, netIncome: null };
      try {
        const report = await qboRequest(connection, `/reports/ProfitAndLoss?start_date=${isoDate(periodStart)}&end_date=${isoDate(now)}`);
        pl = profitAndLossFromReport(report);
      } catch (e) {
        console.error(`[qbo-sync] P&L ${out.company}:`, e instanceof Error ? e.message : e);
      }

      const fin = { ...pl, ...bs };
      out.financials = fin;

      // Upsert: one qbo snapshot per client per day (history without bloat).
      const userId = connection.userId ?? 1;
      const existing = await db.select().from(clientDashboardSnapshots)
        .where(and(eq(clientDashboardSnapshots.clientId, connection.clientId), eq(clientDashboardSnapshots.source, "qbo")))
        .orderBy(desc(clientDashboardSnapshots.createdAt)).limit(1);
      const row = {
        clientId: connection.clientId, userId,
        revenue: fin.revenue ?? 0, expenses: fin.expenses ?? 0, netIncome: fin.netIncome ?? ((fin.revenue ?? 0) - (fin.expenses ?? 0)),
        assets: fin.assets, liabilities: fin.liabilities, equity: fin.equity,
        periodStart, periodEnd: now, source: "qbo" as const,
      };
      if (existing[0] && sameCalendarDay(existing[0].createdAt ?? null, now)) {
        await db.update(clientDashboardSnapshots).set(row).where(eq(clientDashboardSnapshots.id, existing[0].id));
      } else {
        await db.insert(clientDashboardSnapshots).values(row);
      }

      // Cash-flow snapshot (Markie's real priority) — best-effort, never sinks the sync.
      try { await captureCashSnapshot(connection); } catch (e) { console.error(`[qbo-sync] cashflow ${out.company}:`, e instanceof Error ? e.message : e); }
    }

    await db.update(qboConnections).set({ lastSyncedAt: new Date() }).where(eq(qboConnections.id, connection.id));
    out.ok = true;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    console.error(`[qbo-sync] connection ${out.company} failed:`, out.error);
    try {
      await db.insert(qboSyncLogs).values({ connectionId: connection.id, entityType: "company_info", status: "error", recordsSynced: 0, errorMessage: out.error, completedAt: new Date() });
    } catch { /* logging is best-effort */ }
  }
  return out;
}

/** Pull every active connection (isolated, best-effort) and refresh snapshots. */
export async function runQboSync(): Promise<{ ran: boolean; connections: number; results: ConnectionSyncResult[] }> {
  if (process.env.FIGGY_QBO_SYNC_DISABLE === "on") {
    console.log("[qbo-sync] FIGGY_QBO_SYNC_DISABLE=on — skipping.");
    return { ran: false, connections: 0, results: [] };
  }
  const db = getDb();
  const conns = await db.select().from(qboConnections).where(eq(qboConnections.isActive, true));
  console.log(`[qbo-sync] starting for ${conns.length} active connection(s)`);
  const results: ConnectionSyncResult[] = [];
  for (const c of conns as any[]) {
    results.push(await syncConnection(c));
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log(`[qbo-sync] done: ${okCount}/${results.length} ok`);
  return { ran: true, connections: conns.length, results };
}
