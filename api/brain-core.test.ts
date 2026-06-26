import { describe, it, expect } from "vitest";
import {
  tokenize, scopeMatches, scoreRecord, retrieve, answerFromBrain,
  truthFromAnswer, renderAnswer, type BrainRecord, type Scope,
} from "./brain-core";

const clarkOS: Scope = { kind: "client", clientId: 5077 };
const clarkCW: Scope = { kind: "client", clientId: 5076 };
const firm: Scope = { kind: "firm" };
const personal: Scope = { kind: "personal" };

function rec(p: Partial<BrainRecord> & { id: string; text: string; scope: Scope }): BrainRecord {
  return { layer: "truth", label: "Rec", status: "approved", ...p } as BrainRecord;
}

const RECORDS: BrainRecord[] = [
  rec({ id: "t1", scope: { kind: "client", clientId: 9001 }, label: "Client Profile", category: "hst",
        text: "Studio Lella files HST quarterly.", sourceLabels: ["SOP-03"] }),
  rec({ id: "t2", scope: clarkOS, label: "Coding Rule", category: "coding",
        text: "Clark OS parts go to Parts/Goods COGS account 1150040016." }),
  rec({ id: "t3", scope: clarkCW, label: "Coding Rule", category: "coding",
        text: "Clark CW meals go to Meals and entertainment account 142." }),
  rec({ id: "d1", scope: firm, layer: "source", label: "Reconcile SOP",
        text: "Reconcile the next month after the last statement ending date; use View statements." }),
  rec({ id: "m1", scope: clarkOS, layer: "memory", status: "draft", label: "Note",
        text: "Maybe Clark OS uses a new Visa card — unconfirmed." }),
  rec({ id: "p1", scope: personal, label: "Personal", text: "Markie's dentist appointment is in July." }),
];

describe("tokenize", () => {
  it("drops stopwords and short tokens", () => {
    expect(tokenize("What is the HST process?")).toEqual(["hst", "process"]);
  });
});

describe("scopeMatches — isolation boundary", () => {
  it("same client matches, different client does not", () => {
    expect(scopeMatches(clarkOS, clarkOS)).toBe(true);
    expect(scopeMatches(clarkOS, clarkCW)).toBe(false);
  });
  it("client never matches firm or personal", () => {
    expect(scopeMatches(clarkOS, firm)).toBe(false);
    expect(scopeMatches(personal, firm)).toBe(false);
    expect(scopeMatches(firm, firm)).toBe(true);
    expect(scopeMatches(personal, personal)).toBe(true);
  });
});

describe("scoreRecord", () => {
  it("scores higher when more query terms are covered", () => {
    const r = RECORDS[0];
    const hi = scoreRecord(tokenize("HST quarterly"), r);
    const lo = scoreRecord(tokenize("payroll deadline"), r);
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBe(0);
  });
});

describe("retrieve — never crosses scopes", () => {
  it("a Clark OS query cannot return Clark CW or personal records", () => {
    const out = retrieve("coding account", clarkOS, RECORDS);
    expect(out.length).toBeGreaterThan(0);
    for (const m of out) {
      expect(m.record.scope.kind).toBe("client");
      expect((m.record.scope as any).clientId).toBe(5077);
    }
  });
  it("a personal query never returns firm/client data", () => {
    const out = retrieve("appointment", personal, RECORDS);
    expect(out.every((m) => m.record.scope.kind === "personal")).toBe(true);
  });
});

describe("answerFromBrain — answer from approved truth, else ask", () => {
  it("answers a known client fact with citation + confidence", () => {
    const a = answerFromBrain("What is the HST process?", { kind: "client", clientId: 9001 }, RECORDS);
    expect(a.answered).toBe(true);
    expect(a.text).toContain("quarterly");
    expect(a.confidence).toBeGreaterThan(50);
    expect(a.citations.map((c) => c.label)).toContain("Client Profile");
  });

  it("does NOT answer when only a draft/memory record matches — files a question", () => {
    const a = answerFromBrain("What Visa card does Clark OS use?", clarkOS, RECORDS);
    expect(a.answered).toBe(false);
    expect(a.missingInfo).toBeTruthy();
    expect(a.missingInfo!.question).toMatch(/Visa/i);
  });

  it("does NOT answer when nothing is in scope — never invents", () => {
    const a = answerFromBrain("HST process", clarkCW, RECORDS);
    expect(a.answered).toBe(false);
    expect(a.missingInfo).toBeTruthy();
  });

  it("an approved-truth answer for one client cannot be served to another (isolation)", () => {
    const a = answerFromBrain("HST quarterly process", clarkOS, RECORDS);
    // the HST truth belongs to client 9001, so Clark OS must NOT get it
    expect(a.answered).toBe(false);
  });
});

describe("learning loop — answered question becomes truth", () => {
  it("truthFromAnswer produces an approved truth record the brain can then cite", () => {
    const t = truthFromAnswer({ id: "t-new", scope: clarkOS, label: "Coding Rule",
      statement: "Clark OS Clover sales post to Sales - Retail (4000).", category: "coding", sourceLabels: ["Markie 2026-06-26"] });
    expect(t.layer).toBe("truth");
    expect(t.status).toBe("approved");
    const a = answerFromBrain("Where do Clover sales post?", clarkOS, [...RECORDS, t]);
    expect(a.answered).toBe(true);
    expect(a.text).toContain("Sales - Retail");
  });
});

describe("renderAnswer", () => {
  it("renders a sourced one-liner", () => {
    const a = answerFromBrain("HST process", { kind: "client", clientId: 9001 }, RECORDS);
    const line = renderAnswer(a);
    expect(line).toMatch(/Source:/);
    expect(line).toMatch(/%/);
  });
});
