/**
 * FIGGY JR — MONTHLY STATEMENT RECONCILIATION: PURE CORE (no I/O, no imports)
 * =============================================================================
 * Deterministic matching logic for reconciling ONE credit-card / bank statement
 * MONTH against the transactions in that account's QBO register. Pure so it can
 * be unit-tested in isolation (scripts/reconcile-verify.ts) and reused by the
 * I/O layer (api/reconcile.ts), exactly like qbo-vendor-brain-core.ts.
 *
 * SCOPE / GOLDEN RULES:
 *  - One statement period at a time ("by month"); never combine months.
 *  - Read-only by nature: this produces a MATCH + a reconciliation difference.
 *    It posts nothing. Entering missing charges (gated write) and the final
 *    QBO Reconcile/Finish (UI-only — QBO has no reconcile API) happen in the
 *    I/O / browser layers, behind Markie's review.
 *
 * SIGN CONVENTION (everything in integer cents to avoid float drift):
 *  - `chargeCents` = effect on the amount OWED.
 *      purchase / interest  -> POSITIVE (balance owed goes up)
 *      payment / refund     -> NEGATIVE (balance owed goes down)
 *  - BMO CSV export uses the opposite sign (purchases negative, payments
 *    positive), so parseBmoCsv flips it: chargeCents = -csvAmount.
 * =============================================================================
 */

export type StatementLine = {
  date: string;        // ISO yyyy-mm-dd
  description: string;
  chargeCents: number; // +charge / -payment (owed convention)
  card?: string;       // optional card last-4 (BMO has two cards on one account)
};

export type RegisterLine = {
  id: string;          // QBO txn id
  date: string;        // ISO yyyy-mm-dd
  description: string; // payee / name
  chargeCents: number; // +charge / -payment (owed convention) — I/O normalizes
  type?: string;       // QBO txn type (Purchase, CreditCardCredit, ...)
};

export type MatchPair = {
  statement: StatementLine;
  register: RegisterLine;
  dateDeltaDays: number;
  fuzzy: boolean; // true if matched on amount+date but the payee text differs
};

export type MonthReconcileInput = {
  periodStart: string;          // ISO — statement period start
  periodEnd: string;            // ISO — statement closing date
  openingBalanceCents: number;  // owed at period start (prior closing / QBO opening)
  statementEndingBalanceCents: number; // owed at period close (from the statement)
  statementLines: StatementLine[];
  registerLines: RegisterLine[];
  dateWindowDays?: number;      // how far apart a match may be (default 5)
};

export type MonthReconcileResult = {
  matched: MatchPair[];
  /** On the statement but NOT in QBO → must be entered before this month ties. */
  missingInQbo: StatementLine[];
  /** In QBO but NOT on the statement → wrong period / duplicate / error to review. */
  extraInQbo: RegisterLine[];
  totals: {
    statementNetCents: number;   // sum of all statement chargeCents
    matchedNetCents: number;     // sum of matched register chargeCents
    /** Statement self-check: opening + statementNet should equal ending. */
    statementSelfCheckCents: number;
    /** QBO Reconcile difference if you clear exactly the matched txns:
     *  ending - (opening + matchedNet). Drive this to 0. */
    differenceCents: number;
  };
  ties: boolean; // differenceCents === 0 AND nothing missing/extra
};

const round2 = (n: number) => Math.round(n);

