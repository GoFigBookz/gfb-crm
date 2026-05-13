import { z } from "zod";
import { createRouter, authedQuery, staffQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { portalTokens, portalSettings, missingItems, clients, tasks, clientDashboardSnapshots, clientTaskRules, portalFiles, signatureDocuments } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { syncInsert, syncUpdate } from "./sync-hooks";

export const portalRouter = createRouter({
  // Staff: Create a portal access token for a client
  createToken: staffQuery
    .input(z.object({
      clientId: z.number(),
      email: z.string().email(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const token = crypto.randomBytes(32).toString("hex");

      // Deactivate old tokens for this client
      await db.update(portalTokens)
        .set({ isActive: false })
        .where(eq(portalTokens.clientId, input.clientId));

      // Create new token
      const [pt] = await db.insert(portalTokens).values({
        clientId: input.clientId,
        token,
        email: input.email,
        isActive: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      }).returning();
      if (pt) syncInsert("portal_tokens", pt);

      // Enable portal if not already
      const existing = await db.select().from(portalSettings)
        .where(eq(portalSettings.clientId, input.clientId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(portalSettings).values({
          clientId: input.clientId,
          isEnabled: true,
          showFinancialOverview: true,
          showTasks: true,
          showDocuments: true,
          showInvoices: true,
          welcomeMessage: "Welcome to your Go Fig Bookz client portal. Here you can view your financial overview, upload documents, and see any items we need from you.",
        });
      } else if (!existing[0].isEnabled) {
        await db.update(portalSettings)
          .set({ isEnabled: true })
          .where(eq(portalSettings.clientId, input.clientId));
      }

      return { token, url: `/portal/${token}` };
    }),

  // Staff: Get or create portal settings for a client
  getSettings: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db.select().from(portalSettings)
        .where(eq(portalSettings.clientId, input.clientId))
        .limit(1);

      if (rows.length === 0) {
        const [settings] = await db.insert(portalSettings).values({
          clientId: input.clientId,
          isEnabled: false,
          showFinancialOverview: true,
          showTasks: true,
          showDocuments: true,
          showInvoices: true,
        }).returning();
        return settings;
      }
      return rows[0];
    }),

  // Staff: Update portal settings
  updateSettings: staffQuery
    .input(z.object({
      clientId: z.number(),
      isEnabled: z.boolean().optional(),
      showFinancialOverview: z.boolean().optional(),
      showTasks: z.boolean().optional(),
      showDocuments: z.boolean().optional(),
      showInvoices: z.boolean().optional(),
      showTaxDeadlines: z.boolean().optional(),
      welcomeMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId, ...updates } = input;
      await db.update(portalSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(portalSettings.clientId, clientId));
      return { success: true };
    }),

  // Staff: Create a missing item and optionally auto-send email
  createMissingItem: staffQuery
    .input(z.object({
      clientId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.enum(["bank_statement", "receipt", "invoice", "tax_form", "payroll_doc", "other"]).default("other"),
      dueDate: z.date().optional(),
      sendEmail: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId, sendEmail, ...data } = input;

      const [item] = await db.insert(missingItems).values({
        clientId,
        userId: ctx.user.id,
        ...data,
      }).returning();
      if (item) syncInsert("missing_items", item);

      // Mark as emailed if sendEmail was requested
      if (sendEmail) {
        await db.update(missingItems)
          .set({ emailSentAt: new Date(), emailSentCount: 1 })
          .where(eq(missingItems.id, item.id));
      }

      return { ...item, emailSentAt: sendEmail ? new Date() : null, emailSentCount: sendEmail ? 1 : 0 };
    }),

  // Staff: List missing items for a client
  listMissingItems: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db.select().from(missingItems)
        .where(eq(missingItems.clientId, input.clientId))
        .orderBy(desc(missingItems.createdAt));
    }),

  // Staff: Mark missing item as reviewed/approved
  reviewMissingItem: staffQuery
    .input(z.object({ id: z.number(), status: z.enum(["approved", "overdue"]), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(missingItems)
        .set({ status: input.status, notes: input.notes || null, reviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(missingItems.id, input.id));
      return { success: true };
    }),

  // Staff: Add a file to the client's portal
  addPortalFile: staffQuery
    .input(z.object({
      clientId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
      provider: z.enum(["google_drive", "one_drive", "local", "link"]),
      providerFileId: z.string().optional(),
      webViewLink: z.string().optional(),
      downloadLink: z.string().optional(),
      mimeType: z.string().optional(),
      size: z.number().optional(),
      category: z.enum(["financial_statement", "report", "tax_document", "receipt", "general", "engagement_letter"]).default("general"),
      periodStart: z.date().optional(),
      periodEnd: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { clientId, ...data } = input;
      const [file] = await db.insert(portalFiles).values({
        clientId,
        userId: ctx.user.id,
        ...data,
      }).returning();
      if (file) syncInsert("portal_files", file);
      return file;
    }),

  // Staff: List portal files for a client
  listPortalFiles: staffQuery
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(portalFiles)
        .where(eq(portalFiles.clientId, input.clientId))
        .orderBy(desc(portalFiles.createdAt));
    }),

  // Staff: Delete a portal file
  deletePortalFile: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(portalFiles).where(eq(portalFiles.id, input.id));
      return { success: true };
    }),

  // Staff: Toggle file visibility
  togglePortalFileVisibility: staffQuery
    .input(z.object({ id: z.number(), isVisible: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(portalFiles)
        .set({ isVisible: input.isVisible, updatedAt: new Date() })
        .where(eq(portalFiles.id, input.id));
      return { success: true };
    }),

  // Staff: Get email template for missing item notification
  getMissingItemEmailTemplate: staffQuery
    .input(z.object({
      clientId: z.number(),
      itemId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const clientRows = await db.select().from(clients)
        .where(eq(clients.id, input.clientId)).limit(1);
      const client = clientRows[0];
      if (!client) return null;

      // Get portal token
      const tokenRows = await db.select().from(portalTokens)
        .where(and(eq(portalTokens.clientId, input.clientId), eq(portalTokens.isActive, true)))
        .limit(1);

      let portalUrl = "";
      if (tokenRows[0]) {
        portalUrl = `/portal/${tokenRows[0].token}`;
      }

      let itemTitle = "some documents";
      if (input.itemId) {
        const itemRows = await db.select().from(missingItems)
          .where(eq(missingItems.id, input.itemId)).limit(1);
        if (itemRows[0]) itemTitle = itemRows[0].title;
      }

      const subject = `Action needed: ${itemTitle} — Go Fig Bookz`;
      const body = `Hi ${client.name},

I hope you're doing well! I wanted to reach out because I haven't received ${itemTitle} yet, and I need these to close your books for the period.

To make it easy, you can upload everything directly through your secure client portal — just click the link below and drag and drop your files:

${portalUrl ? `Your portal: ${portalUrl}` : "(Portal link not yet generated — please contact us)"}

If you have any questions or need help, just reply to this email.

Thanks so much!

— Go Fig Bookz`;

      return { subject, body, portalUrl, clientEmail: client.email };
    }),

  // ========== PUBLIC PORTAL ENDPOINTS ==========

  // Public: Validate portal token and return client info
  validateToken: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(portalTokens)
        .where(and(eq(portalTokens.token, input.token), eq(portalTokens.isActive, true)))
        .limit(1);

      if (!rows[0]) return null;

      // Check expiry
      if (rows[0].expiresAt && new Date(rows[0].expiresAt) < new Date()) {
        return null;
      }

      // Update last used
      await db.update(portalTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(portalTokens.id, rows[0].id));

      // Get client
      const clientRows = await db.select().from(clients)
        .where(eq(clients.id, rows[0].clientId))
        .limit(1);

      // Get portal settings
      const settingsRows = await db.select().from(portalSettings)
        .where(eq(portalSettings.clientId, rows[0].clientId))
        .limit(1);

      return {
        client: clientRows[0] || null,
        settings: settingsRows[0] || null,
        email: rows[0].email,
      };
    }),

  // Public: Get client's dashboard data (tasks, snapshots, missing items)
  getClientData: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();

      // Validate token
      const tokenRows = await db.select().from(portalTokens)
        .where(and(eq(portalTokens.token, input.token), eq(portalTokens.isActive, true)))
        .limit(1);

      if (!tokenRows[0]) return null;

      const clientId = tokenRows[0].clientId;

      // Get settings
      const settingsRows = await db.select().from(portalSettings)
        .where(eq(portalSettings.clientId, clientId))
        .limit(1);
      const settings = settingsRows[0];

      // Get client tasks
      const clientTasks = await db.select().from(tasks)
        .where(eq(tasks.clientId, clientId))
        .orderBy(desc(tasks.dueDate))
        .limit(20);

      // Get financial snapshot
      const snapshots = await db.select().from(clientDashboardSnapshots)
        .where(eq(clientDashboardSnapshots.clientId, clientId))
        .orderBy(desc(clientDashboardSnapshots.createdAt))
        .limit(1);

      // Get missing items
      const items = await db.select().from(missingItems)
        .where(eq(missingItems.clientId, clientId))
        .orderBy(desc(missingItems.createdAt));

      // Get task rules
      const rules = await db.select().from(clientTaskRules)
        .where(and(eq(clientTaskRules.clientId, clientId), eq(clientTaskRules.active, true)))
        .orderBy(clientTaskRules.category);

      // Get shared portal files
      const sharedFiles = await db.select().from(portalFiles)
        .where(and(eq(portalFiles.clientId, clientId), eq(portalFiles.isVisible, true)))
        .orderBy(desc(portalFiles.createdAt));

      // Get signature documents sent to client
      const sigDocs = await db.select().from(signatureDocuments)
        .where(eq(signatureDocuments.clientId, clientId))
        .orderBy(desc(signatureDocuments.createdAt));

      return {
        settings,
        tasks: clientTasks,
        snapshot: snapshots[0] || null,
        missingItems: items,
        taskRules: rules,
        sharedFiles,
        signatureDocuments: sigDocs,
      };
    }),

  // Public: Get shared files only
  getSharedFiles: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      const tokenRows = await db.select().from(portalTokens)
        .where(and(eq(portalTokens.token, input.token), eq(portalTokens.isActive, true)))
        .limit(1);
      if (!tokenRows[0]) return [];

      return db.select().from(portalFiles)
        .where(and(eq(portalFiles.clientId, tokenRows[0].clientId), eq(portalFiles.isVisible, true)))
        .orderBy(desc(portalFiles.createdAt));
    }),

  // Public: Submit a missing item (mark as submitted)
  submitMissingItem: publicQuery
    .input(z.object({
      itemId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(missingItems)
        .set({ status: "submitted", submittedAt: new Date(), notes: input.notes || null, updatedAt: new Date() })
        .where(eq(missingItems.id, input.itemId));
      return { success: true };
    }),
});