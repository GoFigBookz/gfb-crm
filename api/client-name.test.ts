import { describe, it, expect } from "vitest";
import { reorderNumberedName } from "./client-name";

describe("reorderNumberedName", () => {
  it("moves the operating name first, numbered entity second", () => {
    expect(reorderNumberedName("1001196626 Ontario Ltd. (Sher-E-Punjab)"))
      .toBe("Sher-E-Punjab (1001196626 Ontario Ltd.)");
    expect(reorderNumberedName("1000235299 Ontario Ltd. (The Auld Spot Pub)"))
      .toBe("The Auld Spot Pub (1000235299 Ontario Ltd.)");
    expect(reorderNumberedName("1001411380 Ontario Inc. (Columbus Cafe)"))
      .toBe("Columbus Cafe (1001411380 Ontario Inc.)");
  });

  it("tidies ALL-CAPS legal suffix while keeping the number verbatim", () => {
    expect(reorderNumberedName("1001196626 ONTARIO LTD. (Sher-E-Punjab)"))
      .toBe("Sher-E-Punjab (1001196626 Ontario Ltd.)");
  });

  it("leaves numbered companies with no trade name untouched", () => {
    expect(reorderNumberedName("2303851 Ontario Inc.")).toBe("2303851 Ontario Inc.");
    expect(reorderNumberedName("12738988 Canada Inc.")).toBe("12738988 Canada Inc.");
  });

  it("leaves normal names untouched", () => {
    expect(reorderNumberedName("Originality.AI Inc.")).toBe("Originality.AI Inc.");
    expect(reorderNumberedName("Clark Pools Owen Sound")).toBe("Clark Pools Owen Sound");
  });

  it("handles null/empty safely", () => {
    expect(reorderNumberedName(null)).toBe("");
    expect(reorderNumberedName("")).toBe("");
    expect(reorderNumberedName("   ")).toBe("");
  });
});
