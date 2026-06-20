# Figgy Jr — Backlog (decisions captured)

_Living list of agreed-but-not-yet-built work, with the decisions made so we
don't re-derive them._

## 1. Transaction posting into QuickBooks — THE core workload (HIGH)
Decision (Markie): build the **QBO API poster** (not a Chrome/browser bot — QBO
has a full write API; browser automation is brittle and unnecessary). Posting
mode: **auto-post safe rule matches** (high-confidence rules, e.g. fixed monthly
bills), everything else waits for review in Triage.

**BLOCKED on:** the live native per-realm QBO OAuth connection. Native OAuth is
*built* (`api/qbo-oauth.ts`) but not switched on — needs the prod Intuit app
registered + `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET`/`FIGGY_TOKEN_KEY` + redirect,
then Connect per company. **Markie can't build the connector right now — on hold.**

Scope when unblocked:
- Pull the "to-post" queue FROM QBO (bank/credit-card "For Review" feed) + Hubdoc.
- Code via the vendor brain (history + rules + cold-start classifier).
- **Rules engine**: "vendor X → account Y every time", recurring fixed-monthly
  auto-entries, and rule cleanup UI.
- Review gate in Triage (one-click approve→post); auto-post the trusted rules.
- Post via the QBO Accounting API (Purchase/Expense/Bill). Reversible, audited.
- Optional: a browser/computer-use *fetch* agent ONLY for no-API sources
  (e.g. pulling Visa statement PDFs from a bank portal with no feed).

## 2. Interco journal tracker — ✅ STAGING BUILT (2026-06-20)
230 ("numbered co") pays expenses for the other entities on its credit card and
bills them back via inter-company JEs each month.
- **BUILT (staging/review):** `/interco` page + `interco` tRPC router +
  `interco_periods`/`interco_entries` tables. Pick paying entity + month → log
  bill-back entries → **readiness gate** ("all source txns + Visa posted in QBO",
  manual confirm for now) → nets per counterparty → generates a **balanced draft
  settlement JE** (copy-to-clipboard) → "Mark posted" (gated on readiness, records
  JE#). Accounts are user-picked from the locked chart — never invented. Posters
  stay OFF (review-only). JE builder unit-tested (`api/interco-router.test.ts`).
- **REMAINING (needs live QBO connection):** auto-PULL the bill-back amounts from
  230's QBO (TransactionList/Purchase report) instead of manual entry, and
  auto-CHECK the readiness gate against QBO (are all txns posted?). Push of the JE
  stays manual by golden rule (review gate). Slots into the same router once the
  connection is live.

## 3. 2303851 / Fractal / Motion Invest roster import (LOW)
Old combined sheet located + parsed (see FIGGY_JR_ORIGINALITY_GROUP_PAYROLL.md).

## 4. CRA T4127 final eyeball (Markie task)
Before remitting real money, confirm a few 2026 constants against the official
CRA T4127 PDF (canada.ca blocked the auto-fetch; values cross-checked instead).

## 5. Set client types + payroll-feature boxes for remaining clients (Markie, UI)

## 6. Set `FIGGY_SIN_PIN` in Railway to enable SIN reveal/printing (Markie, env)

## Reminder
QuickBooks is the **source of truth for all numbers** — every figure should pull
from QBO; CRM computations are fallbacks/cross-checks until the connection is live.
