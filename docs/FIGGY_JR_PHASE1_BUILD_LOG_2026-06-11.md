# Figgy Junior — Phase 1 Build Log (Capture + Email Triage)

**Date:** 2026-06-11 · Backend change (Make/Sheets/OpenAI). No CRM app code touched.
Companion: `FIGGY_JR_ARCHITECTURE_REVIEW_2026-06-11.md`.

Phase 1 of the agreed rebuild: richer structured capture + email-body triage. **No posting** —
posters untouched, Gmail Intake left OFF pending Markie's activation.

## What changed (live)

### Review Queue sheet (`1lDtTggtV6YnGENYPXEZXng6gV2wclADGUgKqntWnql8`, gid 91210369)
- Grid widened 27 → 34 columns; appended 7 headers at **AB–AH**:
  `Invoice / Doc #` · `Subtotal` · `Total` · `Payment Method` · `Payment Account` · `Bill vs Expense` · `Email Instructions`.
- `A–AA` untouched; the `AA` Receipt-Link arrayformula is preserved (never written per-row).

### Data structure `393091` ("Figgy Jr AI Response")
- Added: `invoice_number`, `subtotal`, `total`, `payment_method`, `payment_account`, `bill_or_expense`, `email_instructions`.

### Gmail Intake `5171304` (OFF — email-triage core)
- All 3 OpenAI prompts (PDF / image / no-attachment) extended to return the 7 new keys.
- **PDF and image branches now also receive `EMAIL SUBJECT / FROM / BODY`** — so client directions
  ("paid by e-transfer", "this is a bill, don't pay", which card) are captured even when a file is attached.
- 3 new `updateRow` modules (`111`/`141`/`51`) write `AB:AH` on the just-added row using `addRow.rowNumber`
  (so `A:AA` and the arrayformula are never touched).
- `max_output_tokens` 800 → 900 (longer JSON).

### Drive Intake (Clark OS) `5339099` (live/scheduled)
- Both prompts extended with the 6 document-level fields (no `email_instructions` — no email body here).
- 2 new `updateRow` modules (`71`/`12`) write `AB:AG`.

Both scenarios validated by Make on save (`isinvalid: false`). Backup note filed in the Drive backup folder
(`1sb7mfvcgYPWntX9XVnSijdI8tz-WzrxG`).

## How to verify (live E2E)
1. Drop a sample receipt PDF into the Clark OS drop folder (`1GdgYGv_OAiui8_GxvPFX_vo5bU4ByOjF`); wait one 900s cycle.
2. Confirm the new row populates `AB–AG` (invoice#, subtotal, total, payment method/account, bill-vs-expense).
3. For email triage: temporarily activate Gmail Intake `5171304` and send a test to a `markie+<client>@gofig.ca`
   alias with a line like "paid by e-transfer" + a PDF; confirm `AH Email Instructions` captures it.

## Next
- **Phase 2:** vendor-history account brain (resolve vendor → that client's QBO history → same account + tax;
  flag on 0 or 2+ accounts with a ranked breakdown) + integral dedup keyed on `Invoice# + Vendor + Total + Date`.
- **Needed from Markie (D4):** per-client real cards/banks + their QBO account ids (to map `Payment Account` precisely in the Phase 3 poster).
- **Decision pending:** activate Gmail Intake to turn email-triage live.
