# Figgy Jr — Originality Group Payroll (YTD carryforward + combined-entity roster)

Prepared 2026-06-20 for markie.antle@gmail.com from live Google Drive sources. Only
figures the sheets actually show are reported; gaps are flagged, nothing is guessed.

Sources:
- **Current payroll** — "Originality.AI Payroll" Google Sheet, ID
  `1154Xi7Wk9qj9eg7O2j7jvIJff-982o1TBacefWY7YbE` (owner finance@adbank.network,
  modified 2026-06-16). Read the most-recent tab **"Jun 2026"**.
- **Old combined sheet** — "Payroll - Commission, Advances Etc.xlsx", ID
  `1smD0CtUb4SFNEN7OdxfoN9xtlRqgk4zd` (monthly tabs; current roster read from the
  "Mar 2026" tab, the most complete).
- **Interco ledger** — "Hold Co Interco for Originality.xlsx", ID
  `1Y931sQEQgTEQrvLcFQ5699aC11uMXBFw` (Originality.AI Inc transaction report for the
  `1310 Interco:2303851 Ontario` account, all dates through 2025-05-31).

---

## Section 1 — Originality's last payroll: YTD gross carryforward per employee

**Pay frequency:** semi-monthly — "Pay Date: 15th, EOM"; hourly period "1-15 & 16 - EOM".
**Most recent pay run:** the **June 15, 2026** run (this is the "Jun 2026" tab; commission
period shown is "Apr 2026"; as of today 2026-06-20 the June-EOM run has not yet been processed).
The YTD columns below are the calendar-2026 carryforward accumulated to that pay.

**Important data caveat:** This sheet tracks **YTD Gross Earnings**, **Expected CRA
Deduction (YTD)**, and **Actual Tax Deducted (YTD)**. It does **NOT** carry separate
per-employee **YTD CPP** or **YTD EI** columns — those amounts are not on this sheet, so
they cannot be reported per employee (see CPP/EI note below). "Actual Tax Deducted (YTD)"
is total income-tax (and possibly source-deduction) withheld, not a CPP/EI split.

Only employees with a populated YTD Gross row had run through prior 2026 pays; blank-YTD
rows are new/recent starts or hourly-only lines with no accumulated salary YTD.

| Employee | YTD Gross Earnings | Expected CRA Ded (YTD) | Actual Tax Deducted (YTD) | YTD CPP | YTD EI | CRA rate | Monthly salary |
|---|---|---|---|---|---|---|---|
| Bejtic, Narcis | $60,366.67 | $13,427.89 | $17,555.71 | n/a* | n/a* | 29.65% | $8,268.75 |
| Bhagawati, Arnav | $47,909.94 | $9,725.32 | $13,073.16 | n/a* | n/a* | 19.05% | $6,562.50 |
| Bongiorno, Thomas | $55,778.38 | $11,898.07 | $15,080.86 | n/a* | n/a* | 23.15% | $7,612.50 |
| Empey, Sarah | $31,939.97 | $5,472.51 | $7,152.82 | n/a* | n/a* | 19.05% | $4,375.00 |
| Gillham, Jon | $160,409.60 | $47,623.49 | $67,780.12 | n/a* | n/a* | 38.16% | $26,000.00 |
| Lambert-Taylor, Maddie | $53,279.90 | $11,155.34 | $14,958.30 | n/a* | n/a* | 19.05% | $7,333.33 |
| Mc Nally, Liam | $46,951.80 | $9,470.16 | $12,662.18 | n/a* | n/a* | 19.05% | $6,431.25 |
| Shafie, Ghazale | $30,805.25 | $5,170.34 | $8,616.62 | n/a* | n/a* | 19.05% | $7,500.00 |
| Tran, Trinh | $69,565.28 | $16,841.68 | $22,633.53 | n/a* | n/a* | 29.65% | $9,528.75 |
| Watt, Connor | $54,801.50 | $11,597.87 | $14,716.76 | n/a* | n/a* | 23.15% | $7,525.00 |
| **TOTAL (all Originality)** | **$611,808.29** | **$142,382.67** | **$194,230.06** | — | — | — | — |

