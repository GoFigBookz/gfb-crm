/**
 * SELECTIVE PAINTING — start the year-end review (Markie 2026-06-28 "set it up").
 * =============================================================================
 * Markie asked to set up a year-end package for Selective Painting. The app's
 * "Start a year-end" button does this in one click; this idempotent boot step does
 * the same server-side so it's already started + the checklist laid out when he opens
 * the Compliance tab. Matches the client by name, computes the most-recently-COMPLETED
 * fiscal year from its fiscal-year-end month (default Dec), and seeds the standard
 * checklist. Read-only otherwise — nothing posts. Safe to leave in: skips if a review
 * for that client+year already exists.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { clients, yearEndReviews, yearEndItems } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { YEAR_END_CHECKLIST, fiscalYearEndDate } from "./year-end-core";

/**
 * The most-recently-COMPLETED fiscal year as of `now` for a given FYE month. If this
 * calendar year's year-end has already passed, that's the year; otherwise last year.
 * Pure + deterministic so it's unit-testable.
 */
export function mostRecentCompletedFiscalYear(now: Date, fiscalYearEndMonth?: number | null): number {
  const y = now.getUTCFullYear();
  const thisYearEnd = new Date(fiscalYearEndDate(y, fiscalYearEndMonth) + "T00:00:00Z");
  return thisYearEnd.getTime() <= now.getTime() ? y : y - 1;
}

/** Start a year-end review for the first client whose name/company matches `like`. */
export async function ensureYearEndStartedForClient(like: string): Promise<void> {
  const db = getDb();
  try {
    const cs = (await db.select().from(clients)) as any[];
    const k = like.toLowerCase();
    const client = cs.find((c) => `${c.name || ""} ${c.company || ""}`.toLowerCase().includes(k));
    if (!client) { console.warn(`[year-end-seed] no client matched "${like}" — skipping`); return; }

    const fyeMonth = client.fiscalYearEndMonth ?? 12;
    const fy = mostRecentCompletedFiscalYear(new Date(), fyeMonth);
    const fiscalYearEnd = fiscalYearEndDate(fy, fyeMonth);

    const existing = await db.select().from(yearEndReviews)
      .where(and(eq(yearEndReviews.clientId, client.id), eq(yearEndReviews.fiscalYear, fy)));
    if (existing[0]) return; // already started — leave it

    const [review] = await db.insert(yearEndReviews).values({
      clientId: client.id, fiscalYear: fy, fiscalYearEnd, status: "in_progress",
      accountantName: client.accountantName ?? null, accountantEmail: client.accountantEmail ?? null,
      startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }).returning();

    let order = 0;
    for (const def of YEAR_END_CHECKLIST) {
      await db.insert(yearEndItems).values({
        reviewId: (review as any).id, itemKey: def.key, label: def.label, phase: def.phase,
        done: false, na: false, sortOrder: order++, updatedAt: new Date(),
      });
    }
    console.log(`[year-end-seed] started FY${fy} year-end for "${client.name}" (client ${client.id})`);
  } catch (e) {
    console.error("[year-end-seed] failed:", e instanceof Error ? e.message : e);
  }
}

export async function seedSelectivePaintingYearEnd(): Promise<void> {
  // The year-end TEST clients Markie named (2026-06-28): Selective Painting + Universal
  // Construction. Start both so the package is ready to test on each.
  await ensureYearEndStartedForClient("selective");
  await ensureYearEndStartedForClient("universal construction");
}
