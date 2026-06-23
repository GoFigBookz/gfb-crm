/**
 * GAGE CORE — the QA/watchdog agent's pure evaluation logic (unit-testable).
 * =============================================================================
 * Gage's job: make sure everything we've built is actually WORKING, so Markie
 * doesn't have to live in Claude babysitting the app. The router gathers raw
 * facts (DB reachable? key tables present + row counts? which env keys are set?
 * connections live?) and hands them here. This file turns facts → a graded
 * health report (ok / warn / fail) with plain-English detail. No I/O so it's
 * fully testable.
 * =============================================================================
 */

export type CheckStatus = "ok" | "warn" | "fail";

export interface QaCheck {
  id: string;
  category: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface QaReport {
  status: CheckStatus;
  counts: { ok: number; warn: number; fail: number; total: number };
  checks: QaCheck[];
  ts: string;
}

/** Worst-of rollup: fail beats warn beats ok. */
export function rollup(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "ok";
}

/** Raw facts the router collects from the live system. */
export interface QaFacts {
  /** Did the DB answer a trivial query? */
  dbReachable: boolean;
  dbError?: string;
  /** Row counts per important table (missing key = table errored / absent). */
  tableCounts: Record<string, number | null>;
  /** Env var name → present (truthy). */
  env: Record<string, boolean>;
  /** QBO connections summary. */
  qbo?: { total: number; active: number; needReconnect: number };
  /** Provider connections (connectedAccounts) count. */
  connectorCount?: number;
  /** Last sync error counts in the recent window, if gathered. */
  recentSyncErrors?: number;
}

/** Tables we expect to exist + populate. emptyOk=true → 0 rows is fine. */
const EXPECTED_TABLES: { name: string; label: string; emptyOk: boolean }[] = [
  { name: "clients", label: "Clients", emptyOk: false },
  { name: "users", label: "Users", emptyOk: false },
  { name: "tasks", label: "Tasks", emptyOk: true },
  { name: "emails", label: "Emails", emptyOk: true },
  { name: "employees", label: "Employees", emptyOk: true },
  { name: "pay_runs", label: "Pay runs", emptyOk: true },
  { name: "qbo_connections", label: "QBO connections", emptyOk: true },
  { name: "connected_accounts", label: "Connector accounts", emptyOk: true },
  { name: "triage_findings", label: "Triage findings", emptyOk: true },
  { name: "vendor_memory", label: "Vendor memory", emptyOk: true },
];

/** Env keys: required ones fail if missing; optional ones only warn. */
const REQUIRED_ENV = [
  { name: "ANTHROPIC_API_KEY", why: "AI features (Liv drafts, chatbot, bank converter, PDF splitter, web classify)" },
];
const OPTIONAL_ENV = [
  { name: "FIGGY_TOKEN_KEY", why: "QBO token encryption at rest (native OAuth)" },
  { name: "QBO_CLIENT_ID", why: "QBO native OAuth (production app)" },
  { name: "QBO_CLIENT_SECRET", why: "QBO native OAuth (production app)" },
  { name: "FIGGY_MAKE_API_TOKEN", why: "Make scenario-run bridge (Drive folders, backlog suggest)" },
];

export function evaluateQa(facts: QaFacts): QaReport {
  const checks: QaCheck[] = [];

  // 1) Database reachable.
  checks.push({
    id: "db",
    category: "Database",
    label: "Database connection",
    status: facts.dbReachable ? "ok" : "fail",
    detail: facts.dbReachable ? "Responding to queries." : `Not reachable${facts.dbError ? `: ${facts.dbError}` : "."}`,
  });

  // 2) Tables present + populated.
  for (const t of EXPECTED_TABLES) {
    const count = facts.tableCounts[t.name];
    if (count === undefined || count === null) {
      checks.push({
        id: `table:${t.name}`,
        category: "Tables",
        label: t.label,
        status: "fail",
        detail: "Table missing or query failed.",
      });
    } else if (count === 0 && !t.emptyOk) {
      checks.push({
        id: `table:${t.name}`,
        category: "Tables",
        label: t.label,
        status: "warn",
        detail: "Present but empty (expected some rows).",
      });
    } else {
      checks.push({
        id: `table:${t.name}`,
        category: "Tables",
        label: t.label,
        status: "ok",
        detail: `${count} row${count === 1 ? "" : "s"}.`,
      });
    }
  }

  // 3) Env presence.
  for (const e of REQUIRED_ENV) {
    const present = !!facts.env[e.name];
    checks.push({
      id: `env:${e.name}`,
      category: "Configuration",
      label: e.name,
      status: present ? "ok" : "fail",
      detail: present ? "Set." : `Missing — needed for ${e.why}.`,
    });
  }
  for (const e of OPTIONAL_ENV) {
    const present = !!facts.env[e.name];
    checks.push({
      id: `env:${e.name}`,
      category: "Configuration",
      label: e.name,
      status: present ? "ok" : "warn",
      detail: present ? "Set." : `Not set — ${e.why} stays off until configured.`,
    });
  }

  // 4) QBO connections health.
  if (facts.qbo) {
    const { total, active, needReconnect } = facts.qbo;
    let status: CheckStatus = "ok";
    let detail = `${active}/${total} connection${total === 1 ? "" : "s"} active.`;
    if (total === 0) {
      status = "warn";
      detail = "No QBO connections yet (bridge or native OAuth not bound).";
    } else if (needReconnect > 0) {
      status = "warn";
      detail = `${needReconnect} connection${needReconnect === 1 ? "" : "s"} need reconnect.`;
    } else if (active === 0) {
      status = "warn";
      detail = `${total} connection${total === 1 ? "" : "s"} but none active.`;
    }
    checks.push({ id: "qbo", category: "QuickBooks", label: "QBO connections", status, detail });
  }

  // 5) Provider connectors.
  if (typeof facts.connectorCount === "number") {
    checks.push({
      id: "connectors",
      category: "Integrations",
      label: "Connected provider accounts",
      status: "ok",
      detail: `${facts.connectorCount} account${facts.connectorCount === 1 ? "" : "s"} linked.`,
    });
  }

  // 6) Recent sync errors.
  if (typeof facts.recentSyncErrors === "number") {
    checks.push({
      id: "sync-errors",
      category: "Integrations",
      label: "Recent sync errors",
      status: facts.recentSyncErrors > 0 ? "warn" : "ok",
      detail: facts.recentSyncErrors > 0 ? `${facts.recentSyncErrors} failed sync(s) recently.` : "No recent sync failures.",
    });
  }

  const ok = checks.filter((c) => c.status === "ok").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;

  return {
    status: rollup(checks.map((c) => c.status)),
    counts: { ok, warn, fail, total: checks.length },
    checks,
    ts: new Date().toISOString(),
  };
}
