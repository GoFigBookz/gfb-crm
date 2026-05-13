import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { invoices, invoiceItems } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const invoiceRouter = createRouter({
  // List invoices
  list: authedQuery
    .input(z.object({
      clientId: z.number().optional(),
      status: z.enum(["draft", "sent", "paid", "overdue", "all"]).optional().default("all"),
      limit: z.number().min(1).max(100).optional().default(50),
      offset: z.number().min(0).optional().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const conditions = [eq(invoices.userId, userId)];
      if (input?.clientId) conditions.push(eq(invoices.clientId, input.clientId));
      if (input?.status && input.status !== "all") conditions.push(eq(invoices.status, input.status));

      return db
        .select()
        .from(invoices)
        .where(and(...conditions))
        .orderBy(desc(invoices.issueDate))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
    }),

  // Get single invoice with items
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const invoiceResult = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)))
        .limit(1);

      if (!invoiceResult[0]) return null;

      const items = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id));

      return { ...invoiceResult[0], items };
    }),

  // Create invoice
  create: authedQuery
    .input(z.object({
      clientId: z.number(),
      invoiceNumber: z.string().min(1).max(100),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
      status: z.enum(["draft", "sent", "paid"]).optional().default("draft"),
      issueDate: z.date(),
      dueDate: z.date(),
      description: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.string().regex(/^\d+(\.\d{1,2})?$/),
        rate: z.string().regex(/^\d+(\.\d{1,2})?$/),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { items, ...invoiceData } = input;

      const [invoice] = await db.insert(invoices).values({
        ...invoiceData,
        userId: ctx.user.id,
      });

      // Insert items if provided
      if (items && items.length > 0) {
        await db.insert(invoiceItems).values(
          items.map(item => ({
            ...item,
            invoiceId: invoice.insertId,
          }))
        );
      }

      return invoice;
    }),

  // Update invoice
  update: authedQuery
    .input(z.object({
      id: z.number(),
      invoiceNumber: z.string().max(100).optional(),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      status: z.enum(["draft", "sent", "paid", "overdue"]).optional(),
      issueDate: z.date().optional(),
      dueDate: z.date().optional(),
      paidDate: z.date().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(invoices)
        .set(updates)
        .where(and(eq(invoices.id, id), eq(invoices.userId, ctx.user.id)));

      return { success: true };
    }),

  // Mark as paid
  markPaid: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(invoices)
        .set({ status: "paid", paidDate: new Date() })
        .where(and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete invoice
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Delete items first
      await db
        .delete(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id));

      await db
        .delete(invoices)
        .where(and(eq(invoices.id, input.id), eq(invoices.userId, ctx.user.id)));

      return { success: true };
    }),

  // Get invoice stats
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    const allInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId));

    const totalRevenue = allInvoices
      .filter(i => i.status === "paid")
      .reduce((sum, i) => sum + parseFloat(i.amount), 0);

    const outstanding = allInvoices
      .filter(i => i.status === "sent" || i.status === "overdue")
      .reduce((sum, i) => sum + parseFloat(i.amount), 0);

    return {
      total: allInvoices.length,
      draft: allInvoices.filter(i => i.status === "draft").length,
      sent: allInvoices.filter(i => i.status === "sent").length,
      paid: allInvoices.filter(i => i.status === "paid").length,
      overdue: allInvoices.filter(i => i.status === "overdue").length,
      totalRevenue,
      outstanding,
    };
  }),
});
