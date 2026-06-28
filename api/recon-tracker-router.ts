/**
 * MONTH-END RECON TRACKER ROUTER — per-client account reconciliation status.
 * list / upsert / remove / importPaste. Read-mostly; the only writes are the
 * account rows Markie (or a paste) provides. QBO auto-pull comes later.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientReconAccounts } from "../db/schema";
import { eq, and, asc } from "drizzle-orm";
import { parseReconPaste, summarizeRecon, accountStatus, type ReconAccount } from "./recon-tracker-core";

/** Most-recently-COMPLETED month-end, yyyy-mm-dd (the default close target). */
function defaultPeriodEnd(): string {
  const now = new Date();
  const firstOfThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthEnd = new Date(firstOfThis.getTime() - 86400000);
  return lastMonthEnd.toISOString().slice(0, 10);
}

const acctInput = {
  name: z.string().min(1).max(200),
  kind: z.string().max(30).optional(),
  institution: z.string().max(120).optional(),
  last4: z.string().max(10).optional(),
  reconciledThrough: z.string().max(20).nullable().optional(),
  needsStatements: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
};

export const reconTrackerRouter = createRouter({
  list: authedQuery
    .input(z.object({ clientId: z.number(), periodEnd: z.string().optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const periodEnd = input.periodEnd || defaultPeriodEnd();
      const rows = await db.select().from(clientReconAccounts)
        .where(and(eq(clientReconAccounts.clientId, input.clientId), eq(clientReconAccounts.active, true)))
        .orderBy(asc(clientReconAccounts.sortOrder), asc(clientReconAccounts.id));
      const accounts = (rows as any[]).map((r) => accountStatus(r as ReconAccount, periodEnd));
      const rollup = summarizeRecon(rows as any[], periodEnd);
      return { periodEnd, accounts, rollup };
    }),

  upsert: authedQuery
    .input(z.object({ id: z.number().optional(), clientId: z.number(), ...acctInput }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, clientId, ...rest } = input;
      const values: any = { ...rest, updatedAt: new Date() };
      if (id) { await db.update(clientReconAccounts).set(values).where(eq(clientReconAccounts.id, id)); return { id }; }
      const [row] = await db.insert(clientReconAccounts).values({ clientId, ...values }).returning();
      return row;
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(clientReconAccounts).where(eq(clientReconAccounts.id, input.id));
      return { success: true };
    }),

  // Paste the status block Markie gets from Rachel → parsed rows. By default
  // REPLACES the client's accounts (a fresh status); set merge to keep + update by name.
  importPaste: authedQuery
    .input(z.object({ clientId: z.number(), text: z.string().min(1), replace: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const parsed = parseReconPaste(input.text).filter((a) => a.name && (a.reconciledThrough || a.needsStatements || a.note));
      if (!parsed.length) return { ok: false as const, imported: 0, error: "No account lines recognized in that paste." };

      if (input.replace) {
        await db.delete(clientReconAccounts).where(eq(clientReconAccounts.clientId, input.clientId));
      }
      const existing = input.replace ? [] : await db.select().from(clientReconAccounts).where(eq(clientReconAccounts.clientId, input.clientId));
      const byName = new Map((existing as any[]).map((r) => [r.name.toLowerCase(), r]));
      let imported = 0, order = 0;
      for (const a of parsed) {
        const hit = byName.get(a.name.toLowerCase());
        const values: any = {
          kind: a.kind || "bank", reconciledThrough: a.reconciledThrough ?? null,
          needsStatements: a.needsStatements ?? null, note: a.note ?? null,
          source: "manual", sortOrder: order++, active: true, updatedAt: new Date(),
        };
        if (hit) await db.update(clientReconAccounts).set(values).where(eq(clientReconAccounts.id, hit.id));
        else await db.insert(clientReconAccounts).values({ clientId: input.clientId, name: a.name, ...values });
        imported++;
      }
      return { ok: true as const, imported };
    }),
});
