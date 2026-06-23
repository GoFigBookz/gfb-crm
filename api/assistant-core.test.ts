import { describe, it, expect } from "vitest";
import { formatAgenda, detectAgent, frontDeskSystem } from "./assistant-core";

describe("detectAgent", () => {
  it("routes by name at the start of the message", () => {
    expect(detectAgent("Hey Sage, can you prep the HST?")).toBe("sage");
    expect(detectAgent("Wren — did month-end tie out?")).toBe("wren");
    expect(detectAgent("ask Liv to draft a reply")).toBe("liv");
    expect(detectAgent("Fig, code these receipts")).toBe("fig");
    expect(detectAgent("hey jinx is everything working")).toBe("jinx");
  });
  it("stays with the current agent for a generic follow-up", () => {
    expect(detectAgent("and when is that due?", "tess")).toBe("tess");
  });
  it("defaults to Liv (front desk) for general questions with no name/current", () => {
    expect(detectAgent("what's the weather today?")).toBe("liv");
    expect(detectAgent("where can I buy a tablecloth?")).toBe("liv");
  });
  it("auto-routes by topic even without a name, overriding stickiness", () => {
    expect(detectAgent("what's the tax treatment of a T2 capital gain?", "fig")).toBe("tess");
    expect(detectAgent("can you tie out the bank reconciliation?", "liv")).toBe("wren");
    expect(detectAgent("how's cash flow looking this quarter?", "sage")).toBe("jade");
    expect(detectAgent("draft a LinkedIn post about year-end", "fig")).toBe("skye");
    expect(detectAgent("is the app down?", null)).toBe("jinx");
    expect(detectAgent("when is the HST payroll remittance due?", null)).toBe("sage");
    expect(detectAgent("can you draft a reply to this email?", null)).toBe("liv");
  });
});

describe("frontDeskSystem", () => {
  it("adopts the addressed agent's persona and lists the team", () => {
    const sys = frontDeskSystem("wren");
    expect(sys).toContain("you are answering as Wren");
    expect(sys).toContain("controller/auditor");
    expect(sys).toContain("Sage");
    expect(sys).toContain("Hey <name>");
  });
});

describe("formatAgenda", () => {
  it("summarizes overdue/today/upcoming + events concisely", () => {
    const out = formatAgenda({
      overdue: [{ title: "File HST", client: "Clark OS", due: "Jun 20" }],
      today: [{ title: "Reconcile May", client: "Highbury" }],
      upcoming: [{ title: "T4 prep", client: "Originality", due: "Feb 28" }],
      events: [{ title: "Call with John", when: "10:00 AM" }],
    });
    expect(out).toContain("Overdue (1)");
    expect(out).toContain("File HST (Clark OS) — due Jun 20");
    expect(out).toContain("Due today (1)");
    expect(out).toContain("Call with John");
  });

  it("says all clear when nothing is pending", () => {
    expect(formatAgenda({ overdue: [], today: [], upcoming: [], events: [] })).toContain("all clear");
  });
});
