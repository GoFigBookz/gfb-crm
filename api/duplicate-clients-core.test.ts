import { describe, it, expect } from "vitest";
import { findDuplicateClients, type DupClient } from "./duplicate-clients-core";

const C = (id: number, x: Partial<DupClient> = {}): DupClient => ({ id, name: `Client ${id}`, ...x });

describe("duplicate-clients-core", () => {
  it("flags same normalized name (ignoring Inc/Ltd/punctuation)", () => {
    const pairs = findDuplicateClients([
      C(1, { name: "Clark Pools Inc." }),
      C(2, { name: "clark pools" }),
      C(3, { name: "Totally Different Co" }),
    ]);
    expect(pairs.length).toBe(1);
    expect(pairs[0].reasons).toContain("Same name");
  });

  it("flags shared email / phone / HST(BN9) and scores strong", () => {
    const pairs = findDuplicateClients([
      C(1, { name: "Acme A", email: "x@acme.com", phone: "(519) 555-1212", hstNumber: "123456789 RT0001" }),
      C(2, { name: "Acme B", email: "X@ACME.com", phone: "519-555-1212", hstNumber: "123456789RP0001" }),
    ]);
    expect(pairs.length).toBe(1);
    expect(pairs[0].reasons).toEqual(expect.arrayContaining(["Same email", "Same phone", "Same HST/business number"]));
    expect(pairs[0].strength).toBe("strong");
  });

  it("does NOT flag two clearly different clients", () => {
    const pairs = findDuplicateClients([
      C(1, { name: "Owen Sound Spa", email: "a@os.com", phone: "5190000001" }),
      C(2, { name: "Collingwood Garage", email: "b@cw.com", phone: "7050000002" }),
    ]);
    expect(pairs.length).toBe(0);
  });

  it("name-only contains match is weaker (possible/likely, not strong)", () => {
    const pairs = findDuplicateClients([
      C(1, { name: "Highbury Canco" }),
      C(2, { name: "Highbury" }),
    ]);
    expect(pairs.length).toBe(1);
    expect(pairs[0].strength).not.toBe("strong");
  });
});
