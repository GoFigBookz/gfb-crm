/**
 * BANKED HOURS ROUTER
 * =============================================================================
 * One shared banked-hours ledger per client (replaces the old Google sheet):
 *  - bookkeeper: full CRUD + per-employee balances + import from the old sheet
 *    + a read+write client share link.
 *  - client (token-gated public): view balances and log hours banked/taken; it
 *    writes into the SAME ledger so the bookkeeper sees it instantly.
 *  - payroll: a payout records a redeem entry tied to the pay run (helper export).
 * Scoped by clientId throughout (per-client isolation).
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, staffQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clients, employees, bankedHourEntries, bankedHourShareLinks } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { buildLedger, summarize, parseOpeningBalances, validateMovement, type BankedKind } from "./banked-hours-core";

/** Loose name match → employeeId, for importing old-sheet rows. */
function matchEmployee(name: string, emps: any[]): any | null {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
  const target = norm(name);
  if (!target) return null;
  for (const e of emps) {
    const full = norm(`${e.firstName} ${e.lastName}`);
    const rev = norm(`${e.lastName} ${e.firstName}`);
    if (target === full || target === rev) return e;
  }
  // fall back to a contains match on last name + first initial
  for (const e of emps) {
    const ln = norm(e.lastName);
    const fi = norm(e.firstName).charAt(0);
    if (ln && target.includes(ln) && (!fi || target.includes(fi))) return e;
  }
  return null;
}