\* **YTD CPP and YTD EI are not on this sheet** — only YTD Gross, Expected CRA Deduction
(YTD) and Actual Tax Deducted (YTD) are tracked per employee.

Employees on the roster with **blank YTD Gross** (new/recent 2026 starts or hourly-only,
no salary YTD accumulated on this tab): Andrade Meira, Nathan (June 01 start, $6,833.33/mo);
Huang, Alexander ($4,166.67/mo); Lapp, Motiejus (June 01, $1,354.17/mo); Laroque, Kristin
(GRANT NRC, May 20 start, $3,416.67/mo); Ma, Janay ($6,142.50/mo); Moshood, Joshua
($7,000.00/mo); Patel, Urvish (last day May 4 2026, $396.07); plus hourly lines Fraiman,
Michael (15th/EOM @ $30/hr), Sawyer, Jessica (15th/EOM @ $30/hr), Zhu, Kayla (15th/EOM @ $70/hr).

### Maxed CPP / EI — what can be inferred (no per-employee YTD CPP/EI on sheet)
The sheet's reference block gives the 2026 maximums it uses:
- **CPP:** max pensionable earnings **$74,600**, rate 5.95%, basic exemption $3,500.
- **EI:** max insurable earnings **$68,900**, rate 1.63%.

Because per-employee YTD CPP/EI is not tracked, max-out can only be **inferred from YTD
gross vs. the ceilings** (and only approximately — actual CPP/EI depends on per-pay
contributions, not gross alone):
- **Jon Gillham** — YTD gross **$160,409.60** → well past both the $74,600 CPP ceiling and
  $68,900 EI ceiling → **almost certainly maxed CPP and EI.**
- **Trinh Tran** ($69,565.28) and **Narcis Bejtic** ($60,366.67) — past or near the EI
  ceiling ($68,900); Tran is over it, Bejtic close. Neither near the CPP ceiling yet.
- All others ($30k–$56k YTD) are **below both ceilings** → not maxed.
- **To report maxed CPP/EI authoritatively, pull YTD CPP/EI from the QBO Payroll Summary**
  (the sheet links to `qbo.intuit.com/.../payroll-summary`), since this sheet does not hold them.

---

## Section 2 — Old combined sheet: roster across the related entities + interco

Source: **"Payroll - Commission, Advances Etc.xlsx"** (`1smD0CtUb4SFNEN7OdxfoN9xtlRqgk4zd`).
A stack of monthly "Payroll Summary" tabs (Aug 2025 → Mar 2026) plus commission/advance/grant
support tabs. Current roster taken from the **Mar 2026** tab (most complete). Figures verbatim.

**Key naming gotcha (QBO vs in-sheet):** the in-sheet "Company" label is NOT the QBO payroll
entity. The tab's own QBO reconciliation footer maps:
- in-sheet **"Originality"** → QBO entity **"Adbank"** (Total Pay $135,935.93)
- in-sheet **"Motion Invest" + "Seahorse"** → QBO entity **"2303851"** (Total Pay $18,471.33)
- in-sheet **"Fractal SaaS"** → QBO **"Fractal SaaS"** (Total Pay $4,500.00)

### Roster by entity (Mar 2026)

**ORIGINALITY (Originality.AI; payroll run through QBO "Adbank")**

