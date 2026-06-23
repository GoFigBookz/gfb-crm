import { describe, it, expect } from "vitest";
import { formatAgenda } from "./assistant-core";

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