/** Strip noise so the same merchant reads the same across statement and QBO. */
export function normalizeMerchant(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[#*]/g, " ")
    .replace(/\b\d{3,}\b/g, " ")        // store / ref numbers
    .replace(/\b(ON|QC|BC|AB|CANADA|CA|US|INC|LTD)\b/g, " ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap token-overlap similarity 0..1 (no deps). */
export function merchantSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeMerchant(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeMerchant(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/**
 * Parse a BMO CSV export ("Date,Description,Amount"). Handles both date formats
 * BMO emits (M/D/YYYY and YYYY-MM-DD) and flips the sign into the owed
 * convention. Ignores a header row and blanks. `card` is stamped on each line.
 */
export function parseBmoCsv(text: string, card?: string): StatementLine[] {
  const out: StatementLine[] = [];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const first = line.indexOf(",");
    const last = line.lastIndexOf(",");
    if (first < 0 || last <= first) continue;
    const dateRaw = line.slice(0, first).trim();
    const desc = line.slice(first + 1, last).trim().replace(/\\/g, "");
    const amtRaw = line.slice(last + 1).trim();
    if (/date/i.test(dateRaw) && /amount/i.test(amtRaw)) continue; // header
    const iso = toIso(dateRaw);
    const amt = Number(amtRaw.replace(/[$,\s]/g, ""));
    if (!iso || !Number.isFinite(amt)) continue;
    out.push({ date: iso, description: desc, chargeCents: round2(-amt * 100), card });
  }
  return out;
}

/** Accept M/D/YYYY, MM/DD/YYYY, or YYYY-MM-DD → ISO yyyy-mm-dd (or "" if junk). */
export function toIso(d: string): string {
  const s = String(d ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

/**
 * Reconcile ONE statement month against the QBO register for that account.
 * Greedy: exact-amount first, choosing the nearest date within the window;
 * exact-payee matches win ties over fuzzy ones. Whatever is left is reported as
 * missing (statement-only) or extra (QBO-only) for human review.
 */
export function reconcileMonth(input: MonthReconcileInput): MonthReconcileResult {
  const win = input.dateWindowDays ?? 5;
  const matched: MatchPair[] = [];
  const usedReg = new Set<number>();

  // Stable order: by date then amount, so results are deterministic.
  const stmt = [...input.statementLines].sort(byDateAmt);
  const reg = [...input.registerLines].sort(byDateAmt);

  for (const s of stmt) {
    let bestIdx = -1, bestScore = -Infinity, bestDelta = 0, bestFuzzy = true;
    for (let i = 0; i < reg.length; i++) {
      if (usedReg.has(i)) continue;
      const r = reg[i];
      if (r.chargeCents !== s.chargeCents) continue;
      const delta = dayDiff(s.date, r.date);
      if (Math.abs(delta) > win) continue;
      const sim = merchantSimilarity(s.description, r.description);
      // Prefer exact-ish payee, then nearest date.
      const score = sim * 100 - Math.abs(delta);
      if (score > bestScore) { bestScore = score; bestIdx = i; bestDelta = delta; bestFuzzy = sim < 0.5; }
    }
    if (bestIdx >= 0) {
      usedReg.add(bestIdx);
      matched.push({ statement: s, register: reg[bestIdx], dateDeltaDays: bestDelta, fuzzy: bestFuzzy });
    }
  }

  const matchedStmt = new Set(matched.map((m) => m.statement));
  const missingInQbo = stmt.filter((s) => !matchedStmt.has(s));
  const extraInQbo = reg.filter((_, i) => !usedReg.has(i));

  const statementNetCents = stmt.reduce((a, s) => a + s.chargeCents, 0);
  const matchedNetCents = matched.reduce((a, m) => a + m.register.chargeCents, 0);
  const statementSelfCheckCents =
    input.statementEndingBalanceCents - (input.openingBalanceCents + statementNetCents);
  const differenceCents =
    input.statementEndingBalanceCents - (input.openingBalanceCents + matchedNetCents);

  return {
    matched,
    missingInQbo,
    extraInQbo,
    totals: { statementNetCents, matchedNetCents, statementSelfCheckCents, differenceCents },
    ties: differenceCents === 0 && missingInQbo.length === 0 && extraInQbo.length === 0,
  };
}

function byDateAmt(a: { date: string; chargeCents: number }, b: { date: string; chargeCents: number }) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.chargeCents - b.chargeCents;
}
