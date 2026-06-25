import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, employees, payRuns, tasks, intercoEntries } from "../db/schema";
import { eq } from "drizzle-orm";
import { suggestSettlements } from "./settlement-core";

/**
 * COMPANY GROUPS — consolidated rollup across a set of related entities (e.g. all of
 * Jon Gillham's companies). Phase 1: list groups + a per-company + group-total view
 * built from what the CRM already holds (YTD payroll gross from pay runs, headcount,
 * open tasks, fiscal/HST flags, and net interco position). Read-only; QBO-fed figures
 * deepen this once connected.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const yearOf = (d: any) => (d ? new Date(d).getFullYear() : null);

export const groupRouter = createRouter({
  // Distinct group names with a company count (for the group picker).
  list: staffQuery.query(async () => {
    const db = getDb();
    const cs = (await db.select().from(clients)) as any[];
    const byGroup = new Map<string, number>();
    for (const c of cs) {
      const g = (c.groupName || "").trim();
      if (!g) continue;
      byGroup.set(g, (byGroup.get(g) || 0) + 1);
    }
    return Array.from(byGroup.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }),

  // Consolidated rollup for one group.
  rollup: staffQuery
    .input(z.object({ groupName: z.string(), year: z.number().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const year = input.year ?? new Date().getFullYear();
      const g = input.groupName.trim().toLowerCase();

      const cs = ((await db.select().from(clients)) as any[]).filter(
        (c) => (c.groupName || "").trim().toLowerCase() === g,
      );
      const ids = new Set(cs.map((c) => c.id));
      if (!cs.length) return { groupName: input.groupName, year, companies: [], totals: null };

      const [emps, runs, allTasks, interco] = await Promise.all([
        db.select().from(employees),
        db.select().from(payRuns),
        db.select().from(tasks),
        db.select().from(intercoEntries),
      ]);

      const companies = cs.map((c) => {
        const empList = (emps as any[]).filter((e) => e.clientId === c.id && e.isActive !== false);
        const ytdRuns = (runs as any[]).filter((p) => p.clientId === c.id && yearOf(p.payDate ?? p.payPeriodEnd) === year);
        const ytdPayroll = r2(ytdRuns.reduce((s, p) => s + (Number(p.totalGross) || 0), 0));
        const openTasks = (allTasks as any[]).filter((t) => t.clientId === c.id && !t.completed && t.status !== "completed").length;
        // Net interco position: + = others owe this company (it fronted), − = it owes.
        let intercoNet = 0;
        for (const e of interco as any[]) {
          if (e.payerClientId === c.id && ids.has(e.counterpartyClientId)) intercoNet += Number(e.amount) || 0;
          if (e.counterpartyClientId === c.id && ids.has(e.payerClientId)) intercoNet -= Number(e.amount) || 0;
        }
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          clientType: c.clientType,
          yearEndMonth: c.yearEndMonth ?? null,
          hasHST: !!c.hasHST,
          hasPayroll: !!c.hasPayroll,
          employees: empList.length,
          payRuns: ytdRuns.length,
          ytdPayroll,
          openTasks,
          intercoNet: r2(intercoNet),
        };
      }).sort((a, b) => b.ytdPayroll - a.ytdPayroll || a.name.localeCompare(b.name));

      const totals = {
        companies: companies.length,
        employees: companies.reduce((s, c) => s + c.employees, 0),
        ytdPayroll: r2(companies.reduce((s, c) => s + c.ytdPayroll, 0)),
        openTasks: companies.reduce((s, c) => s + c.openTasks, 0),
        payRuns: companies.reduce((s, c) => s + c.payRuns, 0),
        // Net interco across the group should net to ~0 when fully matched; the
        // absolute sum of positives flags how much is still moving between entities.
        intercoOutstanding: r2(companies.filter((c) => c.intercoNet > 0).reduce((s, c) => s + c.intercoNet, 0)),
        intercoNetCheck: r2(companies.reduce((s, c) => s + c.intercoNet, 0)),
      };

      // Suggested settlement transfers to clear the interco balances (fewest payments).
      const settlement = suggestSettlements(
        companies.filter((c) => Math.abs(c.intercoNet) > 0.005).map((c) => ({ id: c.id, name: c.name, net: c.intercoNet })),
      );

      return { groupName: input.groupName, year, companies, totals, settlement };
    }),
});
