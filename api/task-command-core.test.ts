import { describe, it, expect } from "vitest";
import { parseTaskCommand, extractDueDate, matchClient } from "./task-command-core";

const CLIENTS = [
  { id: 1, name: "Clark Pools and Spas Owen Sound Inc." },
  { id: 2, name: "Clark Pools and Spas Collingwood Inc" },
  { id: 3, name: "Originality.AI Inc" },
];

// Fixed reference: Monday, 2026-06-22.
const NOW = new Date(2026, 5, 22, 9, 0, 0);

describe("parseTaskCommand", () => {
  it("extracts client, title, and due date", () => {
    const r = parseTaskCommand("add a task for Clark Pools and Spas Owen Sound Inc.: file HST by Friday", CLIENTS, NOW);
    expect(r.clientId).toBe(1);
    expect(r.title.toLowerCase()).toContain("file hst");
    expect(r.title.toLowerCase()).not.toContain("friday");
    expect(r.dueDate?.getDay()).toBe(5); // Friday
    expect(r.matchedClient).toBe(true);
  });

  it("picks the longest client-name match (Owen Sound, not just Clark)", () => {
    const r = parseTaskCommand("reconcile June for Clark Pools and Spas Collingwood Inc", CLIENTS, NOW);
    expect(r.clientId).toBe(2);
  });

  it("handles no client gracefully", () => {
    const r = parseTaskCommand("call the accountant tomorrow", CLIENTS, NOW);
    expect(r.matchedClient).toBe(false);
    expect(r.clientId).toBeUndefined();
    expect(r.title.toLowerCase()).toContain("call the accountant");
    expect(r.dueDate && r.dueDate.getDate()).toBe(23);
  });

  it("detects high priority and strips the hint", () => {
    const r = parseTaskCommand("URGENT: remit payroll for Originality.AI Inc", CLIENTS, NOW);
    expect(r.priority).toBe("high");
    expect(r.clientId).toBe(3);
    expect(r.title.toLowerCase()).not.toContain("urgent");
  });

  it("defaults to medium priority and no date when none given", () => {
    const r = parseTaskCommand("review chart of accounts", CLIENTS, NOW);
    expect(r.priority).toBe("medium");
    expect(r.dueDate).toBeUndefined();
  });
});

describe("extractDueDate", () => {
  it("tomorrow", () => {
    const { dueDate } = extractDueDate("do it tomorrow", NOW);
    expect(dueDate?.getDate()).toBe(23);
  });
  it("in 3 days", () => {
    const { dueDate } = extractDueDate("follow up in 3 days", NOW);
    expect(dueDate?.getDate()).toBe(25);
  });
  it("by Jun 30", () => {
    const { dueDate } = extractDueDate("file by Jun 30", NOW);
    expect(dueDate?.getMonth()).toBe(5);
    expect(dueDate?.getDate()).toBe(30);
  });
  it("rolls a passed month-date to next year", () => {
    const { dueDate } = extractDueDate("by Jan 5", NOW);
    expect(dueDate?.getFullYear()).toBe(2027);
  });
});

describe("matchClient", () => {
  it("strips the 'for <client>' phrase from the title", () => {
    const { text, client } = matchClient("file HST for Originality.AI Inc", CLIENTS);
    expect(client?.id).toBe(3);
    expect(text.toLowerCase()).not.toContain("originality");
    expect(text.toLowerCase()).toContain("file hst");
  });
});
