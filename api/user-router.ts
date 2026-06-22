import { z } from "zod";
import { createRouter, adminQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "../db/schema";
import { eq, not } from "drizzle-orm";
import { getClientAccessGrants, setClientAccessGrants } from "./rbac";

export const userRouter = createRouter({
  list: staffQuery.query(async () => {
    const db = getDb();
    return db.select().from(users).where(not(eq(users.role, "client"))).orderBy(users.createdAt);
  }),

  // Which clients a (restricted) user is granted access to. Admin-only — this is
  // access-control config.
  clientAccess: adminQuery
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return { clientIds: await getClientAccessGrants(input.userId) };
    }),

  // Replace a user's full client-access grant list.
  setClientAccess: adminQuery
    .input(z.object({ userId: z.number(), clientIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await setClientAccessGrants(input.userId, input.clientIds);
      return { success: true };
    }),

  // Toggle whether a user is restricted to their granted clients (default off =
  // sees all). Turning it on without grants means they see nothing until granted.
  setRestricted: adminQuery
    .input(z.object({ userId: z.number(), restricted: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users).set({ restrictedToClients: input.restricted, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { success: true };
    }),

  // Activate / deactivate a user account (deactivated users can't sign in).
  setActive: adminQuery
    .input(z.object({ userId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { success: true };
    }),

  updateRole: adminQuery
    .input(z.object({
      id: z.number(),
      role: z.enum(["admin", "senior_bookkeeper", "junior_bookkeeper", "client"]),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.id));
      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),

  me: staffQuery.query((opts) => {
    const { ctx } = opts;
    return ctx.user;
  }),
});
