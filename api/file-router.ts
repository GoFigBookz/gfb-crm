import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { files } from "../db/schema";
import { eq, and, desc, like } from "drizzle-orm";

export const fileRouter = createRouter({
  // List files
  list: authedQuery
    .input(z.preprocess(
      (val) => (val === null ? undefined : val),
      z.object({
        clientId: z.number().optional(),
        provider: z.enum(["google_drive", "one_drive", "local"]).optional(),
        isFolder: z.boolean().optional(),
        parentId: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      }).optional()
    ))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.user.id;

      const conditions = [eq(files.userId, userId)];
      if (input?.clientId) conditions.push(eq(files.clientId, input.clientId));
      if (input?.provider) conditions.push(eq(files.provider, input.provider));
      if (input?.isFolder !== undefined) conditions.push(eq(files.isFolder, input.isFolder));
      if (input?.parentId) conditions.push(eq(files.providerParentId, input.parentId));
      if (input?.search) conditions.push(like(files.name, `%${input.search}%`));

      return db
        .select()
        .from(files)
        .where(and(...conditions))
        .orderBy(desc(files.updatedAt))
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0);
    }),

  // Get single file
  get: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db
        .select()
        .from(files)
        .where(and(eq(files.id, input.id), eq(files.userId, ctx.user.id)))
        .limit(1);

      return result[0] ?? null;
    }),

  // Create file record
  create: authedQuery
    .input(z.object({
      clientId: z.number().optional(),
      connectedAccountId: z.number().optional(),
      provider: z.enum(["google_drive", "one_drive", "local"]),
      providerFileId: z.string().optional(),
      providerParentId: z.string().optional(),
      name: z.string().min(1).max(255),
      mimeType: z.string().max(100).optional(),
      size: z.number().optional(),
      webViewLink: z.string().optional(),
      downloadLink: z.string().optional(),
      thumbnailLink: z.string().optional(),
      isFolder: z.boolean().optional().default(false),
      localPath: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [file] = await db.insert(files).values({
        ...input,
        userId: ctx.user.id,
        syncStatus: "synced",
        lastSyncedAt: new Date(),
      });
      return file;
    }),

  // Update file
  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      webViewLink: z.string().optional(),
      downloadLink: z.string().optional(),
      syncStatus: z.enum(["synced", "pending", "error", "offline"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...updates } = input;

      await db
        .update(files)
        .set({
          ...updates,
          lastSyncedAt: new Date(),
        })
        .where(and(eq(files.id, id), eq(files.userId, ctx.user.id)));

      return { success: true };
    }),

  // Delete file
  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .delete(files)
        .where(and(eq(files.id, input.id), eq(files.userId, ctx.user.id)));

      return { success: true };
    }),

  // Get file stats by provider
  stats: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.user.id;

    const allFiles = await db
      .select()
      .from(files)
      .where(eq(files.userId, userId));

    return {
      total: allFiles.length,
      googleDrive: allFiles.filter(f => f.provider === "google_drive").length,
      oneDrive: allFiles.filter(f => f.provider === "one_drive").length,
      local: allFiles.filter(f => f.provider === "local").length,
      folders: allFiles.filter(f => f.isFolder).length,
      totalSize: allFiles.reduce((sum, f) => sum + (f.size || 0), 0),
    };
  }),
});
