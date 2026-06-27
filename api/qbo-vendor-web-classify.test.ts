import { describe, it, expect } from "vitest";
import { vendorClassifyBody, parseVendorCategory } from "./qbo-vendor-web-classify";

describe("vendor web-classify — shared body + parser", () => {
  it("builds a one-token classify request for a name", () => {
    const body = vendorClassifyBody("Petro-Canada", "claude-haiku-4-5");
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.messages[0].content).toContain("Petro-Canada");
    expect(body.system).toMatch(/fuel/); // category list is injected
    expect(body.tools[0].name).toBe("web_search");
  });

  it("parses a category from message content blocks", () => {
    const content = [{ type: "text", text: "fuel" }];
    expect(parseVendorCategory(content)?.category).toBe("fuel");
  });

  it("parses from a raw string too, and returns null for unknown", () => {
    expect(parseVendorCategory("This looks like a restaurant — meals")?.category).toBe("meals");
    expect(parseVendorCategory("unknown")).toBeNull();
    expect(parseVendorCategory([])).toBeNull();
  });
});
