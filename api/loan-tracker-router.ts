/**
 * LOAN TRACKER ROUTER
 * =============================================================================
 * Per-client loan ledgers (shareholder / inter-company / third-party). One client
 * can have several loan accounts (e.g. "Conor — shareholder loan", "Adbank → Clark
 * loan"); each has its own entry ledger and a running balance owed. Replaces the
 * manual Google sheets. Optional read-only client share link.
 * Scoped by clientId throughout (per-client isolation).
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, loanAccounts, loanEntries, loanShareLinks } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { buildLoanLedger, summarizeLoan, validateLoanEntry, type LoanEntryKind } from "./loan-tracker-core";

const KIND = z.enum(["opening", "advance", "repayment", "interest", "adjust"]);

/** Normalize an amount to the right sign for its kind (so the UI can't store a
 *  repayment as positive, etc.). adjust keeps the given sign. */
function signedAmount(kind: LoanEntryKind, amount: number): number {
  const a = Math.abs(amount);
  if (kind === "repayment") return -a;
  if (kind === "advance" || kind === "interest") return a;
  return amount; // opening + adjust: caller decides the sign
}

/** Summaries for every loan of a client (used by staff board + public view). */
async function loansForClient(clientId: number) {
  const db = getDb();
  const accounts = (await db.select().from(loanAccounts).where(eq(loanAccounts.clientId, clientId)).orderBy(desc(loanAccounts.createdAt))) as any[];
  const allEntries = (await db.select().from(loanEntries).where(eq(loanEntries.clientId, clientId))) as any[];
  const byLoan = new Map<number, any[]>();
  for (const e of allEntries) {
    if (!byLoan.has(e.loanId)) byLoan.set(e.loanId, []);
    byLoan.get(e.loanId)!.push(e);
  }
  const loans = accounts.map((a) => {
    const entries = byLoan.get(a.id) ?? [];
    const s = summarizeLoan(entries.map((x) => ({ entryDate: x.entryDate, amount: x.amount, kind: x.kind })));
    return { ...a, summary: s };
  });
  const netOwed = Math.round(loans.reduce((sum, l) => sum + l.summary.balance, 0) * 100) / 100;
  return { loans, netOwed };
}

export const loanTrackerRouter = createRouter({
  // All loans for a client, each with its summary.
  list: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => loansForClient(input.clientId)),

  // One loan's full ledger (newest first for display; balance computed oldest→newest).
  ledger: staffQuery
    .input(z.object({ loanId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const loan = (await db.select().from(loanAccounts).where(eq(loanAccounts.id, input.loanId)).limit(1))[0] as any;
      if (!loan) return null;
      const rows = (await db.select().from(loanEntries).where(eq(loanEntries.loanId, input.loanId))) as any[];
      const led = buildLoanLedger(rows.map((r) => ({ ...r, entryDate: r.entryDate })));
      const s = summarizeLoan(rows.map((r) => ({ entryDate: r.entryDate, amount: r.amount, kind: r.kind })));
      return { loan, summary: s, ledger: led.reverse() };
    }),

  createLoan: staffQuery
    .input(z.object({
      clientId: z.number(),
      name: z.string().min(1).max(160),
      counterparty: z.string().max(160).nullable().optional(),
      annualRatePct: z.number().min(0).max(100).nullable().optional(),
      note: z.string().max(1000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.insert(loanAccounts).values({
        clientId: input.clientId, name: input.name, counterparty: input.counterparty ?? null,
        annualRatePct: input.annualRatePct ?? null, note: input.note ?? null,
        status: "active", createdBy: ctx.user.id,
      } as any).returning();
      return { ok: true, id: row?.id };
    }),

  updateLoan: staffQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(160).optional(),
      counterparty: z.string().max(160).nullable().optional(),
      annualRatePct: z.number().min(0).max(100).nullable().optional(),
      status: z.enum(["active", "settled", "archived"]).optional(),
      note: z.string().max(1000).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...rest } = input;
      await db.update(loanAccounts).set({ ...rest, updatedAt: new Date() } as any).where(eq(loanAccounts.id, id));
      return { ok: true };
    }),

  deleteLoan: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      // Remove the loan and its entries (clientId-scoped delete of entries by loanId).
      await db.delete(loanEntries).where(eq(loanEntries.loanId, input.id));
      await db.delete(loanAccounts).where(eq(loanAccounts.id, input.id));
      return { ok: true };
    }),

  addEntry: staffQuery
    .input(z.object({
      loanId: z.number(),
      entryDate: z.date().optional(),
      amount: z.number(),
      kind: KIND,
      note: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const loan = (await db.select().from(loanAccounts).where(eq(loanAccounts.id, input.loanId)).limit(1))[0] as any;
      if (!loan) throw new Error("Loan not found.");
      const amount = signedAmount(input.kind, input.amount);
      const warn = validateLoanEntry({ amount, kind: input.kind });
      if (warn) throw new Error(warn);
      await db.insert(loanEntries).values({
        loanId: input.loanId, clientId: loan.clientId,
        entryDate: input.entryDate ?? new Date(), amount, kind: input.kind,
        note: input.note ?? null, source: "manual", enteredBy: ctx.user.email ?? String(ctx.user.id),
      } as any);
      return { ok: true };
    }),

  updateEntry: staffQuery
    .input(z.object({
      id: z.number(),
      entryDate: z.date().optional(),
      amount: z.number().optional(),
      kind: KIND.optional(),
      note: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const existing = (await db.select().from(loanEntries).where(eq(loanEntries.id, input.id)).limit(1))[0] as any;
      if (!existing) throw new Error("Entry not found.");
      const kind = input.kind ?? existing.kind;
      const patch: any = { updatedAt: new Date() };
      if (input.entryDate) patch.entryDate = input.entryDate;
      if (input.kind) patch.kind = input.kind;
      if (input.note !== undefined) patch.note = input.note;
      if (input.amount != null) patch.amount = signedAmount(kind, input.amount);
      await db.update(loanEntries).set(patch).where(eq(loanEntries.id, input.id));
      return { ok: true };
    }),

  deleteEntry: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(loanEntries).where(eq(loanEntries.id, input.id));
      return { ok: true };
    }),

  // ===== SHARE LINKS (read-only by default) =====
  shareList: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(loanShareLinks).where(eq(loanShareLinks.clientId, input.clientId)).orderBy(desc(loanShareLinks.createdAt));
    }),

  shareCreate: staffQuery
    .input(z.object({ clientId: z.number(), label: z.string().max(120).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const token = `ln_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(loanShareLinks).values({ clientId: input.clientId, token, label: input.label ?? null, allowEdit: false, active: true, createdBy: ctx.user.id } as any);
      return { ok: true, token };
    }),

  shareRevoke: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(loanShareLinks).set({ active: false, revokedAt: new Date() }).where(eq(loanShareLinks.id, input.id));
      return { ok: true };
    }),

  // ===== PUBLIC (token-gated read-only) =====
  publicView: publicQuery
    .input(z.object({ token: z.string().min(6) }))
    .query(async ({ input }) => {
      const db = getDb();
      const link = (await db.select().from(loanShareLinks).where(eq(loanShareLinks.token, input.token)).limit(1))[0] as any;
      if (!link || !link.active) return null;
      const client = (await db.select().from(clients).where(eq(clients.id, link.clientId)).limit(1))[0] as any;
      const data = await loansForClient(link.clientId);
      return { clientName: client?.name ?? "Loans", label: link.label ?? null, generatedAt: new Date().toISOString(), ...data };
    }),
});

export type { LoanEntryKind };
