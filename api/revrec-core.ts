/**
 * REVENUE RECOGNITION (WIP) — PURE CORE
 * =============================================================================
 * Percentage-of-completion (POC) revenue recognition under ASPE 3400 / the
 * input (cost-to-cost or %-entered) method. NO I/O, NO QBO, NO db — just the
 * math + the journal-entry shapes, so it can be unit-tested against the Excel
 * prototype that Markie validated for Clark Pools Owen Sound.
 *
 * Definitions (implement EXACTLY — these match the prototype):
 *   revenueEarnedToDate   = contractValue * pctComplete
 *   revenueThisPeriod     = contractValue * (pctComplete - priorPct)
 *   contractAsset         = max(earnedToDate - invoicedToDate, 0)   (underbilling)
 *   deferredRevenue       = max(invoicedToDate - earnedToDate, 0)   (overbilling)
 *
 * Carry-in: a project that started before the module went live carries an
 * openingPct (cumulative % already recognised) and openingInvoiced. The first
 * tracked period treats those as the "prior" baseline so we never double-count
 * revenue that was already on the books.
 *
 * Everything is tax-neutral: revenue recognition moves the GL between Contract
 * Asset / Revenue / Deferred Revenue only. No HST/GST ever touches these JEs.
 * =============================================================================
 */

export type Money = number;

/** Round to cents — every dollar figure that leaves the core is 2dp. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Clamp a percentage into [0, 1]. Accepts 0..1; callers pass fractions. */
export function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

export interface ProjectInput {
  projectId: number;
  name: string;
  customerJob?: string | null;
  contractValue: Money;
  /** Cumulative % complete recognised BEFORE the first tracked period (0..1). */
  openingPct?: number | null;
  /** Billings to the customer BEFORE the first tracked period. */
  openingInvoiced?: Money | null;
}

export interface ProgressInput {
  periodKey: string; // "YYYY-MM"
  /** Cumulative % complete AT THE END of this period (0..1). */
  pctComplete: number;
  /** Cumulative billings to the customer through the end of this period. */
  invoicedToDate?: Money | null;
}

export interface PeriodResult {
  periodKey: string;
  pctComplete: number;       // cumulative, clamped 0..1
  priorPct: number;          // cumulative through prior period
  contractValue: Money;
  earnedToDate: Money;       // contractValue * pctComplete
  revenueThisPeriod: Money;  // contractValue * (pctComplete - priorPct)
  invoicedToDate: Money;
  contractAsset: Money;      // underbilling (asset)
  deferredRevenue: Money;    // overbilling (liability)
}

/**
 * Build the period-by-period POC schedule for one project. `progress` rows are
 * cumulative snapshots; they're sorted by periodKey so carry-forward is correct
 * regardless of insert order. Missing invoicedToDate carries the prior value
 * forward (billings don't reset).
 */
export function buildProjectSchedule(project: ProjectInput, progress: ProgressInput[]): PeriodResult[] {
  const rows = [...progress].sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const cv = project.contractValue || 0;
  let priorPct = clampPct(project.openingPct ?? 0);
  let priorInvoiced = project.openingInvoiced ?? 0;
  const out: PeriodResult[] = [];

  for (const r of rows) {
    const pct = clampPct(r.pctComplete);
    const invoiced = r.invoicedToDate == null ? priorInvoiced : r.invoicedToDate;
    const earned = round2(cv * pct);
    // revenueThisPeriod uses the raw delta so a correction (pct going down) shows
    // a negative recovery rather than being silently floored.
    const revenueThisPeriod = round2(cv * (pct - priorPct));
    const contractAsset = round2(Math.max(earned - invoiced, 0));
    const deferredRevenue = round2(Math.max(invoiced - earned, 0));
    out.push({
      periodKey: r.periodKey,
      pctComplete: pct,
      priorPct,
      contractValue: cv,
      earnedToDate: earned,
      revenueThisPeriod,
      invoicedToDate: round2(invoiced),
      contractAsset,
      deferredRevenue,
    });
    priorPct = pct;
    priorInvoiced = invoiced;
  }
  return out;
}

/** The latest period state for a project (or null if no progress yet). */
export function latestPeriod(schedule: PeriodResult[]): PeriodResult | null {
  return schedule.length ? schedule[schedule.length - 1] : null;
}

