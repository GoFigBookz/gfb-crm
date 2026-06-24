import { describe, it, expect } from "vitest";
import { dedupePhrases } from "./dedupe-speech";

describe("dedupePhrases", () => {
  it("collapses single repeated words", () => {
    expect(dedupePhrases("Sky Sky Sky")).toBe("Sky");
    expect(dedupePhrases("the the the the cat")).toBe("the cat");
  });

  it("collapses repeated multi-word phrases", () => {
    expect(dedupePhrases("can you tell me can you tell me")).toBe("can you tell me");
    expect(dedupePhrases("can you tell me can you tell me what you did")).toBe("can you tell me what you did");
  });

  it("cleans the real garbled dictation from the bug report", () => {
    const garbled = "can you tell me can you tell me can you tell me what you did Sky Sky Sky can you tell me if you found anything can you tell me if you found anything";
    const out = dedupePhrases(garbled);
    expect(out.toLowerCase()).toContain("can you tell me what you did");
    expect(out.toLowerCase()).toContain("if you found anything");
    // No 3-in-a-row repeats remain
    expect(/\b(\w+)\s+\1\s+\1\b/i.test(out)).toBe(false);
  });

  it("leaves genuine non-repeated text untouched", () => {
    const s = "file the HST for Clark Owen Sound by Friday";
    expect(dedupePhrases(s)).toBe(s);
  });

  it("handles empty / whitespace", () => {
    expect(dedupePhrases("")).toBe("");
    expect(dedupePhrases("   ")).toBe("");
  });

  it("keeps an intentional single repeat that isn't a stutter run", () => {
    // "very very good" — one repeat of a 1-gram collapses to "very good".
    // Acceptable tradeoff for killing the mobile STT stutter.
    expect(dedupePhrases("very very good")).toBe("very good");
  });
});
