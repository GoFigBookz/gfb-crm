/**
 * SEED STRATEGY SESSION — index the 2026-06-26 "Session Close Package" into the
 * firm Brain so the whole team (and Liv) can recall the strategic direction.
 * =============================================================================
 * Source: ChatGPT strategy session SES-2026-06-26-001 ("Innovation Finance"),
 *         relayed + closed by Markie. This captures the DURABLE, reusable
 *         decisions/lenses as firm Brain truths — not every line. The full
 *         package lives in Drive (shared Figgy<->ChatGPT folder).
 * Idempotent: guards on the sentinel label. Firm scope. Reversible (Markie can
 * edit/remove). Roster renames in the package are NOT applied here — they touch
 * shipped code and await Markie's confirmation.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";
import { addTruth } from "./brain-store";

const SOURCE = "ChatGPT strategy session SES-2026-06-26-001 (relayed + closed by Markie 2026-06-26)";
const SENTINEL = "Strategy — GoFIG direction (SES-2026-06-26-001)";

const RECORDS: { label: string; statement: string; category: string }[] = [
  {
    label: SENTINEL, category: "decision",
    statement: "STRATEGIC DIRECTION (SES-2026-06-26-001): GoFIG is evolving from a bookkeeping firm into a systems-driven ADVISORY practice that uses AI, automation and structured processes to increase client value while intentionally increasing Markie's freedom. Robotics, AI, AgeTech and emerging tech are TARGET INDUSTRIES, not the core business. New 'Innovation Finance' practice is incubated inside Launchpad until validated. Structure unchanged: stay under the existing numbered Canadian corp (no new corp/trade name/bank account yet); Phoenix Rising stays personal-only; Figgy stays the business platform.",
  },
  {
    label: "The Markie Filter (decision lens)", category: "decision",
    statement: "THE MARKIE FILTER — every future opportunity must pass it: (1) Does it increase freedom? (2) Can it be delivered asynchronously? (3) Does it leverage expertise rather than hours? (4) Can AI eventually automate most of the repetitive work? If not, reconsider. Apply this lens to new services, clients and builds.",
  },
  {
    label: "Innovation Finance (Launchpad initiative)", category: "strategy",
    statement: "INNOVATION FINANCE — GoFIG's highest-priority new service initiative, incubated in Launchpad until validated. A PREMIUM advisory practice helping innovative/AI/R&D companies become grant-ready, SR&ED-ready, financially organized and operationally prepared for growth. Candidate services: innovation & R&D bookkeeping, grant readiness, SR&ED readiness, funding documentation, AI-company bookkeeping, operational process design, innovation funding advisory, AI-enabled accounting workflows (all proposal-only through the review chain). Open: final public brand name. Supporting research: Canadian grants database, SR&ED knowledge system (citation-backed, kept current), pricing optimization, innovation funding workflows, AI documentation automation.",
  },
  {
    label: "GoFIG pricing & value philosophy", category: "decision",
    statement: "PRICING — GoFIG competes on EXPERTISE and OUTCOMES, not price. Clients buy confidence, compliance, better systems and strategic support — not bookkeeping hours. Innovation Finance is positioned as a premium advisory service. Success metric: increasing Markie's freedom WHILE increasing profitability. Proposed KPIs to surface later: Freedom Score, Client Value Score, AI Leverage Score, Innovation Readiness Score.",
  },
  {
    label: "Session Close Package process (standard)", category: "system",
    statement: "SESSION STANDARD — strategic sessions produce a Session Close Package and aren't final until Markie EXPLICITLY closes them. Future artifacts: Strategy Brief, Design Decision Record (DDR), Figgy Build Package (FBP), Knowledge Update (KU), Changelog. NOTE: numbering + the decision/knowledge registers already exist live (api/registers-router.ts: typed codes DEC/RES/SYS/GF/IDE/LL/IMP/PR + Brain mirror) — reuse those rather than building parallel systems; the one genuinely-new piece is a Session-Package importer.",
  },
];

export async function seedStrategySession(): Promise<void> {
  const db = getDb();
  try {
    const have = (await db.all(sql`SELECT id FROM brain_records WHERE scopeKind='firm' AND label=${SENTINEL} LIMIT 1`)) as any[];
    if (have.length) return; // already indexed
    for (const r of RECORDS) {
      await addTruth({ scope: { kind: "firm" }, label: r.label, statement: r.statement, category: r.category, sourceLabels: [SOURCE] });
    }
    console.log(`[strategy] indexed ${RECORDS.length} records from SES-2026-06-26-001`);
  } catch (e) {
    console.error("[strategy] seedStrategySession failed:", e instanceof Error ? e.message : e);
  }
}