| Name | Pay type | Salary / rate | Category / notes |
|---|---|---|---|
| Andrade Meira, Nathan | Salary | $6,833.33 | Product – Eng & Design; June 01 start |
| Bejtic, Narcis | Salary | $8,268.75 | G&A |
| Bhagawati, Arnav | Salary | $6,562.50 | Product; start Jul 29 |
| Bongiorno, Thomas | Salary | $7,612.50 | Head of Customer Success; start Sep 3 |
| Empey, Sarah | Salary | $4,375.00 | Marketing; on a grant |
| Fraiman, Michael (15th/EOM) | Hourly | $30.00/hr | Nov 06 |
| Gillham, Jon | Salary | $26,000.00 + $13,000.00 bonus | G&A; founder |
| Lambert-Taylor, Maddie | Salary | $7,333.33 | Marketing |
| Lapp, Motiejus | Salary | $1,354.17 | G&A; June 01 |
| Laroque, Kristin | Salary | $3,416.67 | GRANT NRC; May 20 start |
| Ma, Janay | Salary | $6,142.50 | Product; FT Apr 2024 |
| Moshood, Joshua ("Originality PP1") | Salary | $7,000.00 | Product; was hourly $83.34/hr |
| Mc Nally, Liam | Salary | $6,431.25 | Product; FT Jul 15 |
| Patel, Urvish | Salary | $4,291.67 | R&D; start May 6 |
| Sawyer, Jessica (15th/EOM) | Hourly | $30.00/hr | Marketing; start Jun 23 |
| Shafie, Ghazale | Salary | $3,750.00 (Total Month $9,528.75 — see flag) | R&D; start Oct 14 |
| Tran, Trinh | Salary | $9,528.75 | R&D; start Oct 14 |
| Watt, Connor | Salary | $7,525.00 | Product; "advance pay back 250 p/m" |
| Zhu, Kayla (15th/EOM) | Hourly | $70.00/hr | Marketing; start Jun 23 |

**2303851 ONTARIO INC** (legal payroll employer for the MI/Seahorse group)

| Name | Pay type | Salary / rate | Notes |
|---|---|---|---|
| Gillham, Stacey | Salary | $8,333.33 | logged 173.33 hrs |

**FRACTAL SAAS**

| Name | Pay type | Salary / rate | Notes |
|---|---|---|---|
| Raines, Andrew | Salary | $4,500.00 | Total cost $5,625.00 |

**MOTION INVEST** (payroll paid through 2303851)

| Name | Pay type | Salary / rate | Notes |
|---|---|---|---|
| Van Boxmeer, Kelley | Salary | $6,250.00 | the "Kelley" of the 10% MI commission |
| Gunn, Ryan | Hourly | $24.00/hr | active (162 hrs + 8 stat = $3,888.00) |
| Watson, Ryan | Hourly | $24.00/hr | inactive this month |
| Amel | Hourly | $30.26/hr | inactive this month |

**SEAHORSE** (payroll paid through 2303851)

| Name | Pay type | Salary / rate | Notes |
|---|---|---|---|
| Robertson, Melissa | Hourly | $20.00/hr | "Last day ROE for parental leave"; the "Melissa" of the SH 10% commission |

**Dormant / $0.00 entities in Mar 2026:** Adbank, BrandBuilders, MSV, Fractal Saas-AD, StarCluster.

### Revenue-share / commission structures (verbatim from support tabs)

- **Motion Invest — % of Net Profit (NP), monthly** ("MI Com" tab,
  "Commission Calculations as per PnL", "Revised after Kelley review in QBO"):
  - **Kelley Van Boxmeer — 10% of MI NP** ("Kelley 10% Comm Paid").
  - **Ryan — 1% of MI NP** ("Ryan 1% Comm Paid").
  - **Amel — 5% of MI NP** (only Fiscal 2024, e.g. Jan-2024 NP $139,407.14 → Amel $6,970.36).
  - **Eric — 10% of profit** (historical, Fiscal 2021).
  - Sample FY totals (NP / Kelley 10% / Ryan 1%): FY2023 $397,367.33 / $39,736.73 / $3,973.67;
    FY2022 $679,698.38 / $66,259.34 / $4,832.89; FY2024 $203,333.40 / $20,333.34 / $2,033.33
    (+ Amel $6,970.36); FY2025 $42,732.00 / $4,273.20 / $427.32. Note a YE clawback:
    "Short Paid Commission on YE Reco, –$32,563.18, Jan 2022".
- **Seahorse — Melissa 10% commission** ("SH Com" tab): base = "Pnl (no Payroll)"
  (PnL with payroll added back) × 10%. Columns: "Melissa 10% Commission, Maddie,
  Commisison Paid, Balance Due". (The "Maddie" column here is blank — placeholder.)
