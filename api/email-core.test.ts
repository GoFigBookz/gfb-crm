import { describe, it, expect } from "vitest";
import { extractEmail, splitAddresses, matchClientId, buildRawMessage, replyDraftSystem, taskSuggestSystem, emailDomain, buildClientDomainMap, matchClientByDomain } from "./email-core";

describe("extractEmail", () => {
  it("pulls the address out of a display-name header", () => {
    expect(extractEmail("Jane Doe <jane@acme.com>")).toBe("jane@acme.com");
    expect(extractEmail("bob@x.co")).toBe("bob@x.co");
    expect(extractEmail("  MixedCase@X.Com ")).toBe("mixedcase@x.com");
  });
  it("returns empty for junk", () => {
    expect(extractEmail("no address here")).toBe("");
    expect(extractEmail("")).toBe("");
  });
});

describe("splitAddresses", () => {
  it("splits multiple recipients", () => {
    expect(splitAddresses("a@x.com, Jane <jane@y.com>; c@z.com")).toEqual(["a@x.com", "jane@y.com", "c@z.com"]);
  });
});

describe("matchClientId", () => {
  const byAddr = new Map<string, number>([["jane@acme.com", 5], ["finance@adbank.network", 9]]);
  it("matches case-insensitively, first hit wins", () => {
    expect(matchClientId(["Someone@nope.com", "JANE@acme.com"], byAddr)).toBe(5);
    expect(matchClientId(["finance@adbank.network"], byAddr)).toBe(9);
  });
  it("returns null when nothing matches (so non-client mail is skipped)", () => {
    expect(matchClientId(["random@gmail.com"], byAddr)).toBeNull();
    expect(matchClientId([], byAddr)).toBeNull();
  });
});

describe("emailDomain", () => {
  it("pulls the domain, lowercased", () => {
    expect(emailDomain("Jane@Acme.COM")).toBe("acme.com");
    expect(emailDomain("nope")).toBe("");
  });
});

describe("buildClientDomainMap + matchClientByDomain", () => {
  it("maps a domain owned by exactly one client, skips generic providers", () => {
    const byDomain = buildClientDomainMap([
      { clientId: 5, address: "jane@acme.com" },
      { clientId: 5, address: "billing@acme.com" }, // same client, same domain → still unambiguous
      { clientId: 9, address: "bob@gmail.com" },    // generic → excluded
    ]);
    expect(matchClientByDomain(["someone@acme.com"], byDomain)).toBe(5);
    expect(matchClientByDomain(["x@gmail.com"], byDomain)).toBeNull();
  });
  it("refuses to guess when two clients share a domain (ambiguous → null)", () => {
    const byDomain = buildClientDomainMap([
      { clientId: 5, address: "a@shared.com" },
      { clientId: 7, address: "b@shared.com" },
    ]);
    expect(matchClientByDomain(["c@shared.com"], byDomain)).toBeNull();
  });
});

describe("replyDraftSystem", () => {
  it("embeds Markie's writing samples + draft-only instruction", () => {
    const sys = replyDraftSystem(["Hey! Thanks, I'll get that over Friday. — Markie", "All set on my end, cheers"]);
    expect(sys).toContain("MARKIE'S WRITING SAMPLES");
    expect(sys).toContain("Thanks, I'll get that over Friday");
    expect(sys.toLowerCase()).toContain("draft");
  });
  it("handles no samples gracefully", () => {
    expect(replyDraftSystem([])).toContain("No samples available");
  });
});

describe("taskSuggestSystem", () => {
  it("asks for strict JSON", () => {
    expect(taskSuggestSystem()).toContain('{"task"');
  });
});

describe("buildRawMessage", () => {
  it("builds a decodable base64url RFC-822 message with headers", () => {
    const raw = buildRawMessage({ fromName: "Markie", fromEmail: "markie@gofig.ca", to: "jane@acme.com", subject: "Hi", html: "<p>Hello</p>" });
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain("From: Markie <markie@gofig.ca>");
    expect(decoded).toContain("To: jane@acme.com");
    expect(decoded).toContain("Subject: Hi");
    expect(decoded).toContain("<p>Hello</p>");
    expect(raw).not.toMatch(/[+/=]/); // url-safe
  });
  it("includes Cc when provided", () => {
    const raw = buildRawMessage({ fromEmail: "a@b.com", to: "c@d.com", cc: "e@f.com", subject: "S", html: "x" });
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain("Cc: e@f.com");
  });
});
