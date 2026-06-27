import { describe, it, expect } from "vitest";
import { evaluateQa, rollup, type QaFacts } from "./qa-core";

describe("rollup", () => {
  it("returns the worst status", () => {
    expect(rollup(["ok", "ok"])).toBe("ok");
    expect(rollup(["ok", "warn"])).toBe("warn");
    expect(rollup(["ok", "warn", "fail"])).toBe("fail");
    expect(rollup([])).toBe("ok");
  });
});

function healthyFacts(): QaFacts {
  return {
    dbReachable: true,
    tableCounts: {
      clients: 12, users: 3, tasks: 40, emails: 5, employees: 8,
      pay_runs: 2, qbo_connections: 2, connected_accounts: 4,
      triage_findings: 7, vendor_memory: 30,
    },
    env: { ANTHROPIC_API_KEY: true, FIGGY_TOKEN_KEY: true, QBO_CLIENT_ID: true, QBO_CLIENT_SECRET: true, FIGGY_MAKE_API_TOKEN: true },
    qbo: { total: 2, active: 2, needReconnect: 0 },
    connectorCount: 4,
    recentSyncErrors: 0,
  };
}

describe("evaluateQa", () => {
  it("reports all-green on a healthy system", () => {
    const r = evaluateQa(healthyFacts());
    expect(r.status).toBe("ok");
    expect(r.counts.fail).toBe(0);
    expect(r.counts.warn).toBe(0);
  });

  it("grades data-backup freshness (ok / warn / fail / none)", () => {
    const DAY = 86_400_000;
    const at = (ageMs: number | null) => evaluateQa({ ...healthyFacts(), lastBackupAgeMs: ageMs }).checks.find((c) => c.id === "backups")!;
    expect(at(3_600_000).status).toBe("ok");       // 1h ago
    expect(at(1.6 * DAY).status).toBe("warn");     // ~38h
    expect(at(3 * DAY).status).toBe("fail");       // stale → auto-backup likely stopped
    expect(at(null).status).toBe("warn");          // none yet
    // Absent fact → no check at all (backward compatible)
    expect(evaluateQa(healthyFacts()).checks.find((c) => c.id === "backups")).toBeUndefined();
  });

  it("fails when the database is unreachable", () => {
    const f = healthyFacts();
    f.dbReachable = false;
    f.dbError = "ECONNREFUSED";
    const r = evaluateQa(f);
    expect(r.status).toBe("fail");
    const db = r.checks.find((c) => c.id === "db")!;
    expect(db.status).toBe("fail");
    expect(db.detail).toContain("ECONNREFUSED");
  });

  it("fails a missing required table and warns on an empty seed table", () => {
    const f = healthyFacts();
    f.tableCounts.clients = 0; // not emptyOk → warn
    f.tableCounts.users = null as any; // missing → fail
    const r = evaluateQa(f);
    expect(r.checks.find((c) => c.id === "table:clients")!.status).toBe("warn");
    expect(r.checks.find((c) => c.id === "table:users")!.status).toBe("fail");
    expect(r.status).toBe("fail");
  });

  it("fails on missing required env but only warns on optional env", () => {
    const f = healthyFacts();
    f.env.ANTHROPIC_API_KEY = false;
    f.env.FIGGY_TOKEN_KEY = false;
    const r = evaluateQa(f);
    expect(r.checks.find((c) => c.id === "env:ANTHROPIC_API_KEY")!.status).toBe("fail");
    expect(r.checks.find((c) => c.id === "env:FIGGY_TOKEN_KEY")!.status).toBe("warn");
  });

  it("warns when QBO connections need reconnect", () => {
    const f = healthyFacts();
    f.qbo = { total: 2, active: 1, needReconnect: 1 };
    const r = evaluateQa(f);
    const q = r.checks.find((c) => c.id === "qbo")!;
    expect(q.status).toBe("warn");
    expect(q.detail).toContain("reconnect");
  });

  it("warns when there are recent sync errors", () => {
    const f = healthyFacts();
    f.recentSyncErrors = 3;
    const r = evaluateQa(f);
    expect(r.checks.find((c) => c.id === "sync-errors")!.status).toBe("warn");
  });
});
