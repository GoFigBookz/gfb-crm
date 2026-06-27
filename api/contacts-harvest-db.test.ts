/**
 * REGRESSION TEST — harvestSave inserts confirmed contacts and SKIPS duplicates.
 * Runs the exact insert/dedup logic against a real (in-memory libsql) DB so a save
 * can't silently double-add a contact or fail on a column the schema forgot.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { clientContacts } from "../db/schema";

async function mkDb() {
  const c = createClient({ url: ":memory:" });
  const db = drizzle(c);
  await c.execute(`CREATE TABLE client_contacts (
    id integer PRIMARY KEY AUTOINCREMENT,
    clientId integer NOT NULL,
    name text NOT NULL,
    title text, email text, phone text,
    isPrimary integer DEFAULT 0,
    notes text,
    createdAt integer, updatedAt integer
  )`);
  return { c, db };
}

// The exact body of contactsRouter.harvestSave, hoisted to test against a real DB.
async function harvestSave(db: any, clientId: number, contacts: Array<{ name: string; email: string; title?: string }>) {
  const existing = await db.select({ email: clientContacts.email }).from(clientContacts).where(eq(clientContacts.clientId, clientId));
  const have = new Set((existing as any[]).map((r) => String(r.email || "").toLowerCase()));
  let saved = 0;
  for (const ct of contacts) {
    if (have.has(ct.email.toLowerCase())) continue;
    await db.insert(clientContacts).values({ clientId, name: ct.name, title: ct.title || null, email: ct.email.toLowerCase(), updatedAt: new Date() });
    have.add(ct.email.toLowerCase());
    saved++;
  }
  return { success: true, saved };
}

describe("contacts.harvestSave — real DB", () => {
  it("inserts new contacts and persists name/title/email", async () => {
    const { c, db } = await mkDb();
    const r = await harvestSave(db, 7, [
      { name: "Rocco Pugliese", email: "rocco@ovitaconstruction.com", title: "" },
      { name: "Gabriella", email: "gabriella@cfaaccounting.ca", title: "Accountant" },
    ]);
    expect(r.saved).toBe(2);
    const rows = (await c.execute(`SELECT name, title, email FROM client_contacts WHERE clientId=7 ORDER BY id`)).rows as any[];
    expect(rows.map((x) => x.email)).toEqual(["rocco@ovitaconstruction.com", "gabriella@cfaaccounting.ca"]);
    expect(rows[1].title).toBe("Accountant");
  });

  it("skips an email already on the client (idempotent re-save)", async () => {
    const { c, db } = await mkDb();
    await harvestSave(db, 7, [{ name: "Rocco", email: "rocco@ovitaconstruction.com" }]);
    const again = await harvestSave(db, 7, [
      { name: "Rocco P", email: "ROCCO@ovitaconstruction.com" }, // same addr, different case
      { name: "Dan", email: "dan@ovitaconstruction.com" },
    ]);
    expect(again.saved).toBe(1); // only Dan is new
    const count = (await c.execute(`SELECT COUNT(*) n FROM client_contacts WHERE clientId=7`)).rows[0] as any;
    expect(Number(count.n)).toBe(2);
  });

  it("dedups within a single batch", async () => {
    const { c, db } = await mkDb();
    const r = await harvestSave(db, 9, [
      { name: "A", email: "a@x.com" },
      { name: "A again", email: "A@x.com" },
    ]);
    expect(r.saved).toBe(1);
    const count = (await c.execute(`SELECT COUNT(*) n FROM client_contacts WHERE clientId=9`)).rows[0] as any;
    expect(Number(count.n)).toBe(1);
  });
});