- **"Originality Commission %"** — a single sheet-wide monthly value (Feb 34.26%, Jan 40.58%,
  Dec 40.56%, Nov 41.09%, Oct 38.10%, Sep 36.22%; Mar blank). **Ambiguous** — appears to be an
  effective tax/burden rate feeding "Comm Eligible Salary", not a per-employee profit share.
  Flagged for confirmation.

### Inter-company (interco) evidence

**Business context confirmed by the data:** 2303851 Ontario Inc is the legal payroll employer
that **pays for Motion Invest's (and Seahorse's) payroll**. In every monthly tab, the Motion
Invest staff (Kelley, Ryan Gunn, Ryan Watson, Amel) and Seahorse (Melissa) plus Stacey Gillham
roll up into one **"2303851 Totals"** line, which the QBO footer maps to **"QBO 2303851 Total
Pay $18,471.33"**. Likewise Originality's payroll runs through **QBO "Adbank" ($135,935.93)**.
So two interco payroll relationships are evidenced:
1. **Originality.AI payroll → paid through Adbank (QBO).**
2. **Motion Invest + Seahorse payroll → paid through 2303851 Ontario Inc (QBO).** ✅ matches
   "2303851 pays for Motion Invest's payroll".

**Direct interco ledger** — "Hold Co Interco for Originality.xlsx" is Originality.AI Inc's
transaction report for the `1310 Interco:2303851 Ontario` account. It contains **hundreds of
inter-company journal entries and cash transfers** between Originality and 2303851 over
2022–2025. Verbatim recurring memo patterns:
- **"Paid by 230"** / **"Paid 230"** — 2303851 pays expenses on Originality's behalf
  (e.g. 31/07/2023 JE 49 "Paid by 230" $35,574.55 + $20,287.20).
- **"Due to #co"** — monthly inter-company due-to/due-from settlement JEs
  (e.g. 31/10/2023 JE 76 $124,590.78; 29/02/2024 JE 2024-2 $110,609.71).
- **"Post Originality deposits/payouts"** — large monthly reclasses (e.g. 31/01/2023 JE 26 $133,534.91).
- **"Reclass from 2303851"** (e.g. 30/09/2024 JE 108 $96,443.76), **"Reclass PP affiliate
  expenses to Originality"**, **"PP Mass Affiliate Pay"**, **"Bookkeeping Splits with Software"**.
- Numerous **bank "Account transfer" / Transfer** rows (CAD Chq 9026, USD Chq 2549) moving cash
  between the two entities, plus an explicit **"Account transfer 230toOrig"** (16/05/2024 $40,878.33).
- **Account totals (1310 Interco:2303851 Ontario):** Credit **$1,774,476.92** / Debit
  **$2,624,695.62** (accrual basis, report run 2025-06-18).

This confirms a heavy, ongoing interco relationship: 2303851 funds/pays for the group, with
monthly "Due to #co" settlements and reclasses trued up between 2303851 and Originality.

### Flags / things to verify

- **YTD CPP & YTD EI are not on the current payroll sheet** — pull from QBO Payroll Summary to
  state max-outs authoritatively (Section 1).
- **#REF! errors are pervasive** in the old combined sheet's Grand Total / Total Hours / Stat
  columns, and in the Motion Invest summary row — totals tied to those cells are unreliable.
- **Shafie, Ghazale** — salary cell $3,750.00 but Total Month Pay $9,528.75 (identical to Tran);
  likely a formula/copy artifact in the old sheet — verify.
- **Motion Invest summary "Total Salary $4,500.00"** conflicts with Kelley's $6,250.00 roster
  salary (the $4,500 appears cross-wired to Fractal's cell) — treat MI summary salary as suspect.
- **"Originality Commission %"** (34–41%) interpretation unconfirmed (burden rate vs. profit share).
- **In-sheet company label ≠ QBO payroll entity** (Originality→Adbank; MI+Seahorse→2303851).
- The 2024 QBO export "2303851OntarioInc._PayrollSummaryByEmployee_10082024_1320.xls"
  (`1d4ZYqlMVfIM6mwQDdcwA5kOKfhUfzSMo`) exists but is a legacy binary .xls that the Drive
  reader could not open as text — not used here.