/** Build the per-employee balance board for a client (used internally + public). */
async function clientBoard(clientId: number) {
  const db = getDb();
  const emps = (await db.select().from(employees).where(eq(employees.clientId, clientId))) as any[];
  const allEntries = (await db.select().from(bankedHourEntries).where(eq(bankedHourEntries.clientId, clientId))) as any[];
  const byEmp = new Map<number, any[]>();
  for (const e of allEntries) {
    if (!byEmp.has(e.employeeId)) byEmp.set(e.employeeId, []);
    byEmp.get(e.employeeId)!.push(e);
  }
  const rows = emps
    .filter((e) => e.isActive !== false || byEmp.has(e.id))
    .map((e) => {
      const entries = byEmp.get(e.id) ?? [];
      const s = summarize(entries.map((x) => ({ entryDate: x.entryDate, hours: x.hours, kind: x.kind })));
      return {
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`,
        balance: s.balance,
        totalBanked: s.totalBanked,
        totalTaken: s.totalTaken,
        lastActivity: s.lastActivity,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalBalance = Math.round(rows.reduce((sum, r) => sum + r.balance, 0) * 100) / 100;
  return { rows, totalBalance };
}

/** Record a banked-hours payout from payroll (a redeem entry tied to a run). */
export async function recordBankedPayout(opts: { clientId: number; employeeId: number; hours: number; payRunId: number; note?: string }): Promise<void> {
  const db = getDb();
  await db.insert(bankedHourEntries).values({
    clientId: opts.clientId, employeeId: opts.employeeId,
    entryDate: new Date(), hours: -Math.abs(opts.hours || 0), kind: "redeem",
    note: opts.note ?? "Paid out on pay run", source: "payroll", payRunId: opts.payRunId, enteredBy: "payroll",
  } as any);
}

export const bankedHoursRouter = createRouter({
  // Per-employee ledger (newest first for display; balance computed oldest→newest).
  ledger: staffQuery
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = (await db.select().from(bankedHourEntries).where(eq(bankedHourEntries.employeeId, input.employeeId))) as any[];
      const led = buildLedger(rows.map((r) => ({ ...r, entryDate: r.entryDate })));
      const s = summarize(rows.map((r) => ({ entryDate: r.entryDate, hours: r.hours, kind: r.kind })));
      return { summary: s, ledger: led.reverse() };
    }),

  // Per-client balance board.
  board: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => clientBoard(input.clientId)),

  addEntry: staffQuery
    .input(z.object({
      clientId: z.number(), employeeId: z.number(),
      entryDate: z.date().optional(),
      hours: z.number(),
      kind: z.enum(["opening", "accrue", "redeem", "adjust"]),
      note: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // redeem is always stored negative; accrue/opening positive; adjust as given.
      let hours = input.hours;
      if (input.kind === "redeem") hours = -Math.abs(input.hours);
      else if (input.kind === "accrue" || input.kind === "opening") hours = Math.abs(input.hours);
      await db.insert(bankedHourEntries).values({
        clientId: input.clientId, employeeId: input.employeeId,
        entryDate: input.entryDate ?? new Date(), hours, kind: input.kind,
        note: input.note ?? null, source: "manual", enteredBy: ctx.user.email ?? String(ctx.user.id),
      } as any);
      return { ok: true };
    }),

  updateEntry: staffQuery
    .input(z.object({
      id: z.number(),
      entryDate: z.date().optional(),
      hours: z.number().optional(),
      kind: z.enum(["opening", "accrue", "redeem", "adjust"]).optional(),
      note: z.string().max(500).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...rest } = input;
      const patch: any = { ...rest, updatedAt: new Date() };
      if (rest.hours != null && rest.kind === "redeem") patch.hours = -Math.abs(rest.hours);
      await db.update(bankedHourEntries).set(patch).where(eq(bankedHourEntries.id, id));
      return { ok: true };
    }),

  deleteEntry: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(bankedHourEntries).where(eq(bankedHourEntries.id, input.id));
      return { ok: true };
    }),

  // Import opening balances from the client's old payroll sheet (pasted text).
  importOpening: staffQuery
    .input(z.object({ clientId: z.number(), text: z.string().min(1), asOf: z.date().optional(), replaceExistingOpenings: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const parsed = parseOpeningBalances(input.text);
      const emps = (await db.select().from(employees).where(eq(employees.clientId, input.clientId))) as any[];
      const matched: { name: string; hours: number; employeeId: number }[] = [];
      const unmatched: { name: string; hours: number }[] = [];
      for (const row of parsed) {
        const e = matchEmployee(row.name, emps);
        if (e) matched.push({ ...row, employeeId: e.id }); else unmatched.push(row);
      }
      if (input.replaceExistingOpenings) {
        for (const m of matched) {
          await db.delete(bankedHourEntries).where(and(eq(bankedHourEntries.employeeId, m.employeeId), eq(bankedHourEntries.kind, "opening")));
        }
      }
      for (const m of matched) {
        await db.insert(bankedHourEntries).values({
          clientId: input.clientId, employeeId: m.employeeId,
          entryDate: input.asOf ?? new Date(), hours: m.hours, kind: "opening",
          note: "Opening balance from old payroll sheet", source: "import", enteredBy: ctx.user.email ?? String(ctx.user.id),
        } as any);
      }
      return { ok: true, imported: matched.length, matched, unmatched };
    }),

  // ===== SHARE LINKS (read+write client sheet) =====
  shareList: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(bankedHourShareLinks).where(eq(bankedHourShareLinks.clientId, input.clientId)).orderBy(desc(bankedHourShareLinks.createdAt));
    }),

  shareCreate: staffQuery
    .input(z.object({ clientId: z.number(), label: z.string().max(120).optional(), allowEdit: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const token = `bh_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.insert(bankedHourShareLinks).values({ clientId: input.clientId, token, label: input.label ?? null, allowEdit: input.allowEdit, active: true, createdBy: ctx.user.id } as any);
      return { ok: true, token };
    }),

  shareRevoke: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(bankedHourShareLinks).set({ active: false, revokedAt: new Date() }).where(eq(bankedHourShareLinks.id, input.id));
      return { ok: true };
    }),

  // ===== PUBLIC (token-gated client sheet) =====
  publicView: publicQuery
    .input(z.object({ token: z.string().min(6) }))
    .query(async ({ input }) => {
      const db = getDb();
      const link = (await db.select().from(bankedHourShareLinks).where(eq(bankedHourShareLinks.token, input.token)).limit(1))[0] as any;
      if (!link || !link.active) return null;
      const client = (await db.select().from(clients).where(eq(clients.id, link.clientId)).limit(1))[0] as any;
      const board = await clientBoard(link.clientId);
      return { clientName: client?.name ?? "Your team", label: link.label ?? null, allowEdit: !!link.allowEdit, generatedAt: new Date().toISOString(), ...board };
    }),

  publicAdd: publicQuery
    .input(z.object({
      token: z.string().min(6),
      employeeId: z.number(),
      hours: z.number(),
      kind: z.enum(["accrue", "redeem"]),
      note: z.string().max(500).optional(),
      enteredByName: z.string().max(120).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const link = (await db.select().from(bankedHourShareLinks).where(eq(bankedHourShareLinks.token, input.token)).limit(1))[0] as any;
      if (!link || !link.active) throw new Error("This link is not valid.");
      if (!link.allowEdit) throw new Error("This link is view-only.");
      // ensure the employee belongs to this client (isolation)
      const emp = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0] as any;
      if (!emp || emp.clientId !== link.clientId) throw new Error("Employee not found.");
      const hours = input.kind === "redeem" ? -Math.abs(input.hours) : Math.abs(input.hours);
      await db.insert(bankedHourEntries).values({
        clientId: link.clientId, employeeId: input.employeeId,
        entryDate: new Date(), hours, kind: input.kind,
        note: input.note ?? null, source: "client", enteredBy: input.enteredByName ? `client:${input.enteredByName}` : "client",
      } as any);
      return { ok: true };
    }),
});

export { validateMovement };
export type { BankedKind };
