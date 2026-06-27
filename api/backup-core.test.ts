import { describe, it, expect } from "vitest";
import {
  selectBackupTables, summarizeBackup, pruneSnapshots, shouldAutoSnapshot,
  backupFilename, restoreDiff,
} from "./backup-core";

describe("backup-core", () => {
  it("selects business tables, drops sqlite/cache/log/session tables", () => {
    const got = selectBackupTables([
      "clients", "tasks", "sqlite_sequence", "sessions", "vendor_cache", "agent_audit_log", "employees",
    ]);
    expect(got).toEqual(["clients", "employees", "tasks"]);
  });

  it("honors an extra denylist", () => {
    expect(selectBackupTables(["clients", "huge_table"], { extraDeny: ["huge_table"] })).toEqual(["clients"]);
  });

  it("summarizes per-table + total rows", () => {
    const s = summarizeBackup({ tables: { clients: [1, 2, 3], tasks: [1] } as any });
    expect(s.tableCount).toBe(2);
    expect(s.totalRows).toBe(4);
    expect(s.perTable.clients).toBe(3);
  });

  it("prunes to keep the newest N", () => {
    const list = [
      { id: 1, createdAt: 100 }, { id: 2, createdAt: 300 }, { id: 3, createdAt: 200 },
    ];
    expect(pruneSnapshots(list, 2).sort()).toEqual([1]); // keep id2(300),id3(200); delete id1(100)
    expect(pruneSnapshots(list, 5)).toEqual([]);
  });

  it("auto-snapshots once per UTC day", () => {
    const t1 = Date.parse("2026-06-27T02:00:00Z");
    const t2 = Date.parse("2026-06-27T23:00:00Z");
    const t3 = Date.parse("2026-06-28T00:30:00Z");
    expect(shouldAutoSnapshot(null, t1)).toBe(true);
    expect(shouldAutoSnapshot(t1, t2)).toBe(false); // same UTC day
    expect(shouldAutoSnapshot(t1, t3)).toBe(true);  // next day
  });

  it("builds a sortable filename", () => {
    expect(backupFilename(Date.parse("2026-06-27T09:05:00Z"))).toBe("figgy-backup-2026-06-27-0905.json");
  });

  it("restore diff sorts by biggest change", () => {
    const diff = restoreDiff({ clients: 30, tasks: 100 }, { clients: 32, tasks: 90 });
    expect(diff[0].table).toBe("tasks"); // |100-90|=10 > |30-32|=2
    expect(diff[0].delta).toBe(10);
    expect(diff.find((d) => d.table === "clients")?.delta).toBe(-2);
  });
});
