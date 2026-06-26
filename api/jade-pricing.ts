/**
 * JADE — PRICING ANALYSIS (pulls from GoFig Bookz Inc.'s OWN QBO books).
 * =============================================================================
 * Markie (2026-06-26): "Jade has access to my books (GoFig Bookz Inc, the firm),
 * which is connected — she could pull who is being billed what per month."
 *
 * So Jade reads the FIRM's invoices straight from QBO, groups them by client, and
 * shows the monthly billing per client. Joined with the Subscriptions cost ledger,
 * that gives margin per client — the "am I charging right?" view.
 *
 * READ-ONLY. Defensive: any failure returns {error}, never throws into the page.
 * Runs on the deployed server (where the firm's native QBO connection lives).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { qboRequest } from "./qbo-router";

/** Find the firm's own QBO connection (GoFig Bookz Inc.). */
export async function findFirmConnection(): Promise<any | null> {
  const db = getDb();
  // Prefer the Canadian firm entity ("Go Fig Bookz Inc.") over "Go Fig Bookz USA".
  const rows = (await db.all(sql`SELECT * FROM qbo_connections WHERE isActive = 1 AND (
      lower(companyName) LIKE '%go fig%' OR lower(companyName) LIKE '%gofig%')
      ORDER BY (lower(companyName) LIKE '%usa%') ASC`)) as any[];
  return rows[0] || null;
}

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export type ClientBilling = { customer: string; total: number; monthlyAvg: number; invoices: number; lastDate?: string };

/** Pull the firm's invoices for the last N months, grouped by client. */
export async function pullFirmBilling(months = 3): Promise<{ period: { start: string; months: number }; firm?: string; rows: ClientBilling[]; error?: string }> {
  const period = { start: isoMonthsAgo(months), months };
  try {
    const conn = await findFirmConnection();
    if (!conn) return { period, rows: [], error: "No firm (GoFig Bookz Inc.) QBO connection found." };
    // SELECT * — a column-projected Invoice query can drop nested refs.
    const res: any = await qboRequest(conn, `/query?query=${encodeURIComponent(`SELECT * FROM Invoice WHERE TxnDate >= '${period.start}' ORDERBY TxnDate DESC MAXRESULTS 1000`)}`);
    const body = res?.QueryResponse || res?.body?.QueryResponse || res?.tool_output?.body?.QueryResponse || res;
    const invoices: any[] = body?.Invoice || body?.QueryResponse?.Invoice || [];
    const map = new Map<string, ClientBilling>();
    for (const inv of invoices) {
      const name = inv?.CustomerRef?.name || inv?.CustomerRef?.value || "Unknown";
      const amt = Number(inv?.TotalAmt) || 0;
      const cur = map.get(name) || { customer: name, total: 0, monthlyAvg: 0, invoices: 0 };
      cur.total += amt; cur.invoices += 1;
      if (!cur.lastDate || (inv?.TxnDate && inv.TxnDate > cur.lastDate)) cur.lastDate = inv?.TxnDate;
      map.set(name, cur);
    }
    const rows = Array.from(map.values()).map((r) => ({ ...r, total: Math.round(r.total * 100) / 100, monthlyAvg: Math.round((r.total / months) * 100) / 100 }))
      .sort((a, b) => b.monthlyAvg - a.monthlyAvg);
    return { period, firm: conn.companyName, rows };
  } catch (e) {
    return { period, rows: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Join firm billing with the Subscriptions cost ledger → margin per client. */
export async function pricingAnalysis(months = 3): Promise<any> {
  const billing = await pullFirmBilling(months);
  const db = getDb();
  let subs: any[] = [];
  try { subs = (await db.all(sql`SELECT label, monthlyCost FROM firm_subscriptions WHERE active = 1`)) as any[]; } catch { /* table may not exist yet */ }
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const costByName = new Map(subs.map((s) => [norm(s.label), Number(s.monthlyCost) || 0]));
  const rows = billing.rows.map((r) => {
    const cost = costByName.get(norm(r.customer)) ?? null;
    const margin = cost != null ? Math.round((r.monthlyAvg - cost) * 100) / 100 : null;
    const flag = r.monthlyAvg <= 0 ? "no recent billing" : margin != null && margin < 0 ? "billing below cost" : undefined;
    return { ...r, monthlyCost: cost, margin, flag };
  });
  return { ...billing, rows };
}
