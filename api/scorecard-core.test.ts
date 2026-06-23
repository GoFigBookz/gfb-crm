import { describe, it, expect } from "vitest";
import { scoreAgents, type FindingRow } from "./scorecard-core";

const NOW = Date.UTC(2026, 5, 23);
const daysAgo = (n: number) => NOW - n * 24 * 60 * 60 * 1000;

describe("scoreAgents", () => {
  it("computes acceptance rate, pending, and grade per agent", () => {
    const rows: FindingRow[] = [
      { agentName: "Fig", status: "approved", confidence: 0.9, createdAt: daysAgo(1) },
      { agentName: "Fig", status: "approved", confidence: 0.8, createdAt: daysAgo(2) },
      { agentName: "Fig", status: "approved", confidence: 0.95, createdAt: daysAgo(3) },
      { agentName: "Fig", status: "dismissed", confidence: 0.4, createdAt: daysAgo(4) },
      { agentName: "Fig", status: "new", confidence: 0.7, createdAt: daysAgo(1) },
    ];
    const sc = scoreAgents(rows, NOW);
    const fig = sc.agents.find((a) => a.agent === "Fig")!;
    expect(fig.approved).toBe(3);
    expect(fig.dismissed).toBe(1);
    expect(fig.pending).toBe(1);
    expect(fig.reviewed).toBe(4);
    expect(fig.acceptanceRate).toBe(75); // 3/4
    expect(fig.grade).toBe("good");
    expect(fig.avgConfidence).toBeGreaterThan(0);
  });

  it("normalizes 0-1 and 0-100 confidence the same way", () => {
    const a = scoreAgents([{ agentName: "X", status: "new", confidence: 0.5, createdAt: NOW }], NOW);
    const b = scoreAgents([{ agentName: "X", status: "new", confidence: 50, createdAt: NOW }], NOW);
    expect(a.agents[0].avgConfidence).toBe(50);
    expect(b.agents[0].avgConfidence).toBe(50);
  });

  it("marks grade n/a when there's too little reviewed data", () => {
    const sc = scoreAgents([
      { agentName: "Tess", status: "approved", confidence: 0.9, createdAt: NOW },
      { agentName: "Tess", status: "new", confidence: 0.9, createdAt: NOW },
    ], NOW);
    const t = sc.agents.find((a) => a.agent === "Tess")!;
    expect(t.grade).toBe("n/a"); // only 1 reviewed (< 3)
  });

  it("detects an upward drift (recent better than prior)", () => {
    const rows: FindingRow[] = [
      // prior period: 1/2 accepted = 50%
      { agentName: "Sage", status: "approved", confidence: 0.6, createdAt: daysAgo(90) },
      { agentName: "Sage", status: "dismissed", confidence: 0.6, createdAt: daysAgo(80) },
      // recent: 3/3 = 100%
      { agentName: "Sage", status: "approved", confidence: 0.9, createdAt: daysAgo(5) },
      { agentName: "Sage", status: "approved", confidence: 0.9, createdAt: daysAgo(4) },
      { agentName: "Sage", status: "approved", confidence: 0.9, createdAt: daysAgo(3) },
    ];
    const sc = scoreAgents(rows, NOW);
    expect(sc.agents.find((a) => a.agent === "Sage")!.trend).toBe("up");
  });

  it("rolls up an overall acceptance rate", () => {
    const sc = scoreAgents([
      { agentName: "A", status: "approved", confidence: null, createdAt: NOW },
      { agentName: "B", status: "dismissed", confidence: null, createdAt: NOW },
    ], NOW);
    expect(sc.overall.reviewed).toBe(2);
    expect(sc.overall.acceptanceRate).toBe(50);
  });

  it("handles no data cleanly", () => {
    const sc = scoreAgents([], NOW);
    expect(sc.agents).toEqual([]);
    expect(sc.overall.acceptanceRate).toBeNull();
  });
});
