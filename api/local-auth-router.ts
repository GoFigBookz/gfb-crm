import { z } from "zod";
import { createRouter, publicQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users } from "@db/schema";
import { eq, and, like, desc } from "drizzle-orm";
import { hash, compare } from "bcryptjs";
import { signSessionToken } from "./kimi/session";
import { setCookie } from "hono/cookie";
import { getSessionCookieOptions } from "./lib/cookies";
import { Session } from "@contracts/constants";
import { randomBytes } from "crypto";

export const localAuthRouter = createRouter({
  // Register new user (admin only)
  register: adminQuery
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
      password: z.string().min(8).max(100),
      role: z.enum(["admin", "senior_bookkeeper", "junior_bookkeeper", "client"]).default("junior_bookkeeper"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      // Check if email already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      
      if (existing.length > 0) {
        throw new Error("Email already registered");
      }
      
      // Hash password
      const passwordHash = await hash(input.password, 12);
      
      // Create user
      const [user] = await db.insert(users).values({
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role,
        authProvider: "local",
        isActive: true,
      }).returning();
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        message: "User created successfully",
      };
    }),

  // Login with email/password
  login: publicQuery
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      
      // Find user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      
      if (!user) {
        throw new Error("Invalid email or password");
      }
      
      if (!user.isActive) {
        throw new Error("Account is disabled");
      }
      
      if (!user.passwordHash) {
        throw new Error("This account uses social login. Please use Google or Microsoft sign-in.");
      }
      
      // Verify password
      const valid = await compare(input.password, user.passwordHash);
      if (!valid) {
        throw new Error("Invalid email or password");
      }
      
      // Update last sign in
      await db
        .update(users)
        .set({ lastSignInAt: new Date() })
        .where(eq(users.id, user.id));
      
      // Create session
      const token = await signSessionToken({
        unionId: user.id.toString(), // Use id as unionId for local auth
        clientId: process.env.APP_ID || "local",
      });
      
      // Set cookie
      const cookieOpts = getSessionCookieOptions(ctx.req?.raw?.headers || new Headers());
      setCookie(ctx, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
        },
        token,
      };
    }),

  // Get current user
  me: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      avatar: ctx.user.avatar,
    };
  }),

  // List all users (admin only)
  list: adminQuery.query(async () => {
    const db = getDb();
    return db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        authProvider: users.authProvider,
        createdAt: users.createdAt,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
  }),

  // Update user (admin only)
  update: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "senior_bookkeeper", "junior_bookkeeper", "client"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...updates } = input;
      
      await db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
      
      return { success: true };
    }),

  // Change password (any authenticated user)
  changePassword: publicQuery
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      
      const db = getDb();
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      
      if (!user?.passwordHash) {
        throw new Error("No password set for this account");
      }
      
      const valid = await compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new Error("Current password is incorrect");
      }
      
      const newHash = await hash(input.newPassword, 12);
      await db
        .update(users)
        .set({ passwordHash: newHash })
        .where(eq(users.id, ctx.user.id));
      
      return { success: true, message: "Password changed successfully" };
    }),

  // Reset password (admin only - sets temporary password)
  resetPassword: adminQuery
    .input(z.object({
      userId: z.number(),
      temporaryPassword: z.string().min(8).max(100),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const newHash = await hash(input.temporaryPassword, 12);
      
      await db
        .update(users)
        .set({
          passwordHash: newHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId));
      
      return { success: true, message: "Password reset. User must change on next login." };
    }),

  // Delete user (admin only)
  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),

  // Logout
  logout: publicQuery.mutation(async ({ ctx }) => {
    setCookie(ctx, Session.cookieName, "", {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    return { success: true };
  }),
});