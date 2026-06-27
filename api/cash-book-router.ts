/**
 * CASH BOOK ROUTER (tRPC) — per-client cash book for micro-clients / holding cos.
 * =============================================================================
 * Purpose:  Manage cash-book accounts + entries, return the register w/ running
 *           balance, a bank reconciliation, and a year-end category summary.
 * Boundary: Every query is scoped by clientId (per-client isolation). Read paths
 *           are pure; writes validate via cash-book-core before persisting (fail
 *           safely — never store an invalid figure).
 * Deps:     cash-book-core (pure math), getDb (libSQL), middleware (staffQuery).
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import {
  buildRegister, summarize, categoryTotals, inRange, reconcile, validateEntry,
  hstWorksheet, DEFAULT_CATEGORIES, type CashEntry, type Direction,
} from "./cash-book-core";
import { parseCsvTransactions } from "./recon-match-core";

const dirEnum = z.enum(["in", "out"]);

/** Load all entries for an account as CashEntry[] (newest-first from DB, math re-sorts). */
async function loadEntries(clientId: number, accountId: number): Promise<(CashEntry & { id: number })[]> {
  const rows = (await getDb().all(sql`SELECT id, entryDate, direction, amount, category, description, reference, hst, cleared
    FROM cash_book_entries WHERE clientId=${clientId} AND accountId=${accountId}`)) as any[];
  return rows.map((r) => ({
    id: r.id, entryDate: r.entryDate, direction: r.direction as Direction, amount: r.amount,
    category: r.category, description: r.description, reference: r.reference,
    hst: r.hst, cleared: !!r.cleared,
  }));
}

async function getAccount(clientId: number, accountId: number): Promise<any | null> {
  return ((await getDb().all(sql`SELECT * FROM cash_book_accounts WHERE id=${accountId} AND clientId=${clientId} LIMIT 1`)) as any[])[0] || null;
}

