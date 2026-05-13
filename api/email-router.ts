import { z } from "zod";
import { createRouter, authedQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { emails, connectedAccounts, clientEmails } from "../db/schema";
import { eq, and, desc, inArray, isNull, ne, like } from "drizzle-orm";
import { randomUUID } from "crypto";

export const emailRouter = createRouter({
  // List emails (inbox or sent)
  list: authedQuery
    .input(z.object({
      folder: z.enum(["inbox", "sent", "drafts", "starred", "trash", "all"]).default("all"),
      search: z.string().optional(),
      clientId: z.number().optional(),
      connectedAccountId: z.number().optional(),
      threadId: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const conditions = [eq(emails.userId, ctx.user.id)];

      if (input.folder === "inbox") {
        conditions.push(eq(emails.isSent, false));
        conditions.push(isNull(emails.inReplyTo));
      } else if (input.folder === "sent") {
        conditions.push(eq(emails.isSent, true));
      } else if (input.folder === "starred") {
        conditions.push(eq(emails.isStarred, true));
      }

      if (input.clientId) conditions.push(eq(emails.clientId, input.clientId));
      if (input.connectedAccountId) conditions.push(eq(emails.connectedAccountId, input.connectedAccountId));
      if (input.threadId) conditions.push(eq(emails.threadId, input.threadId));
      if (input.search) {
        const s = `%${input.search}%`;
        conditions.push(
          like(emails.subject, s),
        );
      }

      const rows = await db
        .select()
        .from(emails)
        .where(and(...conditions))
        .orderBy(desc(emails.receivedAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  // Get single email
  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(emails)
        .where(and(eq(emails.id, input.id), eq(emails.userId, ctx.user.id)))
        .limit(1);
      return rows[0] || null;
    }),

  // Get thread messages
  getThread: authedQuery
    .input(z.object({ threadId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(emails)
        .where(and(eq(emails.userId, ctx.user.id), eq(emails.threadId, input.threadId)))
        .orderBy(emails.receivedAt);
    }),

  // Mark as read/unread
  markRead: authedQuery
    .input(z.object({ id: z.number(), isRead: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(emails)
        .set({ isRead: input.isRead })
        .where(and(eq(emails.id, input.id), eq(emails.userId, ctx.user.id)));
      return { success: true };
    }),

  // Toggle star
  toggleStar: authedQuery
    .input(z.object({ id: z.number(), isStarred: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(emails)
        .set({ isStarred: input.isStarred })
        .where(and(eq(emails.id, input.id), eq(emails.userId, ctx.user.id)));
      return { success: true };
    }),

  // Send email
  send: authedQuery
    .input(z.object({
      connectedAccountId: z.number(),
      clientId: z.number().optional(),
      to: z.string().email(),
      cc: z.string().optional(),
      subject: z.string().min(1),
      body: z.string().min(1),
      threadId: z.string().optional(),
      inReplyTo: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Get the connected account for "from" address
      const acctRows = await db
        .select()
        .from(connectedAccounts)
        .where(and(eq(connectedAccounts.id, input.connectedAccountId), eq(connectedAccounts.userId, ctx.user.id)))
        .limit(1);

      if (!acctRows[0]) {
        throw new Error("Connected account not found");
      }

      const account = acctRows[0];

      // Update client's lastContactedAt if clientId provided
      if (input.clientId) {
        await db.update(clients)
          .set({ lastContactedAt: new Date() })
          .where(eq(clients.id, input.clientId));
      }

      const threadId = input.threadId || randomUUID();

      // For demo: store in DB without actually sending
      // In production, this would use nodemailer or provider API
      const [email] = await db.insert(emails).values({
        userId: ctx.user.id,
        connectedAccountId: input.connectedAccountId,
        clientId: input.clientId || null,
        threadId,
        fromAddress: account.accountEmail,
        fromName: ctx.user.name || account.accountEmail,
        toAddresses: input.to,
        ccAddresses: input.cc || null,
        subject: input.subject,
        body: input.body,
        bodyPlain: input.body.replace(/<[^>]*>/g, ""),
        isRead: true,
        isSent: true,
        inReplyTo: input.inReplyTo || null,
        receivedAt: new Date(),
        sentAt: new Date(),
      }).returning();

      return { success: true, email };
    }),

  // Reply to email
  reply: authedQuery
    .input(z.object({
      emailId: z.number(),
      body: z.string().min(1),
      cc: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Get the original email
      const origRows = await db
        .select()
        .from(emails)
        .where(and(eq(emails.id, input.emailId), eq(emails.userId, ctx.user.id)))
        .limit(1);

      if (!origRows[0]) {
        throw new Error("Original email not found");
      }

      const original = origRows[0];

      // Get the connected account that received this (to use as "from")
      const acctRows = await db
        .select()
        .from(connectedAccounts)
        .where(and(eq(connectedAccounts.id, original.connectedAccountId), eq(connectedAccounts.userId, ctx.user.id)))
        .limit(1);

      if (!acctRows[0]) {
        throw new Error("Connected account not found");
      }

      const account = acctRows[0];

      // The reply goes TO the original sender
      const replyTo = original.fromAddress;
      const subject = original.subject.startsWith("Re: ")
        ? original.subject
        : `Re: ${original.subject}`;

      const [email] = await db.insert(emails).values({
        userId: ctx.user.id,
        connectedAccountId: original.connectedAccountId,
        clientId: original.clientId,
        threadId: original.threadId,
        fromAddress: account.accountEmail,
        fromName: ctx.user.name || account.accountEmail,
        replyTo,
        toAddresses: replyTo,
        ccAddresses: input.cc || original.ccAddresses || null,
        subject,
        body: input.body,
        bodyPlain: input.body.replace(/<[^>]*>/g, ""),
        isRead: true,
        isSent: true,
        inReplyTo: original.id,
        receivedAt: new Date(),
        sentAt: new Date(),
      }).returning();

      return { success: true, email };
    }),

  // Get email stats
  stats: authedQuery
    .query(async ({ ctx }) => {
      const db = getDb();
      const allEmails = await db
        .select()
        .from(emails)
        .where(eq(emails.userId, ctx.user.id));
      const unread = allEmails.filter((e) => !e.isRead && !e.isSent).length;
      const sent = allEmails.filter((e) => e.isSent).length;
      const starred = allEmails.filter((e) => e.isStarred).length;
      return { total: allEmails.length, unread, sent, starred };
    }),

  // ========== CLIENT EMAILS ==========
  getClientEmails: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(clientEmails)
        .where(eq(clientEmails.clientId, input.clientId))
        .orderBy(desc(clientEmails.isDefault));
    }),

  addClientEmail: staffQuery
    .input(z.object({
      clientId: z.number(),
      email: z.string().email(),
      label: z.enum(["primary", "billing", "payroll", "general", "other"]).default("general"),
      isDefault: z.boolean().default(false),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId, ...data } = input;

      // If setting as default, clear other defaults first
      if (data.isDefault) {
        await db
          .update(clientEmails)
          .set({ isDefault: false })
          .where(eq(clientEmails.clientId, clientId));
      }

      const [ce] = await db.insert(clientEmails).values({
        clientId,
        ...data,
      }).returning();

      return ce;
    }),

  updateClientEmail: staffQuery
    .input(z.object({
      id: z.number(),
      email: z.string().email().optional(),
      label: z.enum(["primary", "billing", "payroll", "general", "other"]).optional(),
      isDefault: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...data } = input;

      // Get the email to find its client
      const rows = await db.select().from(clientEmails).where(eq(clientEmails.id, id)).limit(1);
      if (!rows[0]) throw new Error("Client email not found");

      // If setting as default, clear other defaults
      if (data.isDefault) {
        await db
          .update(clientEmails)
          .set({ isDefault: false })
          .where(eq(clientEmails.clientId, rows[0].clientId));
      }

      await db
        .update(clientEmails)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(clientEmails.id, id));

      return { success: true };
    }),

  deleteClientEmail: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.delete(clientEmails).where(eq(clientEmails.id, input.id));
      return { success: true };
    }),
});
