import { describe, it, expect } from "vitest";
import { formatAgenda, detectAgent, frontDeskSystem } from "./assistant-core";

describe("detectAgent", () => {
  it("routes by name at the start of the message", () => {
    expect(detectAgent("Hey Sage, can you prep the HST?")).toBe("sage");
    expect(detectAgent("Wren — did month-end tie out?")).toBe("wren");
    expect(detectAgent("ask Liv to draft a reply")).toBe("liv");
    expect(detectAgent("Fig, code these receipts")).toBe("fig");
    expect(detectAgent("hey gage is everything working")).toBe("gage");
  });
  it("stays with the current agent when none is named", () => {
    expect(detectAgent("what about the payroll?", "sage")).toBe("sage");
  });
  it("defaults to Fig with no name and no current", () => {
    expect(detectAgent("add a task to call John")).toBe("fig");
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
