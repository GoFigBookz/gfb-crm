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
