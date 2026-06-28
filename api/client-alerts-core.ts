/**
 * CLIENT "NEEDS ATTENTION" ALERTS — pure logic for the banner at the top of the card.
 * The FIRST thing Markie sees on a client: only the flags that are actually true right now.
 * No I/O — the page passes in the signals it already has; this decides what to surface and
 * how loud. Ordered high → medium so the worst thing reads first.
 */
export interface ClientAlertInput {
  overdueTasks?: number;
  hst?: { due?: boolean; overdue?: boolean; filed?: boolean; periodLabel?: string | null } | null;
  payroll?: { dueSoon?: boolean; overdue?: boolean } | null;
  cash?: { low?: boolean; needsTransfer?: boolean; shortfall?: number } | null;
  qboConnected?: boolean | null;   // false = a connected client whose QBO isn't returning data
  stalePostingsDays?: number;      // most-behind bank/CC account; > threshold = behind
  staleThresholdDays?: number;     // default 5
  openQuestions?: number;          // unanswered team-thread questions (from the bookkeeper)
  accountsBehind?: number;         // month-end accounts not reconciled through period-end
}

export type AlertSeverity = "high" | "medium";
export interface ClientAlert { severity: AlertSeverity; label: string; key: string }

const money = (n: number) => (n || 0).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export function buildClientAlerts(i: ClientAlertInput): ClientAlert[] {
  const out: ClientAlert[] = [];
  const staleThresh = i.staleThresholdDays ?? 5;

  // Payroll first — it always takes priority.
  if (i.payroll?.overdue) out.push({ severity: "high", label: "Payroll overdue", key: "payroll_overdue" });
  else if (i.payroll?.dueSoon) out.push({ severity: "medium", label: "Payroll due soon", key: "payroll_due" });

  // HST.
  if (i.hst && !i.hst.filed) {
    if (i.hst.overdue) out.push({ severity: "high", label: `HST overdue${i.hst.periodLabel ? ` (${i.hst.periodLabel})` : ""}`, key: "hst_overdue" });
    else if (i.hst.due) out.push({ severity: "medium", label: `HST due${i.hst.periodLabel ? ` (${i.hst.periodLabel})` : ""}`, key: "hst_due" });
  }

  // Cash.
  if (i.cash?.low || i.cash?.needsTransfer) {
    const amt = i.cash?.shortfall && i.cash.shortfall > 0 ? ` — transfer ${money(i.cash.shortfall)} in` : " — needs a transfer in";
    out.push({ severity: "high", label: `Cash low${amt}`, key: "cash_low" });
  }

  // Books behind (stale postings).
  if (typeof i.stalePostingsDays === "number" && i.stalePostingsDays > staleThresh) {
    out.push({ severity: "medium", label: `Books behind — no posting in ${i.stalePostingsDays} days`, key: "stale" });
  }

  // QBO not returning data (only meaningful when explicitly false).
  if (i.qboConnected === false) out.push({ severity: "medium", label: "QuickBooks not returning data — reconnect", key: "qbo" });

  // Overdue tasks (count).
  if (i.overdueTasks && i.overdueTasks > 0) {
    out.push({ severity: i.overdueTasks >= 5 ? "high" : "medium", label: `${i.overdueTasks} task${i.overdueTasks === 1 ? "" : "s"} behind`, key: "tasks" });
  }

  // Open team-thread questions (the bookkeeper waiting on Markie).
  if (i.openQuestions && i.openQuestions > 0) {
    out.push({ severity: "medium", label: `${i.openQuestions} open question${i.openQuestions === 1 ? "" : "s"} from the team`, key: "questions" });
  }

  // Month-end accounts behind on reconciliation.
  if (i.accountsBehind && i.accountsBehind > 0) {
    out.push({ severity: "medium", label: `${i.accountsBehind} account${i.accountsBehind === 1 ? "" : "s"} behind on reconciliation`, key: "recon_behind" });
  }

  // High first, stable within.
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
