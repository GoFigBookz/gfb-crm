/**
 * GAGE ROUTER — the QA/watchdog agent's live health check.
 * =============================================================================
 * Jinx gathers raw facts from the running system (DB reachable, key tables +
 * row counts, which env keys are set, QBO/connector health, recent sync errors)
 * and hands them to the pure evaluator in qa-core. The result is a graded
 * report (ok/warn/fail) Markie can glance at instead of living in Claude.
 * Read-only — Jinx never changes data, it only inspects.
 * =============================================================================
 */
import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { evaluateQa, type QaFacts } from "./qa-core";
import { triageFindings } from "../db/schema";
import { scoreAgents } from "./scorecard-core";

const TABLES = [
  "clients", "users", "tasks", "emails", "employees",
  "pay_runs", "qbo_connections", "connected_accounts",
  "triage_findings", "vendor_memory",
];

const TRACKED_ENV = [
  "ANTHROPIC_API_KEY", "FIGGY_TOKEN_KEY", "QBO_CLIENT_ID",
  "QBO_CLIENT_SECRET", "FIGGY_MAKE_API_TOKEN",
];

async function countTable(db: any, table: string): Promise<number | null> {
  try {
    const res: any = await db.run(sql.raw(`SELECT COUNT(*) AS n FROM "${table}"`));
    const rows = res?.rows ?? res ?? [];
    const row = rows[0] ?? {};
    const n = (row.n ?? row[0] ?? row["COUNT(*)"]);
    return Number(n) || 0;
  } catch {
    return null; // table missing or query failed → core marks it fail
  }
}

async function gatherFacts(): Promise<QaFacts> {
  const db = getDb();

  // DB reachable?
  let dbReachable = false;
  let dbError: string | undefined;
  try {
    await db.run(sql`SELECT 1`);
    dbReachable = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  // Table counts.
  const tableCounts: Record<string, number | null> = {};
  if (dbReachable) {
    for (const t of TABLES) tableCounts[t] = await countTable(db, t);
  } else {
    for (const t of TABLES) tableCounts[t] = null;
  }

  // Env presence.
  const env: Record<string, boolean> = {};
  for (const name of TRACKED_ENV) env[name] = !!process.env[name];

  // QBO token encryption is "configured" if ANY key source is available — the
  // FIGGY_TOKEN_KEY env, APP_SECRET, OR the auto-generated key persisted in
  // app_settings (zero-touch). Report the real capability, not just one env name,
  // so Jinx stops crying wolf when it's actually working (hasTokenKey: true).
  let tokenKeyReady = !!(process.env.FIGGY_TOKEN_KEY || process.env.APP_SECRET);
  if (!tokenKeyReady && dbReachable) {
    try {
      const r: any = await db.run(sql.raw(`SELECT value FROM app_settings WHERE key = 'figgy_token_key' LIMIT 1`));
      const row = (r?.rows ?? r ?? [])[0];
      tokenKeyReady = !!(row && (row.value ?? row[0]));
    } catch { /* app_settings may not exist yet — leave as-is */ }
  }
  env["FIGGY_TOKEN_KEY"] = tokenKeyReady;

  // QBO connection health.
  let qbo: QaFacts["qbo"];
  try {
    const res: any = await db.run(
      sql.raw(`SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN "isActive" = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN "reconnectReason" IS NOT NULL AND "reconnectReason" != '' THEN 1 ELSE 0 END) AS needReconnect
      FROM qbo_connections`),
    );
    const row = (res?.rows ?? res ?? [])[0] ?? {};
    qbo = {
      total: Number(row.total ?? 0) || 0,
      active: Number(row.active ?? 0) || 0,
      needReconnect: Number(row.needReconnect ?? 0) || 0,
    };
  } catch {
    // column set may differ on older DBs; skip the QBO check rather than fail.
  }

  // Connector account count.
  let connectorCount: number | undefined;
  const cc = await countTable(db, "connected_accounts");
  if (cc !== null) connectorCount = cc;

  // Recent sync errors (last 50 connector sync logs).
  let recentSyncErrors: number | undefined;
  try {
    const res: any = await db.run(
      sql.raw(`SELECT COUNT(*) AS n FROM (
        SELECT status FROM connector_sync_logs ORDER BY id DESC LIMIT 50
      ) WHERE status = 'error' OR status = 'failed'`),
    );
    const row = (res?.rows ?? res ?? [])[0] ?? {};
    recentSyncErrors = Number(row.n ?? 0) || 0;
  } catch {
    // table may not exist on this DB; skip.
  }

  return { dbReachable, dbError, tableCounts, env, qbo, connectorCount, recentSyncErrors };
}

/** Run the full health report (reusable — also called by Jinx in the chatbot). */
export async function runHealthReport() {
  return evaluateQa(await gatherFacts());
}

/** Agent scorecard — how often each agent's proposals get accepted (reusable). */
export async function runAgentScorecard() {
  const db = getDb();
  let rows: any[] = [];
  try {
    rows = (await db.select({
      agentName: triageFindings.agentName,
      status: triageFindings.status,
      confidence: triageFindings.confidence,
      createdAt: triageFindings.createdAt,
    }).from(triageFindings)) as any[];
  } catch { /* table may be empty/absent — score nothing */ }
  return scoreAgents(rows);
}

export const qaRouter = createRouter({
  /** Jinx's full health report. Any signed-in staff member can run it. */
  runChecks: authedQuery.query(async () => {
    return runHealthReport();
  }),

  /** Jinx's agent scorecard — measurable quality per agent. */
  scorecard: authedQuery.query(async () => {
    return runAgentScorecard();
  }),

  /** Recent agent activity (governed-autonomy audit trail). */
  activity: authedQuery.query(async ({ ctx }) => {
    const { recentAudit } = await import("./agent-audit");
    return recentAudit(ctx.user.id, 30);
  }),

  /** Lightweight liveness — used by uptime pings / the status dot. */
  ping: authedQuery
    .input(z.object({}).optional())
    .query(async () => {
      const db = getDb();
      try {
        await db.run(sql`SELECT 1`);
        return { ok: true, ts: new Date().toISOString() };
      } catch (e) {
        return { ok: false, ts: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) };
      }
    }),
});
