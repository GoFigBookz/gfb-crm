# Client-Facing Quarterly HST Worksheet — Format Spec + Fig SOP

Captured 2026-06-26 from the deep dive of Go Fig Bookz's existing client deliverables in
Google Drive. This is the **standard the quarterly HST worksheet must match**, and the
SOP Fig follows to produce it. Source templates:
- `AlignByDesign_Q1_2026_HST_GoFigBookz` (Google Sheet) — the **current client-facing template**.
- `Ovita_HST_Audit_ Sent.xlsx` — the heavier **CRA audit-response** workbook (different purpose).
- `Alderson- HST.xlsx`, `Alderson Transactions.xlsx`, `Rocco Group HST Workflow/Process Notes`.

## Naming convention
`<Client>_<Q>_<Year>_HST_GoFigBookz` — e.g. `AlignByDesign_Q1_2026_HST_GoFigBookz`.
Quarter months are the client's **fiscal** quarter, not calendar (e.g. Align Q1 = Feb/Mar/Apr 2026).
Branding inside the sheet is spelled **"Go Fig Bookz"** (three words).

## When Fig produces it (the workflow order — NON-NEGOTIABLE)
Run ONLY after, in order: (1) bank reconciled, (2) credit cards reconciled, (3) duplicates/
mis-posts cleared ("Who paid this?"), (4) interco recharge/journal posted + reconciled,
(5) Pre-HST review clean. THEN generate this worksheet → Markie reviews → share with client.

## Tabs (full Stripe/multi-province client = all 5; domestic construction e.g. Alderson/Ovita = tabs 1, 2(simple), 5)

### Tab 1 — HST Return Summary (CRA-line return)
Columns: `CRA Line` | `Description` | `<Month1> (CAD)` | `<Month2> (CAD)` | `<Month3> (CAD)` | `Q<n> Total (CAD)`
- **PART A — SALES AND REVENUES (CAD)**
  - `101` `Total Sales and Other Revenue (net of tax)`
    - `↳  Taxable Sales — Canadian customers (net of HST/GST)`
    - `↳  Zero-Rated Sales — Non-Canadian customers` (only if applicable)
- **PART B — GST/HST CALCULATION (CAD)**
  - `103` `GST/HST Collected or Collectible`
  - `106` `Input Tax Credits (ITCs) — per QBO`
- `109` `NET TAX (Line 103 − Line 106) Positive = Remit to CRA | Negative = Refund`
- Control/note rows used: `BoC FX Rate (USD/CAD)` (+ "Estimate — verify"), `QBO Journal Entry Required?`,
  an `AUDIT BACKUP:` pointer line to the other tabs, and an `ITC note:` line referencing the Transaction Review tab.

### Tab 2 — Province Summary (only for multi-province/Stripe sellers; domestic = single ON 13% line)
Columns: `Province` | `Tax Type` | `Rate` | `# Txns` | `Gross (USD)` | `HST/GST Backed Out (USD)` | `Net Before Tax (USD)` | `QBO Code` | `Notes`
Totals: `CANADIAN TOTAL`, a `NON-CANADIAN — Zero-Rated` section, `NON-CA SUBTOTAL`.

### Tab 3 — Transaction detail (Stripe sellers: "Stripe Transactions"; others: the period transaction list)
Stripe columns: `Date` | `Customer Name` | `Customer Email` | `Country` | `Province` | `Province Source` | `Tax Type` | `Rate` | `Gross (USD)` | `HST/GST Backed Out (USD)` | `Net Before Tax (USD)` | `Month` | `Product / Description` | `Notes`
Domestic transaction-list columns (from the .xlsx exports): `Date` | `Type` | `Name` | `Memo / Description` | `Account` | `Amount` (audit version adds `Created On` | `Created By` | `Modified By` | `Modified On` with "⚠ Red = created AFTER quarter filing date").

### Tab 4 — QBO Journal Entries / sales receipts to post (sellers who book monthly sales receipts)
Columns: `Receipt Date` | `Line` | `Description` | `Account` | `Tax Code` | `USD Amount` | `BoC Rate` | `CAD Amount` | `HST/GST (CAD)` | `Memo for QBO`
One block per month with a `▶ SALES RECEIPT — <Month> | Post Date: … | Customer: … | FX Rate: …` banner and a `RECEIPT TOTAL — <Month>` row.

### Tab 5 — Transaction Review (ITC / expense review) — THIS IS THE PRE-HST REVIEW OUTPUT
Columns: `Date` | `Vendor` | `QBO Name` | `Tax Code` | `Net Amount` | `Tax Amount` | `Status` | `Go Fig Bookz Recommendation`
Status: `OK` / `YELLOW` / `RED`.
- `OK` recommendation: `✓ Verified — No Action Required`
- `RED` = remove (e.g. personal/clothing — "REMOVE: … not deductible. Remove from ITC.")
- `YELLOW` = confirm (e.g. vehicle %, fitness/medical/wellness, USD subcontractor GST/HST reg).

## How the generator maps to Figgy data
- Lines 101/103/106/109 + the Transaction Review flags come from the **same QBO pull the Pre-HST review already does** (`hst-review-router` + `hst-review-core`): collected, ITCs, net, and the per-finding RED/YELLOW recommendations.
- Output: a Google Sheet named per the convention, tabs as above, generated after the workflow order, DRAFT → Markie review → share with client.

## Build status
Generator + Fig training tracked in task #91. This doc is the format contract.
