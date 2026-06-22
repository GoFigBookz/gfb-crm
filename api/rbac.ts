/**
 * RBAC — per-staff client access scoping.
 * =============================================================================
 * Access model (Markie 2026-06-22):
 *  - admin + senior_bookkeeper  → see ALL clients (owner / controller view).
 *  - junior_bookkeeper / staff  → see ALL clients UNLESS their `restrictedToClients`
 *    flag is on, in which case they see only the clients granted in `client_access`.
 *  - client role                → handled separately (clients.userId ownership).
 *
 * The flag defaults OFF, so turning this on is non-disruptive: existing users keep
 * full visibility until an admin explicitly restricts them and picks their clients.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clientAccess } from "../db/schema";
import { eq } from "drizzle-orm";

/** Roles that always see every client, regardless of grants. */
function seesAllClients(role?: string | null): boolean {
  return role === "admin" || role === "senior_bookkeeper";
}

/**
 * The set of client ids a user is limited to — or `null` when they see everything.
 * `null` means "no restriction" (apply no client filter).
 */
export async function restrictedClientIds(ctx: any): Promise<number[] | null> {
  const user = ctx?.user;
  if (!user) return [];                       // unauthenticated → nothing
  if (seesAllClients(user.role)) return null; // admins/seniors → all
  if (!user.restrictedToClients) return null; // unrestricted staff → all (default)
  const rows = await getDb().select().from(clientAccess).where(eq(clientAccess.userId, user.id));
  return (rows as any[]).map((r) => r.clientId);
}

/** Whether a user may access a specific client. */
export async function canAccessClient(ctx: any, clientId: number): Promise<boolean> {
  const ids = await restrictedClientIds(ctx);
  if (ids === null) return true;
  return ids.includes(clientId);
}

/** Replace a user's full set of client-access grants (admin action). */
export async function setClientAccessGrants(userId: number, clientIds: number[]): Promise<void> {
  const db = getDb();
  await db.delete(clientAccess).where(eq(clientAccess.userId, userId));
  const unique = Array.from(new Set(clientIds.filter((n) => Number.isFinite(n))));
  for (const clientId of unique) {
    await db.insert(clientAccess).values({ userId, clientId });
  }
}

/** Current grants for a user. */
export async function getClientAccessGrants(userId: number): Promise<number[]> {
  const rows = await getDb().select().from(clientAccess).where(eq(clientAccess.userId, userId));
  return (rows as any[]).map((r) => r.clientId);
}
