/**
 * BANKED HOURS — PURE CORE
 * =============================================================================
 * A per-employee ledger of banked (lieu / saved) hours. Each entry is a signed
 * hours movement: + when hours are BANKED (accrued / opening balance), − when
 * hours are TAKEN or PAID OUT (redeemed). The balance is just the running sum.
 *
 * This replaces the client's old Google-sheet banked-hours tab: ONE shared
 * ledger the client updates and the bookkeeper views/updates, that syncs into
 * payroll (a payout writes a redeem entry tied to the pay run).
 *
 * No I/O — just the math, so it can be unit-tested.
 * =============================================================================
 */

export type BankedKind = "opening" | "accrue" | "redeem" | "adjust";

export interface BankedEntry {
  id?: number;
  entryDate: string | Date;   // when it applies
  hours: number;              // signed: + banked, − taken/paid
  kind: BankedKind;
  note?: string | null;
  source?: string | null;     // manual | client | payroll | import
  payRunId?: number | null;
}

export interface LedgerRow extends BankedEntry {
  runningBalance: number;
}

export interface BankedSummary {
  balance: number;            // current banked-hours balance
  totalBanked: number;        // sum of all positive movements
  totalTaken: number;         // sum of all negative movements, as a positive number
  entryCount: number;
  lastActivity: string | null; // ISO date of the most recent entry
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toTime(d: string | Date): number {
  const t = new Date(d as any).getTime();
  return Number.isFinite(t) ? t : 0;
}

function toISO(d: string | Date): string {
  const dt = new Date(d as any);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : String(d);
}

/** Sort entries oldest→newest, then attach a running balance to each. */
export function buildLedger(entries: BankedEntry[]): LedgerRow[] {
  const sorted = [...entries].sort((a, b) => {
    const t = toTime(a.entryDate) - toTime(b.entryDate);
    return t !== 0 ? t : (a.id ?? 0) - (b.id ?? 0);
  });
  let bal = 0;
  return sorted.map((e) => {
    bal = round2(bal + (e.hours || 0));
    return { ...e, runningBalance: bal };
  });
}

/** Roll a single employee's entries up to a balance + totals. */
export function summarize(entries: BankedEntry[]): BankedSummary {
  let totalBanked = 0;
  let totalTaken = 0;
  let last = 0;
  for (const e of entries) {
    const h = e.hours || 0;
    if (h >= 0) totalBanked += h; else totalTaken += -h;
    last = Math.max(last, toTime(e.entryDate));
  }
  return {
    balance: round2(totalBanked - totalTaken),
    totalBanked: round2(totalBanked),
    totalTaken: round2(totalTaken),
    entryCount: entries.length,
    lastActivity: last ? new Date(last).toISOString() : null,
  };
}

/**
 * Normalize a redemption (hours TAKEN/paid) to a negative movement, regardless
 * of whether the caller passed a positive "took 8 hours" or a signed −8.
 */
export function redeemHours(hoursTaken: number): number {
  return -Math.abs(hoursTaken || 0);
}

/** Normalize a banked/accrued amount to a positive movement. */
export function accrueHours(hoursBanked: number): number {
  return Math.abs(hoursBanked || 0);
}

export interface EntryValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a proposed movement against the current balance. Redeeming more than
 * is banked is allowed (some shops let it go negative) but WARNED, so neither the
 * client nor the bookkeeper does it by accident.
 */
export function validateMovement(currentBalance: number, hours: number, kind: BankedKind): EntryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(hours) || hours === 0) errors.push("Enter a non-zero number of hours.");
  if (Math.abs(hours) > 2000) errors.push("That hours amount looks too large — please check it.");
  if (kind === "redeem" && hours > 0) warnings.push("A redemption should reduce the balance — it will be recorded as hours taken.");
  const projected = round2(currentBalance + (kind === "redeem" ? redeemHours(hours) : hours));
  if (projected < 0) warnings.push(`This takes the balance negative (${projected}h). The employee will owe banked hours back.`);
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Parse pasted rows from the client's old payroll sheet into opening entries.
 * Accepts loose lines like "Haight, Chris   12.5" or "Chris Haight\t8" — a name
 * and a number. Returns one opening-balance movement per parsed row.
 */
export function parseOpeningBalances(text: string): { name: string; hours: number }[] {
  const out: { name: string; hours: number }[] = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // last number on the line = the balance; everything before = the name
    const m = line.match(/^(.*?)[\s,;\t]+(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const name = m[1].replace(/[\t,;]+/g, " ").replace(/\s+/g, " ").trim();
    const hours = parseFloat(m[2]);
    if (!name || !Number.isFinite(hours)) continue;
    out.push({ name, hours });
  }
  return out;
}
