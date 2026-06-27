import { describe, it, expect } from "vitest";
import { parseAddressList, inferRole, extractContacts } from "./contact-harvest-core";

describe("parseAddressList", () => {
  it("parses name + angle-bracket email", () => {
    expect(parseAddressList('"Rocco Pugliese" <rocco@ovitaconstruction.com>')).toEqual([
      { name: "Rocco Pugliese", email: "rocco@ovitaconstruction.com" },
    ]);
  });

  it("parses a bare email", () => {
    expect(parseAddressList("dan@ovitaconstruction.com")).toEqual([
      { name: "", email: "dan@ovitaconstruction.com" },
    ]);
  });

  it("splits a list but not on commas inside quotes", () => {
    const r = parseAddressList('"Pugliese, Rocco" <rocco@x.com>, dan@x.com, Gabriella <g@cfaaccounting.ca>');
    expect(r).toEqual([
      { name: "Pugliese, Rocco", email: "rocco@x.com" },
      { name: "", email: "dan@x.com" },
      { name: "Gabriella", email: "g@cfaaccounting.ca" },
    ]);
  });

  it("drops garbage that isn't an email", () => {
    expect(parseAddressList("not-an-email, ok@x.com")).toEqual([{ name: "", email: "ok@x.com" }]);
  });

  it("handles empty / null", () => {
    expect(parseAddressList("")).toEqual([]);
    expect(parseAddressList(null)).toEqual([]);
  });
});

describe("inferRole", () => {
  it("reads the accountant from the domain", () => {
    expect(inferRole("gabriella@cfaaccounting.ca")).toBe("Accountant");
  });
  it("reads AP / billing / payroll from the local part", () => {
    expect(inferRole("ap@vendor.com")).toBe("Accounts Payable");
    expect(inferRole("billing@vendor.com")).toBe("Billing");
    expect(inferRole("payroll@vendor.com")).toBe("Payroll");
  });
  it("reads a bank from the domain", () => {
    expect(inferRole("john@rbc.com")).toBe("Bank");
  });
  it("returns blank when nothing matches", () => {
    expect(inferRole("rocco@ovitaconstruction.com")).toBe("");
  });
});

describe("extractContacts — the harvest", () => {
  const msgs = [
    { from: '"Rocco Pugliese" <rocco@ovitaconstruction.com>', to: "markie@gofig.ca", date: "Wed, 01 Jun 2026 10:00:00 -0400" },
    { from: "markie@gofig.ca", to: '"Rocco Pugliese" <rocco@ovitaconstruction.com>, dan@ovitaconstruction.com', cc: "gabriella@cfaaccounting.ca", date: "Thu, 02 Jun 2026 10:00:00 -0400" },
    { from: "dan@ovitaconstruction.com", to: "markie@gofig.ca", date: "Fri, 03 Jun 2026 10:00:00 -0400" },
  ];

  it("dedups people and ranks senders first", () => {
    const r = extractContacts({ messages: msgs, firmDomains: ["gofig.ca"] });
    const emails = r.map((c) => c.email);
    // rocco + dan both sent → they outrank gabriella (cc only, never sent)
    expect(emails).toContain("rocco@ovitaconstruction.com");
    expect(emails).toContain("dan@ovitaconstruction.com");
    expect(emails).toContain("gabriella@cfaaccounting.ca");
    expect(emails[emails.length - 1]).toBe("gabriella@cfaaccounting.ca");
  });

  it("excludes the firm's own domain", () => {
    const r = extractContacts({ messages: msgs, firmDomains: ["gofig.ca"] });
    expect(r.find((c) => c.email === "markie@gofig.ca")).toBeUndefined();
  });

  it("excludes already-known addresses", () => {
    const r = extractContacts({ messages: msgs, firmDomains: ["gofig.ca"], excludeEmails: ["rocco@ovitaconstruction.com"] });
    expect(r.find((c) => c.email === "rocco@ovitaconstruction.com")).toBeUndefined();
  });

  it("drops automated no-reply senders", () => {
    const r = extractContacts({
      messages: [{ from: "no-reply@quickbooks.com", to: "markie@gofig.ca" }, { from: "notifications@intuit.com", to: "markie@gofig.ca" }],
      firmDomains: ["gofig.ca"],
    });
    expect(r).toEqual([]);
  });

  it("infers the role + keeps a real display name over a derived one", () => {
    const r = extractContacts({ messages: msgs, firmDomains: ["gofig.ca"] });
    const rocco = r.find((c) => c.email === "rocco@ovitaconstruction.com")!;
    expect(rocco.name).toBe("Rocco Pugliese");
    const gab = r.find((c) => c.email === "gabriella@cfaaccounting.ca")!;
    expect(gab.role).toBe("Accountant");
    // gabriella had no display name → derived from local part
    expect(gab.name).toBe("Gabriella");
  });

  it("counts occurrences and tracks lastSeen", () => {
    const r = extractContacts({ messages: msgs, firmDomains: ["gofig.ca"] });
    const rocco = r.find((c) => c.email === "rocco@ovitaconstruction.com")!;
    expect(rocco.fromCount).toBe(1);
    expect(rocco.occurrences).toBe(2); // sent once, to'd once
    expect(rocco.lastSeen).toBe(Date.parse("Thu, 02 Jun 2026 10:00:00 -0400"));
  });
});
