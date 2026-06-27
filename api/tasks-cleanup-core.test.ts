import { describe, it, expect } from "vitest";
import { analyzeTasks, type CleanupTask } from "./tasks-cleanup-core";

const day = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const NOW = day("2026-06-27");

describe("analyzeTasks", () => {
  it("clusters near-duplicate titles on different days as one group", () => {
    const tasks: CleanupTask[] = [
      { id: 1, clientId: 5, title: "File HST return Q1 2026", dueDate: day("2026-04-30") },
      { id: 2, clientId: 5, title: "File HST Return — Q1", dueDate: day("2026-05-02") },
      { id: 3, clientId: 5, title: "Run payroll", dueDate: day("2026-05-15") },
    ];
    const r = analyzeTasks(tasks, NOW);
    expect(r.nearDuplicates).toHaveLength(1);
    expect(r.nearDuplicates[0].keepId).toBe(1); // earliest due
    expect(r.nearDuplicates[0].tasks.map((t) => t.id).sort()).toEqual([1, 2]);
  });

  it("does not cluster tasks across different clients", () => {
    const tasks: CleanupTask[] = [
      { id: 1, clientId: 5, title: "Run payroll", dueDate: day("2026-05-01") },
      { id: 2, clientId: 6, title: "Run payroll", dueDate: day("2026-05-02") },
    ];
    expect(analyzeTasks(tasks, NOW).nearDuplicates).toHaveLength(0);
  });

  it("leaves exact same-day duplicates to the boot dedupe (not flagged here)", () => {
    const tasks: CleanupTask[] = [
      { id: 1, clientId: 5, title: "Run payroll", dueDate: day("2026-05-01") },
      { id: 2, clientId: 5, title: "Run payroll", dueDate: day("2026-05-01") },
    ];
    expect(analyzeTasks(tasks, NOW).nearDuplicates).toHaveLength(0);
  });

  it("flags undated open tasks", () => {
    const tasks: CleanupTask[] = [
      { id: 1, clientId: 5, title: "Call client", dueDate: null, startDate: null },
      { id: 2, clientId: 5, title: "Has a date", dueDate: day("2026-07-01") },
    ];
    const r = analyzeTasks(tasks, NOW);
    expect(r.undated.map((t) => t.id)).toEqual([1]);
  });

  it("flags long-stale overdue tasks", () => {
    const tasks: CleanupTask[] = [
      { id: 1, clientId: 5, title: "Old thing", dueDate: day("2025-12-01") }, // ~200d
      { id: 2, clientId: 5, title: "Recent", dueDate: day("2026-06-01") },    // ~26d
    ];
    const r = analyzeTasks(tasks, NOW);
    expect(r.staleOverdue.map((t) => t.id)).toEqual([1]);
    expect(r.staleOverdue[0].ageDays).toBeGreaterThan(120);
  });

  it("ignores completed tasks entirely", () => {
    const tasks: CleanupTask[] = [
      { id: 1, clientId: 5, title: "Done old", dueDate: day("2025-01-01"), completed: true },
    ];
    const r = analyzeTasks(tasks, NOW);
    expect(r.summary).toEqual({ nearDuplicateGroups: 0, nearDuplicateExtra: 0, undated: 0, staleOverdue: 0 });
  });
});
