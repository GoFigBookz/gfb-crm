/**
 * HST PERIOD INFERENCE — map an HST filing task to a DEFAULT period to review.
 * Pure + testable. HONEST: this is a sensible default (calendar-aligned), not a
 * guarantee — filers with an off-calendar fiscal quarter/year differ, so the UI
 * keeps the dates editable. We default, we don't pretend precision we don't have.
 */
export type HstFreq = "monthly" | "quarterly" | "annual";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;
const lastDay = (y: number, m1: number) => new Date(y, m1, 0).getDate(); // m1 = 1..12

export function normalizeFreq(s?: string | null): HstFreq {
  const t = (s || "").toLowerCase();
  if (/month/.test(t)) return "monthly";
  if (/year|annual/.test(t)) return "annual";
  return "quarterly";
}

/** Is this task an HST/GST sales-tax filing task (so we should attach a review)? */
export function isHstFilingTask(title?: string | null): boolean {
  const t = (title || "").toLowerCase();
  if (!/\bhst\b|\bgst\b|sales tax/.test(t)) return false;
  // filing/return/remit intent (avoid matching e.g. "set up HST number")
  return /file|return|remit|pay|instal|filing|owe/.test(t) || /\breturn\b/.test(t) || t.trim() === "file hst";
}

/**
 * Default review window for a filing due on `dueDate`. The period is the span that
 * ENDED in the month before the due month (HST is generally due ~1 month after the
 * period end). Returns ISO start/end + a label.
 */
export function defaultHstRange(dueDate: Date, freq: HstFreq): { start: string; end: string; label: string } {
  // end = last day of the month before the due month
  let ey = dueDate.getFullYear();
  let em = dueDate.getMonth() + 1 - 1; // 1..12 of prior month
  if (em < 1) { em = 12; ey -= 1; }
  const end = ymd(ey, em, lastDay(ey, em));

  const monthsBack = freq === "annual" ? 12 : freq === "monthly" ? 1 : 3;
  // start = first day, monthsBack months earlier (inclusive)
  let sy = ey, sm = em - (monthsBack - 1);
  while (sm < 1) { sm += 12; sy -= 1; }
  const start = ymd(sy, sm, 1);

  const label = freq === "annual" ? `Annual ${ey}` : freq === "monthly" ? `${start} period` : `Quarter ending ${end}`;
  return { start, end, label };
}

/**
 * FISCAL-QUARTER HST RANGE — for filers whose HST quarters follow their FISCAL
 * year, not the calendar. `fiscalYearEndMonth` is the month (1..12) the fiscal year
 * ENDS (e.g. 11 = November 30). Fiscal quarters then end at FYE+3, +6, +9, +12.
 *  - Nov 30 FYE → quarters end Feb / May / Aug / Nov.
 * Returns the most-recently-ENDED fiscal quarter as of `asOf` (so on the due date,
 * which falls ~1 month after period end, you get the quarter that just closed).
 * Falls back to the calendar default when no FYE is set or freq isn't quarterly.
 */
export function fiscalHstRange(
  asOf: Date,
  freq: HstFreq,
  fiscalYearEndMonth?: number | null,
): { start: string; end: string; label: string; quarter?: number } {
  const fye = Number(fiscalYearEndMonth);
  if (freq !== "quarterly" || !Number.isInteger(fye) || fye < 1 || fye > 12) {
    return defaultHstRange(asOf, freq);
  }
  // The 4 fiscal-quarter END months (1..12), in fiscal order Q1..Q4.
  const endMonths = [3, 6, 9, 12].map((o) => ((fye + o - 1) % 12) + 1);
  // Build candidate quarter-ends spanning the year around asOf, pick the latest
  // whose end-of-month date is <= asOf (the most recently completed quarter).
  let best: { y: number; m: number; q: number } | null = null;
  let bestTime = -Infinity;
  for (let y = asOf.getFullYear() - 1; y <= asOf.getFullYear() + 1; y++) {
    for (let qi = 0; qi < 4; qi++) {
      const m = endMonths[qi];
      const endDate = new Date(y, m - 1, lastDay(y, m), 23, 59, 59);
      if (endDate.getTime() <= asOf.getTime() && endDate.getTime() > bestTime) {
        bestTime = endDate.getTime();
        best = { y, m, q: qi + 1 };
      }
    }
  }
  if (!best) return defaultHstRange(asOf, freq);
  const end = ymd(best.y, best.m, lastDay(best.y, best.m));
  // start = first day, 2 months before the end month (a 3-month quarter)
  let sy = best.y, sm = best.m - 2;
  while (sm < 1) { sm += 12; sy -= 1; }
  const start = ymd(sy, sm, 1);
  return { start, end, label: `Fiscal Q${best.q} ending ${end}`, quarter: best.q };
}
