# West York Paving — Monthly Credit-Card Reconciliation Runbook

**Scope (Markie, 2026-06-15):** BMO CashBack MasterCard first (cards ·4686 +
·6311 → **one** QBO account **137**). One statement **month at a time**, oldest
first, never combined. Gated write approved for entering missing charges.

## Source of truth: the statement always wins
The **bank statement is authoritative** (Markie, 2026-06-15). When QBO and the
statement disagree, **QBO is what gets corrected** — never the statement. The
engine encodes this: the statement's ending balance is the *target* and matched
QBO register lines are driven to it. A non-zero self-check therefore means our
**opening balance or parse** is off (or QBO is incomplete), not that the
statement is wrong. (Worked example: Dec-2025 BMO interest is **$501.62** per the
statement, and it ties: opening $31,728.51 − payments $29,674.93 + purchases
$23,658.74 + interest $501.62 = **$26,213.94** ending. A `$601.62` figure that
surfaced in a CSV export is the error — entering it would put the month $100 out
and it would NOT tie; the fix is to correct QBO to $501.62, never to plug.)

**No plugging (golden rule, Markie 2026-06-15).** A difference is resolved ONLY
by entering/finding a real transaction or correcting a real error — never by
fabricating an amount or a balancing adjustment. The opening balance comes from
the prior statement, never back-solved. If a number is missing, FLAG it. Plugging
is a rare exception requiring Markie's explicit per-case authorization.


## The hard truth about QBO + reconcile
QuickBooks has **no API for reconciliation** — marking transactions cleared and
locking a period is UI-only. So no QBO connection (read *or* write) can "do" the
reconcile. What Figgy automates is the **matching** (the tedious 95%); the final
**Finish + attach statement** is done by driving the QBO Reconcile screen in
Chrome (Claude-in-Chrome), with Markie approving the Finish.

## HARD RULE — completeness, no exceptions (Markie, 2026-06-15)
1. **Every transaction on every month's statement must be posted in QBO and
   matched.** No exceptions, no skipping a line. Any statement line not already
   in QBO is ENTERED (gated write, reviewed) until `missing-in-QBO = 0`.
2. **Every month is reconciled to its statement and the statement PDF is attached
   to the finished reconcile report in QBO.** A month is not "done" until the QBO
   Reconcile is **Finished** (difference $0) with the statement attached.
3. Months are done **oldest → newest**, one statement at a time, never combined.

A month is COMPLETE only when ALL hold: `missing-in-QBO = 0` AND `extra-in-QBO`
reviewed/resolved AND `difference = $0` (engine `ties = true`) AND QBO Reconcile
Finished AND statement attached. The engine's `ties` flag already requires every
statement line matched with a $0 difference — but `ties` is the *matching* gate;
the QBO Finish + attach (browser) is the *closing* gate. Both are required.

## Architecture (built)
- `api/reconcile-core.ts` — pure month matcher (statement ↔ register), owed-cents
  convention, fuzzy-payee + nearest-date matching, self-check, difference.
  Verified `node --experimental-strip-types scripts/reconcile-verify.ts` (8/8 on
  the real BMO Dec-2025 statement).
- `api/reconcile.ts` — live I/O: `reconcile.runMonth` (read-only) pulls the QBO
  General Ledger for acct 137 over the period and runs the core; `reconcile.enterMissing`
  (GATED — dry-run unless `confirm`, never posts without an expense account).
- `bridge-bootstrap.ts` — West York wired via its QBO tool scenario **5389401**
  (realm 123145963468664), write-capable scenario-run route, **active only when
  `FIGGY_MAKE_API_TOKEN` is set**.

## ONE thing needed to go live
Set **`FIGGY_MAKE_API_TOKEN`** on the deployed CRM (figgy.gofig.ca / Railway).
That activates West York's connection (read + gated write). On next boot the
bridge links realm 123145963468664 → the West York CRM client automatically.

## Fastest path: the one-command runner
`scripts/reconcile-west-york.ts` pulls the LIVE QBO register for acct 137 and
prints the review packet in one shot (read-only, no DB needed):

```
FIGGY_MAKE_API_TOKEN=<make token> node --experimental-strip-types \
  scripts/reconcile-west-york.ts \
    --start 2025-11-29 --end 2025-12-28 \
    --opening 31728.51 --ending <statement closing balance> \
    --csv bmo_dec_4686.csv:4686 --csv bmo_dec_6311.csv:6311
```

## Prerequisite — transactions must already be in QBO
Reconciliation matches what's ENTERED in QBO. Before a month can close, the
card's transactions for that period must already be posted in QBO (entered
manually, via bank feed, or CSV import). Anything on the statement but not in QBO
is the `missing-in-QBO` list and is entered via the gated write — **every line,
no exceptions** — before the month ties.

## Monthly procedure (per statement month)
1. **Statement** — the monthly BMO statement PDF lives in Drive `4 - Statements /
   BMO MasterCard`. It is ONE statement for the shared account covering BOTH cards
   (·4686 Frank + ·6311 Joe → QBO acct 137). Opening balance = prior statement's
   closing; ending balance + closing date come off the statement.
2. **Match** — call `reconcile.runMonth` with the CSV text(s), acct `137`, the
   period, opening + ending balances. Read the packet:
   - `✅ TIES` → every statement line is in QBO and the difference is $0.
   - `missing-in-QBO` → charges to enter (step 3).
   - `extra-in-QBO` → review (wrong period / duplicate / error).
   - self-check ≠ 0 → opening balance or completeness is off; fix before closing.
3. **Enter missing (gated)** — `reconcile.enterMissing` returns the
   CreditCardCharge payloads as a dry-run; after Markie reviews (incl. the expense
   account per the locked chart), post with `confirm:true`. Re-run step 2 → should
   now tie.
4. **Finish in QBO (browser)** — once the month ties, drive QBO Reconcile for
   acct 137: enter ending date + balance, clear the matched txns (difference $0,
   never force), attach the statement PDF, Markie approves Finish (locks it).
5. Move to the next month.

## Known data gaps (from the 2026-06-13 handoff)
- **BMO Jan-2025 statement missing** (only a partial screenshot; closing target
  $16,134.92). Source from BMO login before closing Jan.
- BMO Feb–Dec 2025 monthly closing balances need compiling from the split PDFs.
- TD Visa (Joe ·1645 / Frank ·1798) and TD chequing are **out of scope for now**
  (BMO first); TD chequing also needs real monthly statements (only a screenshot
  exists today).
