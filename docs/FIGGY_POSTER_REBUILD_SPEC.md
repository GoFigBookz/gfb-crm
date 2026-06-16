# Figgy Jr — Corrected QBO Poster — turnkey rebuild spec

Apply this to the per-realm poster (Clark OS = Make scenario 5325584; same logic for
the other realms). Build it, keep it **OFF / on-demand**, and prove it on **one**
approved entry before it runs on its own. This fixes all four defects of the old
poster (bill-as-expense, clearing account, no payee, no attachment) + the memo.

## 0. Why the old one failed (so the fix is unambiguous)
The old poster read Review Queue range **A:Z**, but the capture's payment columns are
**AE–AG**, so it never saw payment status and hardcoded a Cash `Purchase` to Figgy
Clearing (acct 53) with no `EntityRef`, no attach. Fix = read the full row + branch +
set payee + match the real account + clean memo + verified attach.

## 1. Read the FULL row (A:AH) and gate it
Filter Review Queue rows where: Client = the realm's company, Status = `Approved`,
`Action Needed` (col 14) = `Post to QBO`, `Posted to QBO` (col 22) is EMPTY,
`Attachment` (col 19) exists. Columns (0-indexed): 0 RowID(Figgy#), 4 Tx Date,
7 Vendor/Payee, 8 Amount, 11 HST Amt, 12 HST Treatment, 13 AI Category,
19 Attachment(`msgId::file` or `drive::fileId`), 27 Invoice#, 28 Subtotal, 29 Total,
30 Payment Method, 31 Payment Account (card #, e.g. `Visa 6231`), 32 Bill vs Expense.

## 2. Resolve the PAYEE (never blank)
`GET /query?query=SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '<col7>'`
(fall back to `LIKE '%<distinct word>%'`). Exactly one hit → `vendorId`. Zero or
ambiguous → write `FLAG: vendor not found` to the row and **SKIP** (do not post).

## 3. Resolve the ACCOUNT
- Expense category line account: from the existing `QBO_Map_<realm>` sheet (AI Category → acct id).
- Paying account (paid path only): take the last-4 from col 31 (`Visa 6231` → `6231`) and
  `GET /query?query=SELECT Id, Name FROM Account WHERE Name LIKE '%6231%'`. One hit →
  use that `Id`. Zero/ambiguous → `FLAG: pay-account not found`, **SKIP**. NEVER a
  typed-in id, NEVER a clearing account.

## 4. Branch: paid → Expense, not paid → Bill
Decide from col 32 (`Bill vs Expense`); if blank, derive: col 31 non-empty = paid.

**PAID → `POST /purchase?minorversion=75`:**
```json
{ "PaymentType": "CreditCard",
  "AccountRef": { "value": "<paying account id from step 3>" },
  "EntityRef":  { "value": "<vendorId>", "type": "Vendor" },
  "TxnDate":    "<col4>",
  "DocNumber":  "<col27 invoice#>",
  "PrivateNote":"<receipt filename> | Figgy #<col0>",
  "Line": [{ "Amount": <col28 subtotal>, "DetailType": "AccountBasedExpenseLineDetail",
             "Description": "<col7 vendor>",
             "AccountBasedExpenseLineDetail": {
               "AccountRef": { "value": "<category acct>" },
               "TaxCodeRef": { "value": "<tax code, step 5>" } } }],
  "GlobalTaxCalculation": "TaxExcluded" }
```
(PaymentType = `CreditCard` for the Visa; `Cash` for cash; `Check` for cheque.)

**NOT PAID → `POST /bill?minorversion=75`:**
```json
{ "VendorRef":  { "value": "<vendorId>" },
  "TxnDate":    "<col4>",
  "DocNumber":  "<col27 invoice#>",
  "PrivateNote":"<receipt filename> | Figgy #<col0>",
  "Line": [{ "Amount": <col28 subtotal>, "DetailType": "AccountBasedExpenseLineDetail",
             "Description": "<col7 vendor>",
             "AccountBasedExpenseLineDetail": {
               "AccountRef": { "value": "<category acct>" },
               "TaxCodeRef": { "value": "<tax code, step 5>" } } }] }
```
(Bill posts to Accounts Payable by default — that's correct.)

## 5. Tax code (Clark OS): from col 12 HST Treatment
HST on → `6`, Out-of-scope → `4`, Meals & Entertainment → `7` (M&E 50%, rate ref 15;
apply the M&E half-HST adjustment as the old poster's "Meal only" branch did). Other
realms: use that realm's codes (Clark CW HSTon 7 / M&E 9).

## 6. Attach the receipt — MANDATORY + verified
From the POST response take the new entity `Id`. Upload the receipt (Gmail attachment
via col19 `msgId`, or Drive file via `drive::fileId`) as a QBO `Attachable` linked to
that Bill/Purchase. Then **read back** (`GET /query?query=SELECT * FROM Attachable
WHERE AttachableRef.EntityRef.value = '<Id>'`) and confirm a file is present. If the
attach fails → `FLAG: receipt not attached`, and do NOT mark the row clean.

## 7. Memo rule (hard)
`PrivateNote` = exactly `"<receipt filename> | Figgy #<RowID>"`. Nothing else. No
"auto-post", no "Overhead (no job)", no Figgy branding.

## 8. Write-back + stay OFF
On success write col 22/23: `Posted <date> | <Bill|Expense> <id> | <account> | payee
<vendor> | receipt:yes`. Keep the scenario **inactive / on-demand**. **TEST GATE:** run
it on ONE approved Clark OS entry, then open QBO and confirm: right type (paid→Expense
to Visa 6231 / unpaid→Bill to A/P), payee set, memo = receipt + Figgy#, receipt
attached. Only after that passes does it post anything else — and still only entries a
human approved, never on a timer.

## Capture side (Markie 2026-06-16)
Make sure intake writes the **card number into col 31 (Payment Account)** (e.g. `Visa
6231`) so step 3 can match it. Clark OS card so far: **Visa ·6231**.
