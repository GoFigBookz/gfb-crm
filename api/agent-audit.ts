/**
 * AGENT AUDIT — record + read the agent action log (governed-autonomy trail).
 */
import { getDb } from "./queries/connection";
import { agentAuditLog } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export async function recordAudit(e: {
  userId: number;
  agentScope?: string;
  action: string;
  summary?: string | null;
  amount?: number | null;
  decision?: string;
  clientId?: number | null;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(agentAuditLog).values({
      userId: e.userId,
      agentScope: e.agentScope ?? "all",
      action: e.action,
      summary: e.summary ?? null,
      amount: e.amount ?? null,
      decision: e.decision ?? "done",
      clientId: e.clientId ?? null,
    } as any);
  } catch { /* audit is best-effort — never block the action */ }
}

export async function recentAudit(userId: number, limit = 30): Promise<any[]> {
  try {
    const db = getDb();
    return (await db.select().from(agentAuditLog)
      .where(eq(agentAuditLog.userId, userId))
      .orderBy(desc(agentAuditLog.createdAt))
      .limit(limit)) as any[];
  } catch {
    return [];
  }
}
