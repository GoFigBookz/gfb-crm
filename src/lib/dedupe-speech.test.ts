import { describe, it, expect } from "vitest";
import { dedupePhrases, overlapMerge, mergeSpeechSegments, cleanTranscript } from "./dedupe-speech";

describe("overlapMerge", () => {
  it("keeps the longer when one is a growing prefix of the other", () => {
    expect(overlapMerge("hey Sky", "hey Sky do you")).toBe("hey Sky do you");
    expect(overlapMerge("hey Sky do you", "hey Sky")).toBe("hey Sky do you");
  });
  it("drops a tail-repeat / contained segment", () => {
    expect(overlapMerge("found anything", "found anything")).toBe("found anything");
  });
  it("stitches on word overlap", () => {
    expect(overlapMerge("file the HST for Clark", "for Clark Owen Sound")).toBe("file the HST for Clark Owen Sound");
  });
  it("joins genuinely disjoint segments", () => {
    expect(overlapMerge("I went to", "the store")).toBe("I went to the store");
  });
});

describe("cleanTranscript (the mobile-STT fix)", () => {
  it("collapses growing-prefix garble into the intended sentence", () => {
    const segs = ["hey", "hey Sky", "hey Sky do", "hey Sky do you know", "hey Sky do you know what I told you to do"];
    expect(cleanTranscript(segs)).toBe("hey Sky do you know what I told you to do");
  });
  it("collapses a repeated full phrase across restart", () => {
    expect(cleanTranscript(["can you tell me if you found anything", "can you tell me if you found anything"]))
      .toBe("can you tell me if you found anything");
  });
  it("concatenates distinct dictated segments", () => {
    expect(cleanTranscript(["I went to", "the store", "and bought milk"])).toBe("I went to the store and bought milk");
  });
  it("leaves a clean single utterance untouched", () => {
    expect(cleanTranscript(["file the HST for Clark Owen Sound by Friday"])).toBe("file the HST for Clark Owen Sound by Friday");
  });
});

describe("dedupePhrases", () => {
  it("collapses single + multi-word stutters", () => {
    expect(dedupePhrases("Sky Sky Sky")).toBe("Sky");
    expect(dedupePhrases("can you tell me can you tell me")).toBe("can you tell me");
  });
  it("handles empty", () => {
    expect(dedupePhrases("")).toBe("");
  });
});
