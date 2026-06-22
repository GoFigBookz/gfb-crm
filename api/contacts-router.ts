/**
 * Per-client contacts — additional people inside a client company (receptionist,
 * AP clerk, etc.), independent of the primary client record. Staff manage these
 * for any client (same shared-practice model as the client list).
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { clientContacts } from "../db/schema";
import { eq, sql, desc } from "drizzle-orm";

async function ensureTable() {
  try {
    await getDb().run(sql`CREATE TABLE IF NOT EXISTS client_contacts (
      id integer PRIMARY KEY AUTOINCREMENT,
      clientId integer NOT NULL,
      name text NOT NULL,
      title text, email text, phone text,
      isPrimary integer DEFAULT 0,
      notes text,
      createdAt integer, updatedAt integer
    )`);
  } catch (e) { console.error("[contacts] ensure table failed:", e instanceof Error ? e.message : e); }
}

const contactInput = {
  name: z.string().min(1).max(200),
  title: z.string().max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(60).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
};

export const contactsRouter = createRouter({
  list: authedQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      await ensureTable();
      return getDb().select().from(clientContacts)
        .where(eq(clientContacts.clientId, input.clientId))
        .orderBy(desc(clientContacts.isPrimary), desc(clientContacts.updatedAt));
    }),

  create: authedQuery
    .input(z.object({ clientId: z.number(), ...contactInput }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const { clientId, ...rest } = input;
      const [row] = await getDb().insert(clientContacts)
        .values({ clientId, ...rest, email: rest.email || null, updatedAt: new Date() })
        .returning();
      return row;
    }),

  update: authedQuery
    .input(z.object({ id: z.number(), ...contactInput }))
    .mutation(async ({ input }) => {
      await ensureTable();
      const { id, ...rest } = input;
      await getDb().update(clientContacts)
        .set({ ...rest, email: rest.email || null, updatedAt: new Date() })
        .where(eq(clientContacts.id, id));
      return { success: true };
    }),

  remove: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(clientContacts).where(eq(clientContacts.id, input.id));
      return { success: true };
    }),
});
