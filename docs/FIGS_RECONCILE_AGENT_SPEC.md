# "Figs" — autonomous browser reconciliation agent (build spec)

Goal: an agent that drives QuickBooks Online in a browser and **completes** credit-card
reconciliations on its own (no human steering each click), starting with West York
Paving's BMO MasterCard. Built and run in a session that has browser/computer-use +
a logged-in QBO — NOT a sandboxed chat session.

## What it is
Claude with **computer-use / Claude-in-Chrome**, driving the real QBO Reconcile screen.
It is still Claude — it just runs the task autonomously instead of being steered.

## The two hard problems (solve these or it fails like last time)
1. **Browser reliability on QBO.** The prior attempt *timed out* navigating to Reconcile.
   Build with: generous explicit waits, retry-on-timeout, and **read-back after every
   action** (confirm the field/value actually took before moving on). No blind clicks.
2. **QBO login + MFA.** Use a **persistent, already-logged-in browser profile** so the
   agent doesn't fight auth each run. Human does the initial login/MFA once; the agent
   reuses the session.

## Prerequisite check (do this FIRST, every run)
Open the card account in QBO and confirm the period's transactions are actually
**posted** (bank feed/import). If the register is empty/missing, STOP and report — no
agent can reconcile an empty register. This is likely why earlier attempts "did nothing."

## Inputs
- Account (BMO MasterCard) + the **verified ending date → ending balance** table
  (already compiled for West York 2025, Jan→Dec; see WEST_YORK_RECONCILE_RUNBOOK.md).
- The monthly statement PDFs (Drive: `4 - Statements / BMO MasterCard / 2025`).

## Per-month workflow (oldest → newest, one at a time, never combine)
1. QBO → Reconcile → select the account.
2. Confirm QBO's **beginning balance = prior month's ending** (from the table). Mismatch → STOP + flag.
3. Enter the **ending date + ending balance** from the table.
4. Match/clear the transactions that are on the statement; drive **Difference toward $0**.
5. **HARD RULE — never plug.** If Difference ≠ $0.00 after real matching, **STOP and
   flag the exact gap** — do NOT force, do NOT create an adjustment, do NOT Finish.
6. When (and only when) Difference = **$0.00** cleanly: attach that month's statement PDF.
7. **Finish.** Default mode = auto-Finish *only* on a clean $0; any discrepancy → stop &
   flag for human. (Optional stricter mode: require a human tap to Finish each month.)
8. Log result (completed / flagged + why) + screenshot. Next month.

## Guardrails (non-negotiable)
- Never plug/force a number; tie to $0 with real matches or stop. (Markie's golden rule.)
- The statement is authoritative; QBO gets corrected to it, never the reverse.
- One account, one month at a time; verify each step on-screen before proceeding.
- On ANY uncertainty (can't find account, balances don't chain, difference won't clear,
  page won't load after retries) → STOP and report, don't improvise.

## Output
A run report: which months reconciled to $0 and finished, which were flagged and why,
with the difference amount for each flagged month so a human can resolve it.

## Build notes
- Tooling options: Claude Computer Use (Anthropic API) or the Claude-in-Chrome extension,
  plus a stable logged-in Chrome profile. Add robust waits/retries (QBO is slow).
- Start by running ONE month end-to-end and watching it before trusting it unattended.
- This same agent generalizes to the other accounts/clients once proven on West York.
