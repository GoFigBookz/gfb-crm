/**
 * OWNER = ADMIN (Markie 2026-06-25).
 * =============================================================================
 * Markie is the firm owner/partner but his account was stuck as
 * "senior_bookkeeper" with no way to self-promote (changing your own role is
 * gated behind admin — a chicken-and-egg lock). This boot guard guarantees the
 * owner account(s) are always role=admin, so the admin UI + admin-only controls
 * are available to him. Idempotent; matches by the known owner emails.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

const OWNER_EMAILS = ["markie@gofig.ca", "markie.antle@gmail.com"];

export async function ensureOwnerAdmin(): Promise<{ promoted: string[] } | void> {
  try {
    const db = getDb();
    const promoted: string[] = [];
    const all = (await db.select().from(users)) as any[];
    for (const u of all) {
      const email = String(u.email || "").toLowerCase();
      if (!OWNER_EMAILS.includes(email)) continue;
      if (u.role === "admin") continue;
      await db.update(users).set({ role: "admin", updatedAt: new Date() } as any).where(eq(users.id, u.id));
      promoted.push(u.email);
    }
    if (promoted.length) console.log(`[owner-admin] promoted to admin: ${promoted.join(", ")}`);
    return { promoted };
  } catch (e) {
    console.error("[owner-admin] failed:", e instanceof Error ? e.message : e);
  }
}