// ===========================================================================
// JOURNAL ENTRIES (POC accrual + reversal)
// ===========================================================================

export type RrAccountKey = "contract_asset" | "revenue" | "deferred_revenue";

export interface JeLine {
  accountKey: RrAccountKey;
  debit: Money;
  credit: Money;
  customerJob?: string | null;
  memo: string;
}

export interface GeneratedJe {
  kind: "accrual" | "reversal";
  date: string; // "YYYY-MM-DD"
  periodKey: string;
  lines: JeLine[];
  totalDebit: Money;
  totalCredit: Money;
  balanced: boolean;
}

export interface JeGenerationOptions {
  /**
   * If deposits/progress billings were booked straight to a Revenue account
   * (rather than a deferred-revenue liability), we must move the overbilling
   * back OUT of revenue into Deferred Revenue. If they were already booked to a
   * liability, that second entry would double-count — so it's gated.
   */
  depositsBookedToRevenue: boolean;
}

/** First day of the month AFTER the given "YYYY-MM" period — the reversal date. */
export function firstDayOfNextPeriod(periodKey: string): string {
  const [y, m] = periodKey.split("-").map((s) => parseInt(s, 10));
  const ny = m >= 12 ? y + 1 : y;
  const nm = m >= 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** Last calendar day of the given "YYYY-MM" period — the accrual date. */
export function lastDayOfPeriod(periodKey: string): string {
  const [y, m] = periodKey.split("-").map((s) => parseInt(s, 10));
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Generate the accrual JE (and its reversal) for one project-period from the
 * computed PeriodResult. Returns [] when there is nothing to book (both the
 * contract asset and deferred revenue are zero).
 *
 * Entry 1 (always, when contractAsset > 0): Dr Contract Asset / Cr Revenue.
 * Entry 2 (only when depositsBookedToRevenue && deferredRevenue > 0):
 *   Dr Revenue / Cr Deferred Revenue.
 * Both land in ONE accrual JE dated period-end; the reversal flips every line
 * and is dated the first day of the next period.
 */
export function generateJeForPeriod(
  period: PeriodResult,
  opts: JeGenerationOptions,
): { accrual: GeneratedJe; reversal: GeneratedJe } | null {
  const lines: JeLine[] = [];
  const job = period_customerJobOf(period);

  if (period.contractAsset > 0) {
    lines.push({ accountKey: "contract_asset", debit: period.contractAsset, credit: 0, customerJob: job, memo: `WIP accrual ${period.periodKey} — underbilling` });
    lines.push({ accountKey: "revenue", debit: 0, credit: period.contractAsset, customerJob: job, memo: `WIP accrual ${period.periodKey} — revenue earned not yet billed` });
  }
  if (opts.depositsBookedToRevenue && period.deferredRevenue > 0) {
    lines.push({ accountKey: "revenue", debit: period.deferredRevenue, credit: 0, customerJob: job, memo: `WIP deferral ${period.periodKey} — overbilling` });
    lines.push({ accountKey: "deferred_revenue", debit: 0, credit: period.deferredRevenue, customerJob: job, memo: `WIP deferral ${period.periodKey} — billed ahead of work` });
  }

  if (lines.length === 0) return null;

  const accrual = sealJe("accrual", lastDayOfPeriod(period.periodKey), period.periodKey, lines);
  const reversal = sealJe(
    "reversal",
    firstDayOfNextPeriod(period.periodKey),
    period.periodKey,
    lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit, memo: l.memo.replace("WIP ", "WIP reversal ") })),
  );
  return { accrual, reversal };
}

function period_customerJobOf(_period: PeriodResult): string | null {
  // customerJob is carried on the JE caller side (project), not the period row;
  // kept as a hook so lines always have the field even before wiring.
  return null;
}

function sealJe(kind: "accrual" | "reversal", date: string, periodKey: string, lines: JeLine[]): GeneratedJe {
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { kind, date, periodKey, lines, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.005 };
}

/**
 * Stamp the project's Customer:Job onto every line of a generated JE pair.
 * (Done here so the pure period math stays job-agnostic.)
 */
export function tagJeWithJob(je: GeneratedJe, customerJob: string | null | undefined): GeneratedJe {
  if (!customerJob) return je;
  return { ...je, lines: je.lines.map((l) => ({ ...l, customerJob })) };
}

