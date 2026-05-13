import { z } from "zod";
import { createRouter, adminQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "../db/schema";
import { eq, not } from "drizzle-orm";

export const userRouter = createRouter({
  list: staffQuery.query(async () => {
    const db = getDb();
    return db.select().from(users).where(not(eq(users.role, "client"))).orderBy(users.createdAt);
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
