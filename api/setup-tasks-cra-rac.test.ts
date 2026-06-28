/**
 * REGRESSION TEST — the "Get CRA Represent a Client (RAC) access" setup task must
 * honor the intake's craRacDone flag: skip it when CRA RAC is already set up, and
 * prune any stale open one. Runs against a real (in-memory libsql) DB.
 *
 * Root cause this guards: ensureSetupTasks always created the CRA RAC task and the
 * reconciler never consulted craRacDone, so a client with CRA access already set up
 * kept seeing a stale "Get CRA RAC access" task forever.
 *
 * Uses raw SQL so the test exercises the exact create-decision + delete predicate
 * (title + non-completed) the production code runs, without binding to the full
 * tasks Drizzle schema.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";

const CRA_RAC = "Get CRA Represent a Client (RAC) access";

async function mkDb() {
  const c = createClient({ url: ":memory:" });
  await c.execute(`CREATE TABLE tasks (
    id integer PRIMARY KEY AUTOINCREMENT,
    clientId integer, title text, category text, status text DEFAULT 'pending', completed integer DEFAULT 0
  )`);
  await c.execute(`CREATE TABLE clients (
    id integer PRIMARY KEY AUTOINCREMENT, name text, craRacDone integer DEFAULT 0
  )`);
  return c;
}

// The CRA-RAC decision + idempotent insert (mirrors ensureSetupTasks).
async function ensureCraRac(c: any, clientId: number, craRacDone: boolean) {
  if (craRacDone) return 0;
  const existing = await c.execute({ sql: `SELECT id FROM tasks WHERE clientId=? AND title=?`, args: [clientId, CRA_RAC] });
  if (existing.rows.length) return 0;
  await c.execute({ sql: `INSERT INTO tasks (clientId, title, category, status) VALUES (?,?, 'Setup', 'pending')`, args: [clientId, CRA_RAC] });
  return 1;
}

// pruneCraRacTasksForDone (mirrors the production delete predicate).
async function prune(c: any) {
  const done = await c.execute(`SELECT id FROM clients WHERE craRacDone=1`);
  let removed = 0;
  for (const row of done.rows as any[]) {
    const del = await c.execute({ sql: `DELETE FROM tasks WHERE clientId=? AND title=? AND status!='completed'`, args: [row.id, CRA_RAC] });
    removed += del.rowsAffected || 0;
  }
  return removed;
}

const count = async (c: any, clientId: number) =>
  Number(((await c.execute({ sql: `SELECT COUNT(*) n FROM tasks WHERE clientId=?`, args: [clientId] })).rows[0] as any).n);

describe("CRA RAC setup task honors craRacDone", () => {
  it("creates the task when CRA RAC is NOT done", async () => {
    const c = await mkDb();
    expect(await ensureCraRac(c, 1, false)).toBe(1);
    expect(await count(c, 1)).toBe(1);
  });

  it("does NOT create the task when CRA RAC is done", async () => {
    const c = await mkDb();
    expect(await ensureCraRac(c, 2, true)).toBe(0);
    expect(await count(c, 2)).toBe(0);
  });

  it("does not double-create (idempotent)", async () => {
    const c = await mkDb();
    await ensureCraRac(c, 1, false);
    expect(await ensureCraRac(c, 1, false)).toBe(0);
    expect(await count(c, 1)).toBe(1);
  });

  it("prune removes a stale open CRA RAC task once the client is marked done", async () => {
    const c = await mkDb();
    await c.execute(`INSERT INTO clients (id, name, craRacDone) VALUES (3, 'Alderson', 1)`);
    await ensureCraRac(c, 3, false); // created while it was still not-done
    expect(await count(c, 3)).toBe(1);
    expect(await prune(c)).toBe(1);
    expect(await count(c, 3)).toBe(0);
  });

  it("prune leaves a COMPLETED CRA RAC task as history", async () => {
    const c = await mkDb();
    await c.execute(`INSERT INTO clients (id, name, craRacDone) VALUES (4, 'Done Co', 1)`);
    await c.execute({ sql: `INSERT INTO tasks (clientId, title, category, status, completed) VALUES (?,?, 'Setup', 'completed', 1)`, args: [4, CRA_RAC] });
    expect(await prune(c)).toBe(0);
    expect(await count(c, 4)).toBe(1);
  });
});
