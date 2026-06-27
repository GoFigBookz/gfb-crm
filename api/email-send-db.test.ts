/**
 * REGRESSION TEST — the email send/reply path stamps clients.lastContactedAt.
 * This bug shipped because that column wasn't in the Drizzle schema, so the update
 * generated "UPDATE clients SET WHERE id=?" (empty SET) and the send crashed live.
 * This runs the EXACT write against a real (in-memory libsql) database — the kind of
 * test that would have caught it before shipping.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { clients } from "../db/schema";

describe("email send — clients.lastContactedAt stamp", () => {
  it("runs UPDATE clients SET lastContactedAt as valid SQL and persists it", async () => {
    const client = createClient({ url: ":memory:" });
    const db = drizzle(client);

    // Minimal clients table including the column the send/reply flow stamps.
    await client.execute(`CREATE TABLE clients (
      id integer PRIMARY KEY AUTOINCREMENT,
      userId integer,
      name text NOT NULL,
      email text NOT NULL,
      status text DEFAULT 'active',
      lastContactedAt integer
    )`);
    await client.execute(`INSERT INTO clients (id, userId, name, email, status) VALUES (5077, 1, 'Test Co', 't@example.com', 'active')`);

    // The EXACT write email.send / email.reply do. Before the fix this threw because
    // lastContactedAt wasn't a known column → Drizzle emitted an empty SET clause.
    const when = new Date("2026-06-27T20:00:00Z");
    await expect(
      db.update(clients).set({ lastContactedAt: when }).where(eq(clients.id, 5077)),
    ).resolves.toBeDefined();

    const row = (await client.execute(`SELECT lastContactedAt FROM clients WHERE id=5077`)).rows[0] as any;
    expect(row.lastContactedAt).toBeTruthy(); // it actually persisted, not an empty SET
  });
});
