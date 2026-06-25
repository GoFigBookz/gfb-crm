/**
 * JON GILLHAM CONTROL BOOK — seed.
 * =============================================================================
 * Recreates the high-value, non-sensitive parts of Jon Gillham's "Business Entity
 * Management" control book into the CRM group_* tables so the firm can give Jon a
 * clean consolidated view instead of his tedious manual sheet:
 *   - Entities + corporate facts (incorporation #, BN, year-end, address, brands)
 *   - Current cap table / ownership structure (canonical, not the draft "Change?" tabs)
 *   - Dividend / profit-by-fiscal-year report (FY21–FY24; FY25 was a template dup, skipped)
 *   - Family salary / benefit tracker
 *
 * Figures transcribed verbatim from the shared book (2026-06-25). NON-SENSITIVE
 * ONLY — CRA filing access codes and bank account numbers are deliberately NOT stored.
 * Idempotent: seeds only when the group's book is empty (so manual edits aren't
 * clobbered); the /api/group-book/seed endpoint force-reseeds (delete + insert).
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients, groupEntities, groupOwnership, groupProfit, groupFamilyBenefit } from "../db/schema";
import { eq } from "drizzle-orm";

const GROUP = "Jon Gillham";

const ENTITIES: Array<{ name: string; match?: RegExp; op?: string; inc?: string; bn?: string; ye?: string; addr?: string; note?: string; order: number }> = [
  { name: "2303851 Ontario Inc", match: /2303851/i, inc: "2303851", bn: "847759909", ye: "Sep 30", addr: "3029 Maidstone Cres, Brights Grove, ON N0N1C0", note: "Hold Co", order: 1 },
  { name: "Adbank Inc.", match: /adbank/i, inc: "002597757", bn: "793523481", ye: "Sep 30", addr: "1 First St. Suite 220B, Collingwood ON L9Y 1A1", note: "No Activity", order: 2 },
  { name: "ListingEagle.com Inc", match: /listing\s*eagle/i, inc: "2520953", bn: "767302490", ye: "Sep 30", addr: "3029 Maidstone Cres, Brights Grove, ON N0N1C0", note: "Minimal Activity", order: 3 },
  { name: "Marketing Strategy Ventures Inc", match: /marketing\s*strategy|content\s*refined|\bMSV\b/i, op: "formerly Content Refined Inc", inc: "2724538", bn: "763289337", ye: "Sep 30", addr: "220B 1 First Street, Collingwood ON L9Y 1A1", note: "Exited - Minimal Activity", order: 4 },
  { name: "Motion Invest Inc", match: /motion\s*invest/i, inc: "2560628", bn: "728898321", ye: "Sep 30", addr: "220B 1 First Street, Collingwood ON L9Y 1A1", order: 5 },
  { name: "Seahorse Health Inc.", match: /seahorse/i, op: "OrgoneEnergy.com, HowToMoonshine.co, CozyFeather.com", inc: "2561240", bn: "728509522", ye: "Sep 30", addr: "220B 1 First Street, Collingwood ON L9Y 1A1", note: "No Activity", order: 6 },
  { name: "Fractal SAAS Inc", match: /fractal/i, op: "FirePermits.online, GeorgiaBurnPermits, petlicense.online, Passed.ai", inc: "2750934", bn: "739247070 RC0001", ye: "Sep 30", addr: "220B 1 First Street, Collingwood ON L9Y 1A1", order: 7 },
  { name: "Clark Pools and Spas Collingwood Inc", match: /clark.*colling/i, inc: "1000001017", bn: "770298602", ye: "Sep 30", addr: "Unit 17, 20 Balsam Street, Collingwood ON L9Y4H7", order: 8 },
  { name: "Clark Pools and Spas Owen Sound Inc", match: /clark.*(owen|sound)/i, inc: "1001447196", bn: "715666566", addr: "718028 Hwy 6, Owen Sound ON N4K 5N7", order: 9 },
  { name: "1000301144 Ontario Inc.", match: /1000301144|culbert/i, op: "Culberts Bakery", inc: "1000301144", bn: "705597706", ye: "Sep 30", addr: "220B 1 First Street, Collingwood ON L9Y 1A1", order: 10 },
  { name: "Originality.AI Inc", match: /originality/i, inc: "1000380932", bn: "786440610", ye: "Sep 30", addr: "220B 1 First Street, Collingwood ON L9Y 1A1", note: "Jon's Primary Focus", order: 11 },
  { name: "Riverside Fish and Chips", inc: "", note: "Ownership on file (not in master grid)", order: 12 },
  { name: "PhysCommerce LP", note: "KILLED — US Limited Partnership", order: 20 },
  { name: "Prime Compression", note: "KILLED", order: 21 },
  { name: "Calm Knight Inc", note: "KILLED", order: 22 },
  { name: "Neuro Toy Corp", note: "KILLED", order: 23 },
];

// Current ownership (canonical). pct = approx % of total shares; note carries the voting detail.
const OWN: Array<{ co: string; holder: string; type?: "individual" | "company"; shares?: string; cls?: string; pct?: number; note?: string }> = [
  { co: "2303851 Ontario Inc", holder: "Jonathan Gillham", pct: 100, cls: "Common" },
  { co: "Adbank Inc.", holder: "Jonathan Gillham", pct: 100, cls: "Class A Voting + Class B Dividend" },
  { co: "ListingEagle.com Inc", holder: "Stacey Gillham", pct: 100, cls: "Class A Voting + Class B Dividend" },
  { co: "Marketing Strategy Ventures Inc", holder: "2303851 Ontario Inc", type: "company", pct: 86.33, cls: "Class A Voting + Class B Dividend" },
  { co: "Marketing Strategy Ventures Inc", holder: "Madeleine Lambert", pct: 13.67, cls: "Class A Voting + Class B Dividend" },
  { co: "Motion Invest Inc", holder: "Jonathan Gillham", shares: "2220 Class A", pct: 55.5, note: "92.5% of voting (Class A)" },
  { co: "Motion Invest Inc", holder: "Kelley Van Boxmeer", shares: "180 Class A + 800 Class C", pct: 24.5 },
  { co: "Motion Invest Inc", holder: "Spencer Haws", shares: "800 Class C", pct: 20, note: "Long Tail Media LLC" },
  { co: "Seahorse Health Inc.", holder: "Jonathan Gillham", pct: 100, cls: "Class A Voting + Class B Dividend" },
  { co: "Fractal SAAS Inc", holder: "Jonathan Gillham", shares: "6000", pct: 60 },
  { co: "Fractal SAAS Inc", holder: "Andrew Rains", shares: "4000", pct: 40 },
  { co: "Clark Pools and Spas Collingwood Inc", holder: "Stacey Gillham", shares: "975 Class A", pct: 48.75, note: "97.5% of voting (Class A)" },
  { co: "Clark Pools and Spas Collingwood Inc", holder: "2303851 Ontario Inc", type: "company", shares: "975 Class B", pct: 48.75, note: "Non-voting / dividends" },
  { co: "Clark Pools and Spas Collingwood Inc", holder: "Chris Hawton", shares: "25 A + 25 B", pct: 2.5 },
  { co: "Originality.AI Inc", holder: "Jonathan Gillham", pct: 89.9, cls: "Class A Common Voting" },
  { co: "Originality.AI Inc", holder: "2303851 Ontario Inc", type: "company", pct: 0.1, cls: "Class B Non-Voting" },
  { co: "Originality.AI Inc", holder: "Niche Ventures (Spencer Haws)", type: "company", pct: 10, cls: "Class C Common Voting" },
  { co: "Riverside Fish and Chips", holder: "Lisa Smith", pct: 75, cls: "Class A Voting + Class B" },
  { co: "Riverside Fish and Chips", holder: "Jonathan Gillham", pct: 12.5, cls: "Class A Voting" },
  { co: "Riverside Fish and Chips", holder: "2303851 Ontario Inc", type: "company", pct: 12.5, cls: "Class B Non-Voting" },
];

// Dividend / profit report by fiscal year. company = canonical name; pct = the report's
// "Ownership" column (the group's share); ytd = fiscal-year-to-date profit; tax = tax liability.
type P = [string, number, number | null, number | null]; // [company, ownership%, ytdProfit, taxLiability]
const PROFIT: Record<string, P[]> = {
  "2024": [
    ["2303851 Ontario Inc", 100, -131066, -29490], ["Adbank Inc.", 100, 15829, 3562],
    ["Marketing Strategy Ventures Inc", 90, -40551, -9124], ["Seahorse Health Inc.", 100, -4187, -942],
    ["Motion Invest Inc", 53, -19929, -4484], ["ListingEagle.com Inc", 100, -2161, -486],
    ["Fractal SAAS Inc", 60, -54075, -12167], ["Clark Pools and Spas Collingwood Inc", 97.5, -93423, -21020],
    ["1000301144 Ontario Inc.", 50, 0, 0], ["Originality.AI Inc", 90, 32765, 7372],
    ["BrandBuilders", 50, -43102, -9698], ["StarCluster", 45, 0, 0],
  ],
  "2023": [
    ["2303851 Ontario Inc", 100, -230691, -51905], ["Adbank Inc.", 100, -14103, -3173],
    ["Marketing Strategy Ventures Inc", 90, -92769, -20873], ["Seahorse Health Inc.", 100, -106507, -23964],
    ["Motion Invest Inc", 53, 343623, 77315], ["ListingEagle.com Inc", 100, -2735, -615],
    ["Fractal SAAS Inc", 60, -44581, -10031], ["Clark Pools and Spas Collingwood Inc", 97.5, 338037, 76058],
    ["1000301144 Ontario Inc.", 50, -80139, -18031], ["Originality.AI Inc", 90, 598865, 134745],
    ["BrandBuilders", 50, 59849, 13466], ["StarCluster", 45, 1497, 337],
  ],
  "2022": [
    ["2303851 Ontario Inc", 100, 118142, 26582], ["Adbank Inc.", 100, 12303, 2768],
    ["Marketing Strategy Ventures Inc", 90, 977002, 219825], ["Seahorse Health Inc.", 100, 5474, 1232],
    ["Motion Invest Inc", 53, 448798, 100979], ["ListingEagle.com Inc", 100, 1026, 231],
    ["Fractal SAAS Inc", 60, -32623, -7340], ["Clark Pools and Spas Collingwood Inc", 97.5, 83668, 18825],
    ["1000301144 Ontario Inc.", 50, -300, -67], ["BrandBuilders", 50, 358097, 80572], ["StarCluster", 45, 3490, 785],
  ],
  "2021": [
    ["2303851 Ontario Inc", 100, -80939, null], ["Adbank Inc.", 100, 449886, 101224],
    ["Marketing Strategy Ventures Inc", 90, 311168, 70013], ["Seahorse Health Inc.", 100, -52690, -11855],
    ["Motion Invest Inc", 53, 452032, 101707], ["ListingEagle.com Inc", 100, 3712, 835],
    ["Fractal SAAS Inc", 60, -18891, -4250], ["BrandBuilders", 50, 40482, 9108], ["StarCluster", 45, -150, -34],
  ],
};

const FAMILY: Array<{ name: string; salary: number | null; alloc: string; comment?: string }> = [
  { name: "Jonathan Gillham", salary: 10000, alloc: "2303851 Ontario Inc (100%)", comment: "May need adjusting based on dividends from Motion Invest" },
  { name: "Stacey Gillham", salary: 8333.33, alloc: "2303851 Ontario Inc (100%)" },
  { name: "Madeleine Lambert", salary: 4750, alloc: "Marketing Strategy Ventures Inc (100%)" },
  { name: "Kelley Van Boxmeer", salary: 3666.67, alloc: "Motion Invest Inc (100%)", comment: "+ 10% net profit of Motion Invest (pass-through)" },
];

export async function seedJonControlBook(opts?: { force?: boolean }): Promise<{ seeded: boolean; entities: number } | void> {
  const db = getDb();
  try {
    const existing = (await db.select().from(groupEntities).where(eq(groupEntities.groupName, GROUP))) as any[];
    if (existing.length && !opts?.force) return { seeded: false, entities: existing.length };

    if (opts?.force) {
      await db.delete(groupEntities).where(eq(groupEntities.groupName, GROUP));
      await db.delete(groupOwnership).where(eq(groupOwnership.groupName, GROUP));
      await db.delete(groupProfit).where(eq(groupProfit.groupName, GROUP));
      await db.delete(groupFamilyBenefit).where(eq(groupFamilyBenefit.groupName, GROUP));
    }

    const cs = (await db.select().from(clients)) as any[];
    const findClient = (re?: RegExp) => (re ? cs.find((c) => re.test(c.name || ""))?.id ?? null : null);

    for (const e of ENTITIES) {
      await db.insert(groupEntities).values({
        groupName: GROUP, companyName: e.name, clientId: findClient(e.match),
        operatingName: e.op ?? null, incorporationNumber: e.inc ?? null, businessNumber: e.bn ?? null,
        yearEnd: e.ye ?? null, address: e.addr ?? null, statusNote: e.note ?? null, sortOrder: e.order,
      } as any);
    }
    for (const o of OWN) {
      await db.insert(groupOwnership).values({
        groupName: GROUP, companyName: o.co, holderName: o.holder, holderType: o.type ?? "individual",
        shares: o.shares ?? null, shareClass: o.cls ?? null, ownershipPct: o.pct ?? null, note: o.note ?? null,
      } as any);
    }
    for (const [fy, rows] of Object.entries(PROFIT)) {
      for (const [co, pct, ytd, tax] of rows) {
        await db.insert(groupProfit).values({ groupName: GROUP, companyName: co, fiscalYear: fy, ownershipPct: pct, ytdProfit: ytd, taxLiability: tax } as any);
      }
    }
    for (const f of FAMILY) {
      await db.insert(groupFamilyBenefit).values({ groupName: GROUP, personName: f.name, baseSalary: f.salary, allocation: f.alloc, comment: f.comment ?? null } as any);
    }

    console.log(`[jon-control-book] seeded ${ENTITIES.length} entities, ${OWN.length} ownership rows, profit FY${Object.keys(PROFIT).join("/")}`);
    return { seeded: true, entities: ENTITIES.length };
  } catch (err) {
    console.error("[jon-control-book] failed:", err instanceof Error ? err.message : err);
  }
}
