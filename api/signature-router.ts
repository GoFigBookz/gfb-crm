import { z } from "zod";
import { createRouter, staffQuery, seniorQuery, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { signatureDocuments, clients, portalTokens, portalSettings } from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import crypto from "crypto";
import { syncInsert, syncUpdate } from "./sync-hooks";

export const signatureRouter = createRouter({
  // List signature documents for a client or all
  list: staffQuery
    .input(z.object({ clientId: z.number().optional(), status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [];
      if (input?.clientId) conditions.push(eq(signatureDocuments.clientId, input.clientId));
      if (input?.status) conditions.push(eq(signatureDocuments.status, input.status as "draft" | "sent" | "viewed" | "signed" | "expired" | "cancelled"));

      if (conditions.length > 0) {
        return db.select().from(signatureDocuments)
          .where(and(...conditions))
          .orderBy(desc(signatureDocuments.createdAt));
      }
      return db.select().from(signatureDocuments).orderBy(desc(signatureDocuments.createdAt));
    }),

  // Get single document
  get: staffQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(signatureDocuments)
        .where(eq(signatureDocuments.id, input.id)).limit(1);
      return rows[0] || null;
    }),

  // Create a signature document
  create: seniorQuery
    .input(z.object({
      clientId: z.number(),
      title: z.string().min(1),
      description: z.string().optional(),
      content: z.string().min(1),
      documentType: z.enum(["engagement_letter", "tax_authorization", "poa", "consent", "nda", "custom"]).default("custom"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.insert(signatureDocuments).values({
        ...input,
        userId: ctx.user.id,
      }).returning();
      if (result[0]) syncInsert("signature_documents", result[0]);
      return result[0];
    }),

  // Update document
  update: seniorQuery
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      content: z.string().optional(),
      documentType: z.enum(["engagement_letter", "tax_authorization", "poa", "consent", "nda", "custom"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const db = getDb();
      await db.update(signatureDocuments)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(signatureDocuments.id, id));
      return { success: true };
    }),

  // Send document to client (via portal)
  send: seniorQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();

      // Get the document
      const docs = await db.select().from(signatureDocuments)
        .where(eq(signatureDocuments.id, input.id)).limit(1);
      if (!docs[0]) throw new Error("Document not found");
      const doc = docs[0];

      // Get client
      const clientRows = await db.select().from(clients)
        .where(eq(clients.id, doc.clientId)).limit(1);
      if (!clientRows[0]) throw new Error("Client not found");

      // Ensure portal is enabled
      let settings = await db.select().from(portalSettings)
        .where(eq(portalSettings.clientId, doc.clientId)).limit(1);

      if (settings.length === 0) {
        await db.insert(portalSettings).values({
          clientId: doc.clientId,
          isEnabled: true,
          showFinancialOverview: true,
          showTasks: true,
          showDocuments: true,
          showInvoices: true,
        });
      } else if (!settings[0].isEnabled) {
        await db.update(portalSettings)
          .set({ isEnabled: true })
          .where(eq(portalSettings.clientId, doc.clientId));
      }

      // Create or get active portal token
      const existingTokens = await db.select().from(portalTokens)
        .where(and(eq(portalTokens.clientId, doc.clientId), eq(portalTokens.isActive, true)))
        .limit(1);

      let portalToken: string;
      if (existingTokens[0]) {
        portalToken = existingTokens[0].token;
      } else {
        portalToken = crypto.randomBytes(32).toString("hex");
        await db.insert(portalTokens).values({
          clientId: doc.clientId,
          token: portalToken,
          email: clientRows[0].email,
          isActive: true,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        });
      }

      // Mark document as sent
      await db.update(signatureDocuments)
        .set({
          status: "sent",
          sentAt: new Date(),
          sentBy: ctx.user.id,
          portalToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days to sign
          updatedAt: new Date(),
        })
        .where(eq(signatureDocuments.id, input.id));

      // Sync updated doc
      const sentDoc = await db.select().from(signatureDocuments).where(eq(signatureDocuments.id, input.id)).limit(1);
      if (sentDoc[0]) syncUpdate("signature_documents", sentDoc[0]);

      return {
        success: true,
        portalUrl: `/portal/${portalToken}?tab=documents`,
      };
    }),

  // Mark as viewed (called when client opens it)
  markViewed: staffQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(signatureDocuments)
        .set({ status: "viewed", viewedAt: new Date(), updatedAt: new Date() })
        .where(eq(signatureDocuments.id, input.id));
      return { success: true };
    }),

  // Client signs a document (public endpoint via portal)
  sign: publicQuery
    .input(z.object({
      id: z.number(),
      signedBy: z.string().min(1),
      signedByEmail: z.string().optional(), // not strictly validated — optional record only
      signatureType: z.enum(["type_name", "draw", "click"]).default("type_name"),
      signatureData: z.string(), // JSON string with signature details
      ipAddress: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Get the document
      const docs = await db.select().from(signatureDocuments)
        .where(eq(signatureDocuments.id, input.id)).limit(1);
      if (!docs[0]) throw new Error("Document not found");

      const doc = docs[0];
      if (doc.status === "signed") throw new Error("Document already signed");
      if (doc.status !== "sent" && doc.status !== "viewed") throw new Error("Document not available for signing");
      if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) throw new Error("Document has expired");

      await db.update(signatureDocuments)
        .set({
          status: "signed",
          signedBy: input.signedBy,
          signedByEmail: input.signedByEmail || doc.signedByEmail,
          signatureType: input.signatureType,
          signatureData: input.signatureData,
          signedAt: new Date(),
          ipAddress: input.ipAddress || null,
          updatedAt: new Date(),
        })
        .where(eq(signatureDocuments.id, input.id));

      // Sync signed doc
      const signedDoc = await db.select().from(signatureDocuments).where(eq(signatureDocuments.id, input.id)).limit(1);
      if (signedDoc[0]) syncUpdate("signature_documents", signedDoc[0]);

      return { success: true, signedAt: new Date() };
    }),

  // Cancel a document
  cancel: seniorQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(signatureDocuments)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(signatureDocuments.id, input.id));
      return { success: true };
    }),

  // Delete a document
  delete: seniorQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(signatureDocuments).where(eq(signatureDocuments.id, input.id));
      return { success: true };
    }),

  // PUBLIC: Get document for signing (via portal token)
  getPublic: publicQuery
    .input(z.object({ id: z.number(), token: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();

      // Validate token
      const tokenRows = await db.select().from(portalTokens)
        .where(and(eq(portalTokens.token, input.token), eq(portalTokens.isActive, true)))
        .limit(1);
      if (!tokenRows[0]) return null;

      // Get document
      const docs = await db.select().from(signatureDocuments)
        .where(eq(signatureDocuments.id, input.id)).limit(1);
      if (!docs[0]) return null;

      // Security check: token must be for same client as document
      if (docs[0].clientId !== tokenRows[0].clientId) return null;

      return docs[0];
    }),
});
