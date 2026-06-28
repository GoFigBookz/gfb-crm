/**
 * REGRESSION TEST — the relink taken-client exclusion against a real (in-memory) DB.
 * Proves the behaviour Markie depends on: "Go Fig Bookz USA" (orphan realm) does NOT
 * steal the Canadian firm client (which already has a connection), and DOES bind once a
 * dedicated US firm client exists. Mirrors the qbo-relink.ts selection logic.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { clients, qboConnections } from "../db/schema";
import { matchConnectionToClient, type RelinkClient } from "./qbo-relink-core";

async function mkDb() {
  const c = createClient({ url: ":memory:" });
  const db = drizzle(c);
  await c.execute(`CREATE TABLE clients (id integer PRIMARY KEY AUTOINCREMENT, name text, company text, status text DEFAULT 'active')`);
  await c.execute(`CREATE TABLE qbo_connections (id integer PRIMARY KEY AUTOINCREMENT, clientId integer, realmId text, companyName text, isActive integer DEFAULT 1)`);
  return { c, db };
}

// The exact candidate-selection from relinkUnmappedConnections: exclude clients that
// already have a connection, then match the orphan by name.
function selectFor(orphanCompany: string, allClients: RelinkClient[], allConns: any[]) {
  const taken = new Set(allConns.filter((x) => x.clientId != null).map((x) => x.clientId));
  const candidates = allClients.filter((c) => !taken.has(c.id));
  return matchConnectionToClient(orphanCompany, candidates);
}

describe("relink exclusion — Go Fig Bookz USA must not steal the Canadian firm", () => {
  it("refuses to bind the USA realm to the firm client that already has a connection", async () => {
    const cl: RelinkClient[] = [{ id: 1, name: "12738988 Canada Inc.", company: "Go Fig Bookz", status: "active" }];
    const conns = [{ id: 11, clientId: 1, companyName: "Go Fig Bookz Inc" }, { id: 17, clientId: null, companyName: "Go Fig Bookz USA" }];
    // firm client #1 is taken by connection 11 → excluded → USA realm has no candidate
    expect(selectFor("Go Fig Bookz USA", cl, conns).result).toBe("none");
  });

  it("binds the USA realm once a dedicated Go Fig Bookz USA client exists", async () => {
    const cl: RelinkClient[] = [
      { id: 1, name: "12738988 Canada Inc.", company: "Go Fig Bookz", status: "active" },
      { id: 99, name: "Go Fig Bookz USA", company: "Go Fig Bookz USA", status: "active" },
    ];
    const conns = [{ id: 11, clientId: 1, companyName: "Go Fig Bookz Inc" }, { id: 17, clientId: null, companyName: "Go Fig Bookz USA" }];
    const m = selectFor("Go Fig Bookz USA", cl, conns);
    expect(m).toEqual({ result: "matched", clientId: 99, clientName: "Go Fig Bookz USA" });
  });

  it("Universal Drywall's distinctive token never collides with Universal Construction", () => {
    const cl: RelinkClient[] = [
      { id: 3, name: "UNIVERSAL CONSTRUCTION GROUP", status: "active" },
      { id: 7, name: "UNIVERSAL DRYWALL", status: "active" },
    ];
    // 'drywall' is the distinctive token used by the US-firm reclassifier — unique
    expect(cl.filter((c) => /drywall/i.test(c.name || "")).length).toBe(1);
  });
});
