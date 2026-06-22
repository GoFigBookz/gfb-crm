/**
 * Per-client vendors + customers (CRM-side scaffolding). Manual add/edit now,
 * ready for QBO sync later (qboId). One table, discriminated by `kind`. Staff
 * manage these for any client (shared-practice model, same as contacts).
 *
 * Surfacing is gated in the UI by the intake's responsibilities:
 *   - vendors shown only when billPayResponsibility is we_pay/both
 *   - customers shown only when invoicingResponsibility is we_invoice/both
 * The router itself is kind-agnostic; the dashboard decides what to show.
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientParties } from "../db/schema";
import { and, eq, sql, desc } from "drizzle-orm";

async function ensureTable() {
  try {
    await getDb().run(sql`CREATE TABLE IF NOT EXISTS client_parties (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      kind text NOT NULL,
      name text NOT NULL,
      contactName text, email text, phone text,
      accountNumber text, notes text, qboId text,
      active integer DEFAULT 1,
      createdAt integer, updatedAt integer
    )`);
  } catch (e) { console.error("[parties] ensure table failed:", e instanceof Error ? e.message : e); }
}

const partyInput = {
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(60).optional(),
  accountNumber: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
};

export const partiesRouter = createRouter({
  list: authedQuery
    .input(z.object({ clientId: z.number(), kind: z.enum(["vendor", "customer"]) }))
    .query(async ({ input }) => {
      await ensureTable();
      return getDb().select().from(clientParties)
        .where(and(eq(clientParties.clientId, input.clientId), eq(clientParties.kind, input.kind)))
        .orderBy(desc(clientParties.active), desc(clientParties.updatedAt));
    }),

  create: authedQuery
    .input(z.object({ clientId: z.number(), kind: z.enum(["vendor", "customer"]), ...partyInput }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const { clientId, kind, ...rest } = input;
      const [row] = await getDb().insert(clientParties)
        .values({ clientId, kind, ...rest, email: rest.email || null, active: true, updatedAt: new Date() })
        .returning();
      return row;
    }),

  update: authedQuery
    .input(z.object({ id: z.number(), active: z.boolean().optional(), ...partyInput }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const { id, ...rest } = input;
      await getDb().update(clientParties)
        .set({ ...rest, email: rest.email || null, updatedAt: new Date() })
        .where(eq(clientParties.id, id));
      return { success: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(clientParties).where(eq(clientParties.id, input.id));
      return { success: true };
    }),

  /** Vendor mass-email helper — returns the active vendor emails for a client so
   *  the UI can compose a statement/missing-invoice request. (Send wiring is a
   *  later backlog item; this exposes the recipient list driven by intake.) */
  vendorEmails: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      await ensureTable();
      const rows = await getDb().select().from(clientParties)
        .where(and(eq(clientParties.clientId, input.clientId), eq(clientParties.kind, "vendor"), eq(clientParties.active, true)));
      return (rows as any[]).map((r) => r.email).filter(Boolean);
    }),
});