export const cashBookRouter = createRouter({
  defaultCategories: staffQuery.query(() => DEFAULT_CATEGORIES),

  // ───────── ACCOUNTS ─────────
  accounts: staffQuery.input(z.object({ clientId: z.number() })).query(async ({ input }) => {
    return (await getDb().all(sql`SELECT * FROM cash_book_accounts WHERE clientId=${input.clientId} ORDER BY active DESC, name ASC`)) as any[];
  }),

  createAccount: staffQuery
    .input(z.object({
      clientId: z.number(), name: z.string().min(1).max(120), institution: z.string().max(120).optional(),
      openingBalance: z.number().default(0), openingDate: z.string().optional(),
      fiscalYearEnd: z.string().max(5).optional(), notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb(); const now = Date.now();
      await db.run(sql`INSERT INTO cash_book_accounts (clientId, name, institution, openingBalance, openingDate, fiscalYearEnd, notes, active, createdAt, updatedAt)
        VALUES (${input.clientId}, ${input.name}, ${input.institution ?? null}, ${input.openingBalance}, ${input.openingDate ?? null}, ${input.fiscalYearEnd ?? null}, ${input.notes ?? null}, 1, ${now}, ${now})`);
      const row = ((await db.all(sql`SELECT id FROM cash_book_accounts WHERE clientId=${input.clientId} ORDER BY id DESC LIMIT 1`)) as any[])[0];
      return { ok: true as const, id: row?.id };
    }),

  updateAccount: staffQuery
    .input(z.object({
      id: z.number(), clientId: z.number(),
      name: z.string().min(1).max(120).optional(), institution: z.string().max(120).nullable().optional(),
      openingBalance: z.number().optional(), openingDate: z.string().nullable().optional(),
      fiscalYearEnd: z.string().max(5).nullable().optional(),
      statementBalance: z.number().nullable().optional(), statementDate: z.string().nullable().optional(),
      notes: z.string().max(500).nullable().optional(), active: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const cur = await getAccount(input.clientId, input.id);
      if (!cur) return { ok: false as const, error: "not_found" };
      const m = (k: string, v: any) => (v === undefined ? cur[k] : v);
      await db.run(sql`UPDATE cash_book_accounts SET
        name=${m("name", input.name)}, institution=${m("institution", input.institution)},
        openingBalance=${m("openingBalance", input.openingBalance)}, openingDate=${m("openingDate", input.openingDate)},
        fiscalYearEnd=${m("fiscalYearEnd", input.fiscalYearEnd)},
        statementBalance=${m("statementBalance", input.statementBalance)}, statementDate=${m("statementDate", input.statementDate)},
        notes=${m("notes", input.notes)}, active=${input.active === undefined ? cur.active : input.active ? 1 : 0}, updatedAt=${Date.now()}
        WHERE id=${input.id} AND clientId=${input.clientId}`);
      return { ok: true as const };
    }),

  removeAccount: staffQuery.input(z.object({ id: z.number(), clientId: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.run(sql`DELETE FROM cash_book_entries WHERE accountId=${input.id} AND clientId=${input.clientId}`);
    await db.run(sql`DELETE FROM cash_book_accounts WHERE id=${input.id} AND clientId=${input.clientId}`);
    return { ok: true as const };
  }),

  // ───────── REGISTER (entries + running balance + summary) ─────────
  register: staffQuery
    .input(z.object({ clientId: z.number(), accountId: z.number(), start: z.string().optional(), end: z.string().optional() }))
    .query(async ({ input }) => {
      const acct = await getAccount(input.clientId, input.accountId);
      if (!acct) return null;
      const all = await loadEntries(input.clientId, input.accountId);
      // Running balance is computed over ALL entries (so a date filter still shows the
      // true balance carried into the window), then we slice to the requested range.
      const fullRegister = buildRegister(all, acct.openingBalance || 0);
      const idSet = new Set(inRange(all, input.start, input.end).map((e) => (e as any).id));
      const rows = (input.start || input.end) ? fullRegister.filter((r) => idSet.has((r as any).id)) : fullRegister;
      const windowEntries = (input.start || input.end) ? inRange(all, input.start, input.end) : all;
      return {
        account: acct,
        rows: rows.slice().reverse(), // newest first for display
        summary: summarize(windowEntries, acct.openingBalance || 0),
        currentBalance: fullRegister.length ? fullRegister[fullRegister.length - 1].balance : (acct.openingBalance || 0),
      };
    }),

  addEntry: staffQuery
    .input(z.object({
      clientId: z.number(), accountId: z.number(), entryDate: z.string(), direction: dirEnum,
      amount: z.number(), category: z.string().max(120).optional(), description: z.string().max(500).optional(),
      reference: z.string().max(120).optional(), hst: z.number().nullable().optional(), cleared: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const problems = validateEntry(input);
      if (problems.length) return { ok: false as const, problems };
      const db = getDb(); const now = Date.now();
      await db.run(sql`INSERT INTO cash_book_entries (clientId, accountId, entryDate, direction, amount, category, description, reference, hst, cleared, source, createdAt, updatedAt)
        VALUES (${input.clientId}, ${input.accountId}, ${input.entryDate}, ${input.direction}, ${Math.abs(input.amount)},
        ${input.category ?? null}, ${input.description ?? null}, ${input.reference ?? null}, ${input.hst ?? null}, ${input.cleared ? 1 : 0}, 'manual', ${now}, ${now})`);
      return { ok: true as const };
    }),

  updateEntry: staffQuery
    .input(z.object({
      id: z.number(), clientId: z.number(), entryDate: z.string().optional(), direction: dirEnum.optional(),
      amount: z.number().optional(), category: z.string().max(120).nullable().optional(), description: z.string().max(500).nullable().optional(),
      reference: z.string().max(120).nullable().optional(), hst: z.number().nullable().optional(), cleared: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const cur = ((await db.all(sql`SELECT * FROM cash_book_entries WHERE id=${input.id} AND clientId=${input.clientId} LIMIT 1`)) as any[])[0];
      if (!cur) return { ok: false as const, error: "not_found" };
      const merged = {
        entryDate: input.entryDate ?? cur.entryDate,
        direction: (input.direction ?? cur.direction) as Direction,
        amount: input.amount ?? cur.amount,
        hst: input.hst === undefined ? cur.hst : input.hst,
      };
      const problems = validateEntry(merged);
      if (problems.length) return { ok: false as const, problems };
      const m = (k: string, v: any) => (v === undefined ? cur[k] : v);
      await db.run(sql`UPDATE cash_book_entries SET
        entryDate=${merged.entryDate}, direction=${merged.direction}, amount=${Math.abs(merged.amount)},
        category=${m("category", input.category)}, description=${m("description", input.description)},
        reference=${m("reference", input.reference)}, hst=${merged.hst},
        cleared=${input.cleared === undefined ? cur.cleared : input.cleared ? 1 : 0}, updatedAt=${Date.now()}
        WHERE id=${input.id} AND clientId=${input.clientId}`);
      return { ok: true as const };
    }),

  /**
   * Import bank/CSV transactions into the cash book. Reuses the recon CSV parser
   * (handles signed Amount OR debit/credit columns). Sign → direction, magnitude →
   * amount. Returns a preview when dryRun, or the inserted count. Skips $0/unparseable
   * rows. HST is left blank (the user codes it after) — never guessed.
   */
  importEntries: staffQuery
    .input(z.object({ clientId: z.number(), accountId: z.number(), text: z.string().min(1), dryRun: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const acct = await getAccount(input.clientId, input.accountId);
      if (!acct) return { ok: false as const, error: "account_not_found" };
      const txns = parseCsvTransactions(input.text);
      const rows = txns.map((t) => {
        const iso = t._ms != null ? new Date(t._ms).toISOString().slice(0, 10) : String(t.date).slice(0, 10);
        return {
          entryDate: iso,
          direction: (t.amount >= 0 ? "in" : "out") as Direction,
          amount: Math.abs(t.amount),
          description: t.description || null,
        };
      }).filter((r) => r.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.entryDate));
      if (input.dryRun) return { ok: true as const, preview: rows.slice(0, 50), count: rows.length };
      const db = getDb(); const now = Date.now();
      for (const r of rows) {
        await db.run(sql`INSERT INTO cash_book_entries (clientId, accountId, entryDate, direction, amount, description, cleared, source, createdAt, updatedAt)
          VALUES (${input.clientId}, ${input.accountId}, ${r.entryDate}, ${r.direction}, ${r.amount}, ${r.description}, 0, 'import', ${now}, ${now})`);
      }
      return { ok: true as const, count: rows.length };
    }),

  setCleared: staffQuery.input(z.object({ id: z.number(), clientId: z.number(), cleared: z.boolean() })).mutation(async ({ input }) => {
    await getDb().run(sql`UPDATE cash_book_entries SET cleared=${input.cleared ? 1 : 0}, updatedAt=${Date.now()} WHERE id=${input.id} AND clientId=${input.clientId}`);
    return { ok: true as const };
  }),

  removeEntry: staffQuery.input(z.object({ id: z.number(), clientId: z.number() })).mutation(async ({ input }) => {
    await getDb().run(sql`DELETE FROM cash_book_entries WHERE id=${input.id} AND clientId=${input.clientId}`);
    return { ok: true as const };
  }),

  // ───────── RECONCILIATION ─────────
  reconcile: staffQuery
    .input(z.object({ clientId: z.number(), accountId: z.number(), statementBalance: z.number() }))
    .query(async ({ input }) => {
      const acct = await getAccount(input.clientId, input.accountId);
      if (!acct) return null;
      const all = await loadEntries(input.clientId, input.accountId);
      return reconcile(all, input.statementBalance, acct.openingBalance || 0);
    }),

  // ───────── HST / GST RETURN WORKSHEET (deterministic from the book) ─────────
  hstWorksheet: staffQuery
    .input(z.object({ clientId: z.number(), accountId: z.number(), start: z.string().optional(), end: z.string().optional() }))
    .query(async ({ input }) => {
      const acct = await getAccount(input.clientId, input.accountId);
      if (!acct) return null;
      const all = await loadEntries(input.clientId, input.accountId);
      return { account: acct, worksheet: hstWorksheet(all, { start: input.start, end: input.end }) };
    }),

  // ───────── YEAR-END / PERIOD SUMMARY (the T2 backbone) ─────────
  summary: staffQuery
    .input(z.object({ clientId: z.number(), accountId: z.number(), start: z.string().optional(), end: z.string().optional() }))
    .query(async ({ input }) => {
      const acct = await getAccount(input.clientId, input.accountId);
      if (!acct) return null;
      const all = await loadEntries(input.clientId, input.accountId);
      const windowEntries = (input.start || input.end) ? inRange(all, input.start, input.end) : all;
      return {
        account: acct,
        period: { start: input.start ?? null, end: input.end ?? null },
        totals: summarize(windowEntries, acct.openingBalance || 0),
        categories: categoryTotals(windowEntries),
      };
    }),
});
