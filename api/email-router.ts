import { z } from "zod";
import { createRouter, authedQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { emails, connectedAccounts, clientEmails, senderRules, clients } from "../db/schema";
import { eq, and, desc, inArray, isNull, ne, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { buildRawMessage, extractEmail, replyDraftSystem, taskSuggestSystem } from "./email-core";
import { getValidGoogleAccessToken } from "./google-token";
import { tasks as tasksTable } from "../db/schema";

/** One-shot Claude text call (used by Liv's email intelligence). Returns "" on any failure. */
async function callClaude(system: string, userText: string, maxTokens = 700): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Email AI needs ANTHROPIC_API_KEY set on the server.");
  const model = process.env.FIGGY_ASSISTANT_MODEL || "claude-haiku-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: userText }] }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${JSON.stringify(data).slice(0, 160)}`);
  return (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n").trim();
}

/** Actually send a message through the connected provider. Returns the provider's
 *  thread/message ids so the stored row threads correctly. Throws on failure so a
 *  failed send never looks successful. */
async function providerSend(
  account: typeof connectedAccounts.$inferSelect,
  msg: { to: string; cc?: string | null; subject: string; html: string; fromName?: string; threadId?: string | null },
): Promise<{ gmailMessageId?: string; threadId?: string }> {
  if (account.provider === "google") {
    const token = await getValidGoogleAccessToken(account);
    const raw = buildRawMessage({
      fromName: msg.fromName, fromEmail: account.accountEmail || "", to: msg.to,
      cc: msg.cc, subject: msg.subject, html: msg.html,
    });
    const body: any = { raw };
    if (msg.threadId) body.threadId = msg.threadId;
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) throw new Error(`Gmail send failed (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
    return { gmailMessageId: data.id, threadId: data.threadId };
  }
  // Microsoft (Graph) send is not wired yet — be honest rather than fake-send.
  throw new Error("Sending is wired for Google accounts right now. (Microsoft/Outlook send is coming next.)");
}

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

  // Send email using sender rules (auto-selects from address based on client)
  sendWithRule: authedQuery
    .input(z.object({
      clientId: z.number(),
      to: z.string().email(),
      cc: z.string().optional(),
      subject: z.string().min(1),
      body: z.string().min(1),
      threadId: z.string().optional(),
      inReplyTo: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Get sender rule for this client
      const clientRows = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!clientRows[0]) throw new Error("Client not found");

      // Find matching sender rule
      const allRules = await db
        .select()
        .from(senderRules)
        .where(eq(senderRules.isActive, true))
        .orderBy(desc(senderRules.priority));

      let matchedRule: typeof senderRules.$inferSelect | null = null;
      for (const rule of allRules) {
        if (rule.clientId === input.clientId) { matchedRule = rule; break; }
        if (rule.clientEmailDomain && clientRows[0].email?.toLowerCase().includes(rule.clientEmailDomain.toLowerCase())) { matchedRule = rule; break; }
        if (rule.clientNamePattern && clientRows[0].name?.toLowerCase().includes(rule.clientNamePattern.toLowerCase())) { matchedRule = rule; break; }
        if (!rule.clientId && !rule.clientEmailDomain && !rule.clientNamePattern) { matchedRule = rule; break; }
      }

      const fromAddress = matchedRule?.fromAddress || "markie@gofig.ca";
      const fromName = matchedRule?.fromName || "Go Fig Bookz";
      const replyTo = matchedRule?.replyTo || null;

      // Update client's lastContactedAt
      await db.update(clients)
        .set({ lastContactedAt: new Date() })
        .where(eq(clients.id, input.clientId));

      const threadId = input.threadId || randomUUID();

      const [email] = await db.insert(emails).values({
        userId: ctx.user.id,
        connectedAccountId: 0, // Not tied to a connected account — uses sender rule
        clientId: input.clientId,
        threadId,
        fromAddress,
        fromName,
        replyTo,
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

      return { success: true, email, matchedRule };
    }),

  // Send email (legacy — uses connected account)
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
        .where(eq(connectedAccounts.id, input.connectedAccountId)) // firm-wide Google/MS login
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

      // Actually send it through the provider FIRST — only record it if it sent.
      const sent = await providerSend(account, {
        to: input.to, cc: input.cc, subject: input.subject, html: input.body,
        fromName: ctx.user.name || account.accountEmail || undefined,
        threadId: input.threadId,
      });
      const threadId = sent.threadId || input.threadId || randomUUID();

      const [email] = await db.insert(emails).values({
        userId: ctx.user.id,
        connectedAccountId: input.connectedAccountId,
        clientId: input.clientId || null,
        gmailMessageId: sent.gmailMessageId || null,
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
        .where(eq(connectedAccounts.id, original.connectedAccountId)) // firm-wide Google/MS login
        .limit(1);

      if (!acctRows[0]) {
        throw new Error("Connected account not found");
      }

      const account = acctRows[0];

      // The reply goes TO the original sender
      const replyToAddr = extractEmail(original.replyTo || original.fromAddress) || original.fromAddress;
      const subject = (original.subject || "").startsWith("Re: ")
        ? original.subject
        : `Re: ${original.subject || ""}`;

      // Send for real, threaded to the original conversation, FROM the account that
      // received it (so John's-company mail replies from finance@adbank.network).
      const sent = await providerSend(account, {
        to: replyToAddr, cc: input.cc || original.ccAddresses, subject,
        html: input.body, fromName: ctx.user.name || account.accountEmail || undefined,
        threadId: original.threadId,
      });

      const [email] = await db.insert(emails).values({
        userId: ctx.user.id,
        connectedAccountId: original.connectedAccountId,
        clientId: original.clientId,
        gmailMessageId: sent.gmailMessageId || null,
        threadId: sent.threadId || original.threadId,
        fromAddress: account.accountEmail,
        fromName: ctx.user.name || account.accountEmail,
        replyTo: replyToAddr,
        toAddresses: replyToAddr,
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

  // Liv: draft a reply in Markie's tone (learned from his own recent sent emails).
  // Returns a DRAFT only — Markie reviews/edits, then sends via `reply`.
  draftReply: authedQuery
    .input(z.object({ emailId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const orig = (await db.select().from(emails).where(and(eq(emails.id, input.emailId), eq(emails.userId, ctx.user.id))).limit(1))[0];
      if (!orig) throw new Error("Email not found");
      // Style samples = Markie's own recent sent emails.
      const sent = await db.select().from(emails)
        .where(and(eq(emails.userId, ctx.user.id), eq(emails.isSent, true)))
        .orderBy(desc(emails.sentAt)).limit(5);
      const samples = (sent as any[]).map((e) => e.bodyPlain || (e.body || "").replace(/<[^>]*>/g, " ")).filter(Boolean);
      const userText = `Client email to reply to:\nFrom: ${orig.fromName || orig.fromAddress}\nSubject: ${orig.subject || ""}\n\n${orig.bodyPlain || (orig.body || "").replace(/<[^>]*>/g, " ")}`;
      const draft = await callClaude(replyDraftSystem(samples), userText, 800);
      return { draft };
    }),

  // Liv: suggest a task from an inbound client email (optionally create it).
  suggestTask: authedQuery
    .input(z.object({ emailId: z.number(), create: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const e = (await db.select().from(emails).where(and(eq(emails.id, input.emailId), eq(emails.userId, ctx.user.id))).limit(1))[0];
      if (!e) throw new Error("Email not found");
      const userText = `From: ${e.fromName || e.fromAddress}\nSubject: ${e.subject || ""}\n\n${e.bodyPlain || (e.body || "").replace(/<[^>]*>/g, " ")}`;
      const raw = await callClaude(taskSuggestSystem(), userText, 200);
      let parsed: any = {};
      try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; } catch { parsed = {}; }
      const title = String(parsed.task || "").trim();
      const due = String(parsed.due || "").trim();
      if (!title) return { task: "", created: false };
      let created = false;
      if (input.create) {
        await db.insert(tasksTable).values({
          userId: ctx.user.id, clientId: e.clientId, title,
          dueDate: due ? new Date(due) : null, priority: "medium", status: "pending", completed: false,
        } as any);
        created = true;
      }
      return { task: title, due, created };
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
