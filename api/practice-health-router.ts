import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, payRuns, qboInvoices, tasks } from "../db/schema";

/**
 * PRACTICE HEALTH — Go Fig Bookz as the FIRM.
 *
 * Owner-only firm-performance rollup built from real CRM data: the client roster
 * (counts, mix, new/churned), recurring practice revenue (Σ monthly fee of active
 * clients), payroll processed across the book (real throughput we already hold),
 * a per-client revenue ranking, and billed-vs-collected from the firm self-client's
 * own QBO invoices when connected. Read-only. Degrades gracefully: when fees aren't
 * set the counts + payroll-processed still surface; billing is null until QBO is on.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const yearOf = (d: any) => (d ? new Date(d).getFullYear() : null);
const feeOf = (c: any) => Number(c.monthlyFee) || Number(c.estimatedMonthlyValue) || 0;

export const practiceHealthRouter = createRouter({
  summary: staffQuery
    .input(z.object({ year: z.number().optional(), firmId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const year = input?.year ?? new Date().getFullYear();
      const now = new Date();
      const monthStart = new Date(year, now.getMonth(), 1);

      const [cs, runs, invoices, allTasks] = await Promise.all([
        db.select().from(clients),
        db.select().from(payRuns),
        db.select().from(qboInvoices),
        db.select().from(tasks),
      ]);

      const all = cs as any[];
      // The firm can be MORE THAN ONE entity — Go Fig Bookz (Canada) and Go Fig Bookz
      // USA are separate firms with their own income, issues and taxes. Each anchors its
      // own Practice Health view; the caller picks which via firmId (default: the
      // Canadian firm, i.e. the non-US one).
      const firms = all.filter((c) => c.isFirm);
      const firm = (input?.firmId ? firms.find((c) => c.id === input.firmId) : null)
        || firms.find((c) => (c.country || "CA") !== "US")
        || firms[0]
        || null;
      // The book = every real client except ANY firm row, SCOPED to the selected firm's
      // country so each firm's Practice Health shows only its own clients/income (the
      // Canadian firm books CA clients; Go Fig Bookz USA books US clients). With one firm
      // this is a no-op (everything is its country).
      const firmIsUS = (firm?.country || "CA") === "US";
      const book = all.filter((c) => !c.isFirm && ((c.country || "CA") === "US") === firmIsUS);
      const active = book.filter((c) => c.status === "active");

      // ---- Client roster ----
      const roster = {
        total: book.length,
        active: active.length,
        prospect: book.filter((c) => c.status === "prospect").length,
        lead: book.filter((c) => c.status === "lead").length,
        inactive: book.filter((c) => c.status === "inactive").length,
        churned: book.filter((c) => c.workflowStatus === "churned").length,
        newThisMonth: book.filter((c) => c.createdAt && new Date(c.createdAt) >= monthStart).length,
        hstClients: active.filter((c) => !!c.hasHST).length,
        payrollClients: active.filter((c) => !!c.hasPayroll && !c.payrollExternal).length,
        byType: {
          monthly: active.filter((c) => c.clientType === "monthly").length,
          quarterly: active.filter((c) => c.clientType === "quarterly").length,
          annual: active.filter((c) => c.clientType === "annual").length,
          payroll: active.filter((c) => c.clientType === "payroll").length,
          wholesale: active.filter((c) => c.clientType === "wholesale").length,
        },
      };

      // ---- Recurring practice revenue (MRR) ----
      const withFee = active.filter((c) => feeOf(c) > 0);
      const mrr = r2(active.reduce((s, c) => s + feeOf(c), 0));
      const revenue = {
        mrr,
        annualized: r2(mrr * 12),
        clientsWithFee: withFee.length,
        clientsMissingFee: active.length - withFee.length,
        avgFee: active.length ? r2(mrr / active.length) : 0,
      };

      // ---- Payroll processed across the book (real throughput) ----
      const ytdRuns = (runs as any[]).filter((p) => yearOf(p.payDate ?? p.payPeriodEnd) === year);
      const payrollClientIds = new Set(ytdRuns.map((p) => p.clientId));
      const payrollProcessed = {
        year,
        ytdGross: r2(ytdRuns.reduce((s, p) => s + (Number(p.totalGross) || 0), 0)),
        runs: ytdRuns.length,
        clients: payrollClientIds.size,
      };

      // ---- Per-client revenue ranking ----
      const ytdPayrollByClient = new Map<number, number>();
      for (const p of ytdRuns) ytdPayrollByClient.set(p.clientId, (ytdPayrollByClient.get(p.clientId) || 0) + (Number(p.totalGross) || 0));
      const openTasksByClient = new Map<number, number>();
      for (const t of allTasks as any[]) {
        if (t.completed || t.status === "completed") continue;
        if (t.clientId == null) continue;
        openTasksByClient.set(t.clientId, (openTasksByClient.get(t.clientId) || 0) + 1);
      }
      const topClients = active
        .map((c) => ({
          id: c.id,
          name: c.name,
          clientType: c.clientType,
          monthlyFee: feeOf(c),
          hasPayroll: !!c.hasPayroll && !c.payrollExternal,
          ytdPayroll: r2(ytdPayrollByClient.get(c.id) || 0),
          openTasks: openTasksByClient.get(c.id) || 0,
        }))
        .sort((a, b) => b.monthlyFee - a.monthlyFee || b.ytdPayroll - a.ytdPayroll || a.name.localeCompare(b.name))
        .slice(0, 10);

      // ---- Billed vs collected (firm self-client's own QBO invoices) ----
      let billing: null | { invoiced: number; collected: number; outstanding: number; aging30: number; aging60: number; aging90: number; collectionRate: number } = null;
      if (firm) {
        const firmInv = (invoices as any[]).filter((i) => i.clientId === firm.id && yearOf(i.transactionDate) === year);
        if (firmInv.length) {
          const invoiced = r2(firmInv.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0));
          const outstanding = r2(firmInv.reduce((s, i) => s + (Number(i.balance) || 0), 0));
          const collected = r2(invoiced - outstanding);
          const dayMs = 86400000;
          const aged = (lo: number, hi: number) =>
            r2(
              firmInv
                .filter((i) => (Number(i.balance) || 0) > 0 && i.dueDate)
                .filter((i) => {
                  const d = (now.getTime() - new Date(i.dueDate).getTime()) / dayMs;
                  return d > lo && d <= hi;
                })
                .reduce((s, i) => s + (Number(i.balance) || 0), 0),
            );
          billing = {
            invoiced,
            collected,
            outstanding,
            aging30: aged(0, 30),
            aging60: aged(30, 60),
            aging90: aged(60, Infinity),
            collectionRate: invoiced ? Math.round((collected / invoiced) * 100) : 0,
          };
        }
      }

      return {
        year,
        firm: firm ? { id: firm.id, name: firm.name, country: firm.country || "CA", qboConnected: !!firm.qboConnectionId } : null,
        // All firm entities, so the UI can switch between Go Fig Bookz (CA) and Go Fig Bookz USA.
        firms: firms.map((f) => ({ id: f.id, name: f.name, country: f.country || "CA" })),
        roster,
        revenue,
        payrollProcessed,
        topClients,
        billing,
      };
    }),
});
