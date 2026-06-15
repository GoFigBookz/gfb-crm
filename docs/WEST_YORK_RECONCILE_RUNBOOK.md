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

**The folder CSVs are OCR'd from the statement images — NOT authoritative.** The
`.csv` files under `4 - Statements / BMO MasterCard` were scanned/OCR'd from the
statement, so they carry scan errors ("AMZN Mkip", "TIMHORTONS", "8C"→"BC",
"666"→"866", and crucially digit errors in AMOUNTS). Real example: the ·4686 Dec
CSV reads interest `-601.62`, but the statement says `-501.62` (which ties to the
$26,213.94 ending). The statement governs; where a CSV amount disagrees, correct
to the statement — never carry the OCR value into QBO, and never plug. Treat the
CSVs only as a convenience list to be checked against the statement.


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

## Where statements live (per-client convention — build once, not per-client)
Every client has the SAME Drive folder layout, so statement-finding generalizes
across all clients (consolidated rails, no per-client clones):

  <client root folder> / `4 - Statements` / <account subfolder> / <monthly PDFs>

The client root folder id is stored per client (client master / `import-client-master.ts`
`folder`). For West York: root `1LlGVkPyMnZ46IPs9UPY66ws3IR_2bAxo` → `4 - Statements`
(`11sB2LcT4GDUpFjRFDXM7vvNLpXIW71NY`) → `BMO MasterCard` (`1h3dLGS8yajtVxhJmjPaTexPO0fVzq9eo`).
So the reconcile step resolves any client's statements by walking this same path —
never a hard-coded per-client lookup.

## Prerequisite — transactions must already be in QBO
Reconciliation matches what's ENTERED in QBO. Before a month can close, the
card's transactions for that period must already be posted in QBO (entered
manually, via bank feed, or CSV import). Anything on the statement but not in QBO
is the `missing-in-QBO` list and is entered via the gated write — **every line,
no exceptions** — before the month ties.

Status (Markie, 2026-06-15): the 2025 BMO CSV is believed already imported into
QBO for the year, so most months should be **matching, not entry**. VERIFY live
per month — a CSV import can still carry errors, and reconciling against the
authoritative statement is exactly what catches them (e.g. the $501.62 interest:
if QBO got $601.62 from the CSV the month lands $100 out → correct QBO to the
statement, never plug). Caveat: `bmo_mc_ALL.csv` starts **Jan 29, 2025**, so the
January statement period isn't fully covered and Jan-2025 will likely have gaps.

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

## BMO 2025 statement coverage — ALL 12 MONTHS PRESENT (verified 2026-06-15)
Every 2025 BMO MasterCard statement (acct 137) is in Drive `4 - Statements /
BMO MasterCard / 2025` as a PDF — Jan through Dec, one each. The earlier "Jan
missing / compile Feb–Dec closings" note is RESOLVED: Jan is present (closing
**$16,134.92**), and each month's opening/closing/closing-date comes straight off
its own statement (authoritative). Run order is **oldest → newest** (Jan→Dec),
one statement at a time, never combined, each to a $0 tie + Finish + attach.

Remaining real prerequisites (not data gaps):
- Live QBO read access for the matching step (the connection/trigger).
- Per month, confirm the card's transactions are already ENTERED in QBO for that
  period (reconcile matches entered txns); load the month first if not.
- The folder also has OCR'd `.csv` helpers — NOT authoritative (see above); the
  statement PDF governs.
- TD Visa (Joe ·1645 / Frank ·1798) + TD chequing are out of scope until BMO is
  done; TD chequing still needs real monthly statements (only a screenshot today).
