/**
 * SEED ROCCO-GROUP HST PERIODS — set the three companies' HST filing to follow
 * their FISCAL year, not the calendar.
 * =============================================================================
 * Markie (2026-06-26): "change his quarterly reporting to his fiscal reporting —
 * it matches his fiscal year. This is the second quarter; it ends May 31."
 *
 * A fiscal quarter ending May 31, where that quarter is Q2, only lines up with a
 * NOVEMBER 30 fiscal year-end (quarters then end Feb / May / Aug / Nov). So we set
 * fiscalYearEndMonth = 11 and hstFilingFrequency = 'quarterly' for the group. The
 * Pre-HST review + the HST filing task then default to the correct fiscal quarter
 * (Q2 = Mar 1 – May 31) instead of the calendar quarter.
 *
 * HONEST NOTE / NEEDS CONFIRM: Markie said the period "starts February 1" — but
 * Feb 1 → May 31 is FOUR months, not a quarter. With a Nov 30 year-end the real Q2
 * is Mar 1 – May 31 (Q1 is the one that ends Feb 28). This seed uses the Nov 30
 * inference; if the actual fiscal year-end differs, change YEAR_END_MONTH below (or
 * set it per client in the UI) and the periods recompute. Idempotent; config only,
 * never touches the books.
 * =============================================================================
 */
import { getDb } from "./queries/connection";
import { sql } from "drizzle-orm";

// Fiscal year-end month (1..12). 11 = November 30 (the inference that makes "Q2
// ending May 31" correct). Change here if Rocco confirms a different year-end.
const YEAR_END_MONTH = 11;
const PATTERNS = ["%ovita%", "%alderson%"]; // Ovita Construction, Ovita Holdings, Alderson Developments

export async function seedRoccoHst(): Promise<void> {
  const db = getDb();
  try {
    let touched = 0;
    for (const pat of PATTERNS) {
      const rows = (await db.all(sql`
        SELECT id, name FROM clients
        WHERE lower(name) LIKE ${pat} OR lower(company) LIKE ${pat}
      `)) as any[];
      for (const c of rows) {
        await db.run(sql`
          UPDATE clients
          SET hstFilingFrequency = 'quarterly', fiscalYearEndMonth = ${YEAR_END_MONTH}
          WHERE id = ${c.id}
        `);
        touched++;
        console.log(`[rocco-hst] set ${c.name} (id ${c.id}) → quarterly, FYE month ${YEAR_END_MONTH}`);
      }
    }
    if (!touched) console.warn("[rocco-hst] no Ovita/Alderson clients found — nothing to set");
  } catch (e) {
    console.error("[rocco-hst] seedRoccoHst failed:", e instanceof Error ? e.message : e);
  }
}
