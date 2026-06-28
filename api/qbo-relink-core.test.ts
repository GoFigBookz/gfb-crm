import { describe, it, expect } from "vitest";
import { matchConnectionToClient, significantTokens, type RelinkClient } from "./qbo-relink-core";

const C = (id: number, name: string, status = "active"): RelinkClient => ({ id, name, status });

describe("significantTokens", () => {
  it("drops generic corporate words and short tokens", () => {
    expect(significantTokens("Selective Painting Inc")).toEqual(["selective"]);
    expect(significantTokens("The Auld Spot Pub")).toEqual(["auld", "spot"]);
    expect(significantTokens("2303851 Ontario Inc.")).toEqual(["2303851"]);
    expect(significantTokens("Universal Construction Group Inc.")).toEqual(["universal"]);
  });
});

describe("matchConnectionToClient — isolation-safe relink", () => {
  const clients = [
    C(1, "SELECTIVE PAINTING"),
    C(2, "The Auld Spot Pub"),
    C(3, "UNIVERSAL CONSTRUCTION GROUP"),
    C(4, "UNIVERSAL DRYWALL"),
    C(5, "Columbus Café Erin Mills"),
    C(9, "Old Selective (closed)", "inactive"),
  ];

  it("binds when exactly one active client matches", () => {
    const m = matchConnectionToClient("Selective Painting Inc", clients);
    expect(m).toEqual({ result: "matched", clientId: 1, clientName: "SELECTIVE PAINTING" });
  });

  it("matches multi-token names on any shared significant token", () => {
    expect(matchConnectionToClient("The Auld Spot Pub", clients)).toMatchObject({ result: "matched", clientId: 2 });
    expect(matchConnectionToClient("Columbus Café Erin Mills TC", clients)).toMatchObject({ result: "matched", clientId: 5 });
  });

  it("refuses ambiguous matches (two clients share a token)", () => {
    // both Universal Construction (3) and Universal Drywall (4) share "universal"
    const m = matchConnectionToClient("Universal Holdings Inc.", clients);
    expect(m.result).toBe("ambiguous");
  });

  it("returns none when nothing matches or the only match is inactive", () => {
    expect(matchConnectionToClient("Seahorse Health", clients).result).toBe("none");
    expect(matchConnectionToClient("Studio Lella", clients).result).toBe("none");
    // 'selective' would hit the inactive client only → ignored → none... but client 1 is active,
    // so test an inactive-only token:
    expect(matchConnectionToClient("Old Closed Co", clients).result).toBe("none");
  });

  it("returns none for an all-generic company name (no signal to match on)", () => {
    expect(matchConnectionToClient("Holdings Inc.", clients).result).toBe("none");
  });
});
