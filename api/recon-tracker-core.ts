/**
 * MONTH-END RECONCILIATION TRACKER — pure core.
 * =============================================================================
 * The month-end cockpit needs to know, per client, EVERY account in their close
 * (bank / credit-card / processor), what each is reconciled THROUGH, and which
 * are waiting on statements — so the statement pull-list surfaces at the START of
 * the month, not when the bookkeeper gets stuck. When QBO is connected the account
 * list auto-populates; until then Markie pastes the status (this parses it).
 *
 * Inputs:  account rows (+ a target period-end) / a pasted status block.
 * Outputs: per-account status (behind? months behind? needs statements?) + a rollup.
 * Errors:  pure — unparseable lines are skipped with a note, never thrown.
 * =============================================================================
 */
export type ReconKind = "bank" | "credit_card" | "processor" | "other";

export interface ReconAccount {
  name: string;
  kind?: ReconKind;
  reconciledThrough?: string | null;  // yyyy-mm-dd
  needsStatements?: string | null;    // free text e.g. "Apr & May" (null = none)
  note?: string | null;               // e.g. the Stripe "no transactions" question
}

export interface ReconStatus extends ReconAccount {
  behind: boolean;
  monthsBehind: number;
  current: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Parse "Apr 01, 2026" / "May 2026" (→ month-end) / "2026-05-31" → yyyy-mm-dd. */
export function parseLooseDate(s: string): string | null {
  const t = String(s || "").trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // "Apr 01, 2026" or "April 1 2026"
  const md = t.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (md) {
    const m = MONTHS[md[1].slice(0, 3).toLowerCase()];
    if (m) return `${md[3]}-${String(m).padStart(2, "0")}-${String(+md[2]).padStart(2, "0")}`;
  }
  // "May 2026" → month-end
  const my = t.match(/([A-Za-z]{3,})\.?\s+(\d{4})/);
  if (my) {
    const m = MONTHS[my[1].slice(0, 3).toLowerCase()];
    if (m) return `${my[2]}-${String(m).padStart(2, "0")}-${String(lastDay(+my[2], m)).padStart(2, "0")}`;
  }
  return null;
}

function guessKind(name: string): ReconKind {
  const n = name.toLowerCase();
  if (/visa|mastercard|amex|credit|\bcc\b/.test(n)) return "credit_card";
  if (/paypal|stripe|square|shopify|wise|processor/.test(n)) return "processor";
  if (/chequing|checking|savings|bank|rbc|td|cibc|bmo|scotia|account|usd|cad/.test(n)) return "bank";
  return "other";
}

/**
 * Parse a pasted status block like:
 *   "RBC CAD *0488 - Reconciled up to Apr 01, 2026  (Need Apr & May statements)"
 *   "PayPal - Reconciled until May 31, 2026"
 *   "USD Chequing - Reconciled until May 29, 2026"
 *   "Stripe - The Stripe account has no transactions..."  (→ note, no date)
 * Lines that are obviously a client header ("Fractal - Done for May 2026") with no
 * account-like name are returned too but flagged; the caller can drop them.
 */
export function parseReconPaste(text: string): ReconAccount[] {
  const out: ReconAccount[] = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/^[\s*•\-]+/, "").trim();
    if (!line) continue;
    const dash = line.indexOf(" - ");
    if (dash < 0) continue;
    const name = line.slice(0, dash).trim();
    const rest = line.slice(dash + 3).trim();
    if (!name) continue;

    const needsMatch = rest.match(/\(?\s*need[s]?\s+([^)]+?)\s*statement[s]?\s*\)?/i);
    const needsStatements = needsMatch ? needsMatch[1].trim() : null;

    let reconciledThrough: string | null = null;
    const recMatch = rest.match(/reconciled\s+(?:up\s+to|until|to|through)\s+([A-Za-z0-9 ,.\-]+?)(?:\s*\(|$)/i);
    if (recMatch) reconciledThrough = parseLooseDate(recMatch[1]);
    const doneMatch = rest.match(/done\s+for\s+([A-Za-z]{3,}\.?\s+\d{4})/i);
    if (!reconciledThrough && doneMatch) reconciledThrough = parseLooseDate(doneMatch[1]);

    const note = (!reconciledThrough && /no transaction|which|\?/.test(rest)) ? rest : null;

    out.push({ name, kind: guessKind(name), reconciledThrough, needsStatements, note });
  }
  return out;
}

/** Status of one account vs the target close period-end (yyyy-mm-dd). */
export function accountStatus(acc: ReconAccount, periodEnd: string): ReconStatus {
  const target = Date.parse(periodEnd);
  const through = acc.reconciledThrough ? Date.parse(acc.reconciledThrough) : NaN;
  let monthsBehind = 0;
  let behind = false;
  if (Number.isFinite(target) && Number.isFinite(through)) {
    behind = through < target - 86400000; // more than ~a day short of period end
    if (behind) monthsBehind = Math.max(1, Math.round((target - through) / (30 * 86400000)));
  } else if (!acc.reconciledThrough) {
    behind = true; // no recon date on file = not done
  }
  return { ...acc, behind, monthsBehind, current: !behind };
}

export interface ReconRollup {
  total: number; current: number; behind: number; needingStatements: number;
  worstMonthsBehind: number; statementPullList: Array<{ name: string; needs: string }>;
}

export function summarizeRecon(accounts: ReconAccount[], periodEnd: string): ReconRollup {
  const statuses = accounts.map((a) => accountStatus(a, periodEnd));
  const needing = statuses.filter((s) => s.needsStatements);
  return {
    total: statuses.length,
    current: statuses.filter((s) => s.current).length,
    behind: statuses.filter((s) => s.behind).length,
    needingStatements: needing.length,
    worstMonthsBehind: statuses.reduce((m, s) => Math.max(m, s.monthsBehind), 0),
    statementPullList: needing.map((s) => ({ name: s.name, needs: s.needsStatements! })),
  };
}