// ===========================================================================
// VALIDATION (pre-post gate)
// ===========================================================================

export interface AccountMapResolved {
  contract_asset?: string | null;
  revenue?: string | null;
  deferred_revenue?: string | null;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Pre-post validation. Nothing posts to QBO unless this returns ok. Checks:
 * debits=credits, every account key used is mapped to a real QBO account id,
 * and no negative amounts. `period` may be null for a no-op (nothing to post).
 */
export function validateForPosting(
  je: GeneratedJe | null,
  accountMap: AccountMapResolved,
): ValidationResult {
  const errors: string[] = [];
  if (!je) return { ok: false, errors: ["Nothing to post for this period."] };
  if (!je.balanced) errors.push(`Journal entry is out of balance (debits ${je.totalDebit} ≠ credits ${je.totalCredit}).`);
  const keysUsed = new Set(je.lines.map((l) => l.accountKey));
  for (const key of keysUsed) {
    if (!accountMap[key]) errors.push(`No QBO account mapped for "${key}". Set the account mapping before posting.`);
  }
  for (const l of je.lines) {
    if (l.debit < 0 || l.credit < 0) errors.push(`Negative amount on a ${l.accountKey} line — corrections must be re-entered as a positive reversing period.`);
  }
  return { ok: errors.length === 0, errors };
}

// ===========================================================================
// PORTFOLIO / CALENDAR ROLLUPS
// ===========================================================================

export interface ProjectRollup {
  projectId: number;
  name: string;
  customerJob?: string | null;
  contractValue: Money;
  pctComplete: number;
  earnedToDate: Money;
  invoicedToDate: Money;
  contractAsset: Money;
  deferredRevenue: Money;
  remainingToEarn: Money; // contractValue - earnedToDate
}

export function rollupProject(project: ProjectInput, schedule: PeriodResult[]): ProjectRollup {
  const last = latestPeriod(schedule);
  const cv = project.contractValue || 0;
  const earned = last?.earnedToDate ?? round2(cv * clampPct(project.openingPct ?? 0));
  const invoiced = last?.invoicedToDate ?? (project.openingInvoiced ?? 0);
  return {
    projectId: project.projectId,
    name: project.name,
    customerJob: project.customerJob ?? null,
    contractValue: cv,
    pctComplete: last?.pctComplete ?? clampPct(project.openingPct ?? 0),
    earnedToDate: earned,
    invoicedToDate: round2(invoiced),
    contractAsset: last?.contractAsset ?? round2(Math.max(earned - invoiced, 0)),
    deferredRevenue: last?.deferredRevenue ?? round2(Math.max(invoiced - earned, 0)),
    remainingToEarn: round2(cv - earned),
  };
}

/**
 * Full-year revenue calendar: revenueThisPeriod per month across all projects,
 * for a fiscal year. `months` is the ordered list of period keys to show (so a
 * non-calendar fiscal year-end works). Projects contribute their period delta
 * where present, 0 otherwise.
 */
export function buildRevenueCalendar(
  months: string[],
  perProject: { projectId: number; name: string; schedule: PeriodResult[] }[],
): { months: string[]; rows: { projectId: number; name: string; byMonth: Money[]; total: Money }[]; totalsByMonth: Money[]; grandTotal: Money } {
  const rows = perProject.map((p) => {
    const byMonth = months.map((m) => {
      const hit = p.schedule.find((s) => s.periodKey === m);
      return hit ? hit.revenueThisPeriod : 0;
    });
    return { projectId: p.projectId, name: p.name, byMonth, total: round2(byMonth.reduce((s, v) => s + v, 0)) };
  });
  const totalsByMonth = months.map((_, i) => round2(rows.reduce((s, r) => s + r.byMonth[i], 0)));
  const grandTotal = round2(totalsByMonth.reduce((s, v) => s + v, 0));
  return { months, rows, totalsByMonth, grandTotal };
}

/** Ordered list of 12 "YYYY-MM" keys for a fiscal year whose first month is given. */
export function fiscalYearMonths(firstMonthKey: string): string[] {
  const [y, m] = firstMonthKey.split("-").map((s) => parseInt(s, 10));
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const mm = ((m - 1 + i) % 12) + 1;
    const yy = y + Math.floor((m - 1 + i) / 12);
    out.push(`${yy}-${String(mm).padStart(2, "0")}`);
  }
  return out;
}
