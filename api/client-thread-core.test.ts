import { describe, it, expect } from "vitest";
import { summarizeThread } from "./client-thread-core";

describe("summarizeThread", () => {
  const notes = [
    { id: 1, body: "Posted all of May.", isQuestion: false, createdAt: "2026-06-01T10:00:00Z" },
    { id: 2, body: "Want me to reclass the Amazon charges to office supplies?", isQuestion: true, resolved: false, createdAt: "2026-06-02T10:00:00Z" },
    { id: 3, body: "Reconciled PayPal.", isQuestion: false, createdAt: "2026-06-03T10:00:00Z" },
    { id: 4, body: "Should the RBC interest go to a separate account?", isQuestion: true, resolved: true, createdAt: "2026-06-04T10:00:00Z" },
  ];

  it("counts only OPEN (unresolved) questions", () => {
    const s = summarizeThread(notes);
    expect(s.total).toBe(4);
    expect(s.openQuestions).toBe(1);
    expect(s.openList[0].id).toBe(2);
  });

  it("returns the most recent note as lastNote", () => {
    expect(summarizeThread(notes).lastNote!.id).toBe(4);
  });

  it("handles an empty thread", () => {
    expect(summarizeThread([])).toEqual({ total: 0, openQuestions: 0, lastNote: null, openList: [] });
  });

  it("tolerates numeric and Date timestamps", () => {
    const s = summarizeThread([
      { body: "a", createdAt: 1000 },
      { body: "b", createdAt: new Date(2000) },
    ]);
    expect(s.lastNote!.body).toBe("b");
  });
});
