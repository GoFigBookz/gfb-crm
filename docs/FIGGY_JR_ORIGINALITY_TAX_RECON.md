# Figgy Jr — Originality.AI Payroll Withholding Reconciliation: Findings & CRA Tax Math

Date: 2026-06-20. Author: research pass (Claude/Opus). Purpose: (1) document the
existing Originality payroll sheet + any bound tax-comparison logic, and (2) verify
the official CRA tax math needed to build a withholding-reconciliation calculator
(annualized expected YTD income tax vs. QBO actual deducted, flag under-withholding).

Every figure below is grounded in a cited source (Drive file ID or URL). Anything I
could not directly verify is tagged **[UNVERIFIED]**.

---

## §1 — Originality sheet + script findings

### 1.1 The payroll sheet (FOUND — this is the existing tax-comparison engine)
- **File:** `Originality.AI Payroll` — Google Sheet, ID **`1154Xi7Wk9qj9eg7O2j7jvIJff-982o1TBacefWY7YbE`**
  - Owner `finance@adbank.network`; parent folder `1I9vXjhj4us5vIvTinvdR5R0taVFhToMn` ("Payroll" hub folder); last modified 2026-06-16.
  - Tabs are organized as monthly snapshots (e.g. "Jun 2026", "May 2026") plus
    historical commission-tracking tabs (Motion Invest fiscal-year revenue-share
    ledgers 2021–2026) and a grant/contract tracker.

- **This is exactly the logic the user described.** The live monthly tab's header row contains these columns (verbatim):
  `Company, Employee, Hours, Hourly Rate, Stat Gross Calc, Stat Holiday Hours, Stat Holiday $$, Total Hourly Pay, Share Bonus,` **`YTD Gross Earnings, Expected CRA Deduction (YTD), Actual Tax Deducted (YTD), CRA Payroll Tax Rate, Current Month Actual Tax,`** `Salary, Reimburse/Vac Pay/Bonus/Sev, Total Month Pay, Notes, Category, Start Date or Contract Term, Grants, Links, Originality %, Jon Comment`.
  - So the comparison is already built in-sheet: **Expected CRA Deduction (YTD)** vs **Actual Tax Deducted (YTD)** per employee, with a per-employee **CRA Payroll Tax Rate** column.
  - The **Actual Tax Deducted (YTD)** is sourced from QBO — the sheet links the QBO Payroll Summary report: `https://qbo.intuit.com/app/payroll/reports/payroll-summary?name=pse`.

- **Embedded rate tables (these drive the formulas — not a script):** the sheet hard-codes 2026 bracket tables as cell ranges that the YTD-expected column references:
  - Federal brackets (matches CRA 2026, see §2): `1: 0–58,523 @14%`, `2: 58,523–117,045 @20.5%`, `3: 117,045–181,440 @26%`, `4: 181,440–258,482 @29%`, `5: 258,482+ @33%`.
  - Ontario brackets (matches CRA 2026): `1: 0–53,891 @5.05%`, `2: 53,891–107,785 @9.15%`, `3: 107,785–150,000 @11.16%`, `4: 150,000–220,000 @12.16%`, `5: 220,000+ @13.16%`.
  - CPP/EI table: `CPP max earnings 74,600 @5.95% (exemption 3,500)`, `EI max 68,900 @1.63%`. (Note: these CPP/EI figures in the sheet are **[UNVERIFIED]** against CRA 2026 — the 2025 YMPE was $71,300 and 2025 EI MIE was $65,700; `74,600` looks like a forward/estimated YMPE and should be confirmed.)
  - The sheet also links a live external reference: Wealthsimple Ontario tax calculator (`https://www.wealthsimple.com/.../tax-calculator/ontario`) — implying the "expected" figure has historically been spot-checked against a 3rd-party calculator, not a pure first-principles CRA formula.

- **Observed values (live "Jun 2026"-context data, useful as test fixtures):**
  - Per-employee row example — `Bejtic, Narcis`: YTD Gross `$60,366.67`, Expected CRA Deduction (YTD) `$13,427.89`, Actual Tax Deducted (YTD) `$17,555.71`, CRA Payroll Tax Rate `29.65%`. (Here actual > expected — over-withheld on this row, the opposite of the under-withholding worry; this is the kind of variance the calculator must surface.)
  - Column totals row: YTD Gross `$611,808.29`, Expected CRA Deduction (YTD) `$142,382.67`, Actual Tax Deducted (YTD) `$194,230.06` ... (a sibling total block shows `$120,446.49` / `$122,309.09`, indicating multiple stacked summary blocks on the tab — the sheet is messy/multi-block, see 1.4).

### 1.2 Which employees are "revenue share" vs salaried/hourly
"Revenue share" = the **Share Bonus / Revenue Share** column is populated and a **% rate** appears (commission-style, lumpy). From the sheet + the paystub PDF + the Payroll Hub "Originality" tab:

- **Revenue-share (commission-style) employees** — carry a revenue-share % and a Share Bonus amount:
  - `Bejtic, Narcis` (29.65%), `Bhagawati, Arnav` (29.65%), `Bongiorno, Thomas` (23.15% / 29.65%), `Mc Nally, Liam` (19.05% / 29.65%), `Shafie, Ghazale` (19.05% / 29.65%), `Tran, Trinh` (29.65%), `Watt, Connor` (23.15% / 29.65%), `Empey, Sarah` (19.05% / 20.05%), `Lambert-Taylor, Maddie` (19.05% / 31.00%), and **`Gillham, Jon`** (38.16% / 49.53% — owner, largest revenue share: salary $26,000/mo + share bonus).
  - Note: the % values differ between the "rate" column (e.g. 29.65%) and the realized effective % — the lower numbers (19.05/23.15/29.65) align with the *combined* marginal tax brackets, the higher ones (31/49.53%) with effective tax rate on total comp. Treat the % column as the **applied marginal/effective tax rate**, not the revenue-share percentage itself.
- **Salaried (no revenue share)**: `Andrade Meira, Nathan`, `Lapp, Motiejus`, `Laroque, Kristin` (grant NRC), `Ma, Janay`, `Moshood, Joshua` ("Now Salary"), `Patel, Urvish` (last day 2026-05-04), `Huang, Alexander`.
- **Hourly**: `Fraiman, Michael` (15th & EOM, $30/hr), `Sawyer, Jessica` ($30/hr), `Zhu, Kayla` ($70/hr) — paid by Clockify hours, no revenue share.

- **The Motion Invest tabs** (in the same workbook) are a *separate* revenue-share ledger: `Kelley Van Boxmeer 10%` and `Ryan Gunn 1%` (and historically `Eric`, `Amel 5%`, `Melissa 10%`) earn **10%/1%/5% of monthly Net Profit** — a true commission/profit-share that is paid lumpy and often goes negative in loss months. This is the clearest "revenue-share is lumpy → periodic withholding misfires" case in the data.

### 1.3 Bound Apps Script — NOT retrievable, and likely none material
- **No bound Apps Script source could be retrieved.** The Google Drive content API does **not** return container-bound `.gs` script source for a Sheet. A search for `mimeType contains 'script'` returned only spreadsheets (false matches on the word "script"), not any standalone `script.google.com/...` Apps Script project tied to Originality.
- **Assessment:** the tax comparison appears to be **native spreadsheet formulas** (referencing the embedded Fed/ON bracket tables + the CPP/EI table), **not** an Apps Script. Evidence: the bracket/CPP/EI lookup tables are physically present as cell ranges on the tab (a script would more likely hold rates in code), and an external calculator link is present for manual cross-check. **[UNVERIFIED]** whether a bound script also exists — to confirm, open the Sheet → Extensions → Apps Script in the browser (the API cannot see it). If the user wants the `.gs`, it must be copied out manually.
- **Implication for the build:** there is no hidden algorithm to port. The "expected CRA deduction" is a sheet formula that (per the embedded tables) computes annual Fed+ON tax on YTD/annualized income. The deliverable calculator should **re-implement the CRA formula from first principles** (§3–§4) rather than try to extract sheet formulas, and can use the sheet's per-employee numbers above as regression test fixtures.

### 1.4 Data-quality caveats (flag before trusting any single cell)
- The live tab has **multiple stacked summary blocks** with different totals ($142k vs $120k expected) and stray `#REF!` errors in the historical Motion Invest/commission ledgers — the workbook is long-lived (created 2018) and messy. Pull values by **named employee row in the current month block**, not by absolute cell ranges.
- The sheet's per-employee "CRA Payroll Tax Rate" looks like a **flat marginal/effective rate applied to YTD gross**, which is the crude method that over/under-withholds on lumpy commission pay — the exact problem the new calculator should fix with a proper annualized bracket computation (§4).

### 1.5 Related files (context / cross-reference)
- **`Originality Last Pay Stubs.pdf`** — ID `1Cga-Zb5WxZDs_9qaHhDZOBotKDka2tyr` (pay date 2026-05-06). Confirms per-employee YTD figures and that the stub line item is literally **"Bonus Revenue Share"** + **"Income Tax"**. Example: Narcis Bejtic YTD salary $41,343.80 + revenue share $12,786.58, YTD income tax $13,070.69, YTD gross $60,366.67. Useful to reconcile QBO "Actual Tax Deducted (YTD)" against the stub.
- **`Go Fig Bookz - Payroll Hub`** — ID `1PyKRtdOlC1_eeEUj-0sdz5YFtS3a5INpUiX5PuI7yu8`. Has a **"Tax Tables"** tab with *combined Fed+ON marginal rates* and explicit blocks: **"REVENUE SHARE BONUS"** (Share % × Salary, paid 5th of month, applies to salaried employees) and **"REVENUE COMMISSION"** (Ryan Gunn 5%, Kelley Van Boxmeer 10%). NOTE: this hub's bracket table is **stale** (shows 0% first bracket to $28,500, 20.05% etc. — a different/older combined-rate model) — do **not** use it; use the per-province CRA figures in §2.
- **`Originality.AI Scorecard and PnL`** — ID `1nF7xMXWRsF8gXu6fvArYmyi7d5iTph3cKeYOnS8fdmE` (revenue/Net-Profit source that drives the Motion Invest-style revenue share).
- **`Client Info - Originality.AI Inc`** — ID `1LTWesMl3XR7wQdjNObAJ3yte2V7Ov8aijMJuSDafG7o`. CRA Payroll (RP) **786440610RP0001**, Semi-Monthly payroll, fiscal year-end **Sept 30**.
- Master client directory confirms Originality payroll freq = Semi-Monthly, RP `786440610RP0001` (file `1_PCg6gNlx5yHg1McBQTFiwyuLIWB6xnKCY74QTfqDRE`).

---

## §2 — Verified 2026 federal & Ontario brackets, BPA, surtax, health premium

### 2.1 Federal 2026 income tax brackets & rates
Indexation factor for 2026 = **2.0%**. Lowest rate dropped 15%→14% (effective Jul 1 2025; 2026 is first full year at 14%).

| Bracket | Taxable income | Rate |
|--------:|----------------|-----:|
| 1 | $0 – $58,523 | 14% |
| 2 | $58,523 – $117,045 | 20.5% |
| 3 | $117,045 – $181,440 | 26% |
| 4 | $181,440 – $258,482 | 29% |
| 5 | over $258,482 | 33% |

**Federal Basic Personal Amount (BPA) 2026:** maximum **$16,452**; phased down on a straight-line basis for net income between **$181,440** and **$258,482**, reaching the floor of **$14,829** above $258,482.
Sources: [TaxTips federal](https://www.taxtips.ca/taxrates/canada.htm); [Wealthsimple 2026 brackets](https://www.wealthsimple.com/en-ca/learn/tax-brackets-canada); BPA phase-out range confirmed via [CRA 2026 numbers coverage](https://ca.finance.yahoo.com/news/cra-released-tax-numbers-2026-145834810.html). These match the bracket table embedded in the Originality sheet (good cross-check).

### 2.2 Ontario 2026 income tax brackets & rates
Ontario indexation 2026 = **1.9%** (note: the $150,000 and $220,000 bracket thresholds are **not** indexed).

| Bracket | Taxable income | Rate |
|--------:|----------------|-----:|
| 1 | $0 – $53,891 | 5.05% |
| 2 | $53,891 – $107,785 | 9.15% |
| 3 | $107,785 – $150,000 | 11.16% |
| 4 | $150,000 – $220,000 | 12.16% |
| 5 | over $220,000 | 13.16% |

**Ontario Basic Personal Amount 2026:** **$12,989**.
Sources: [TaxTips Ontario](https://www.taxtips.ca/taxrates/on.htm); [Richter 2026 Ontario tables](https://www.richter.ca/our-insights/2026-ontario-income-tax-tables/); [WealthNorth Ontario 2026](https://wealthnorth.ca/taxes/income-tax/ontario-income-tax-rates/). Matches the Ontario table embedded in the Originality sheet.

### 2.3 Ontario surtax 2026 (materially raises ON tax owed)
Applied to **basic Ontario tax** (after the ON BPA/credits, before surtax):
- **20%** of basic Ontario tax **over $5,710** (when basic ON tax is > $5,710 and ≤ $7,307), **plus**
- **36%** of basic Ontario tax **over $7,307** (when basic ON tax > $7,307).
(So between $5,710 and $7,307 only the 20% tier applies; above $7,307 both tiers stack = 20% + 36% on the respective portions.)
Source (authoritative): CRA **T4032-ON, effective Jan 1 2026**, surtax section — [canada.ca T4032ON Jan 2026](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan.html) (PDF: `canada.ca/.../t4032/2026/t4032-on-1-26e.pdf`).
**Conflict note / resolved:** some secondary blogs quote 2026 thresholds as `$5,554/$7,108` or `$5,818/$7,307`. The canada.ca T4032ON-Jan-2026 figures are **$5,710 / $7,307**; use those and re-confirm against the live PDF before shipping. (The blogs appear to mix 2025 values.)

### 2.4 Ontario Health Premium 2026 (a separate add-on to ON tax)
Based on **taxable income (TI)**; ranges $0 → $900:
- TI ≤ $20,000 → **$0**
- $20,000 < TI ≤ $36,000 → lesser of **$300** and **6% of (TI − $20,000)**
- $36,000 < TI ≤ $48,000 → lesser of **$450** and **$300 + 6% of (TI − $36,000)**
- $48,000 < TI ≤ $72,000 → lesser of **$600** and **$450 + 25% of (TI − $48,000)**
- $72,000 < TI ≤ $200,000 → lesser of **$750** and **$600 + 25% of (TI − $72,000)**
- TI > $200,000 → lesser of **$900** and **$750 + 25% of (TI − $200,000)**
Sources: CRA T4032-ON Jan 2026 (health-premium V2 section) — [canada.ca T4032ON](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan.html); structure corroborated by [PaystubPRO Ontario payroll 2026](https://paystubpro.ca/blog/ontario-payroll-taxes-guide). The top three tier breakpoints (25% slope, $600/$750/$900 caps) are the long-standing OHP schedule; **[UNVERIFIED]** only in that I could not open the canada.ca PDF directly (WebFetch 403) — confirm the exact V2 breakpoints against the live PDF, but they have not changed in years.

---

## §3 — Commission / revenue-share withholding: how expected tax SHOULD be computed

The crux: revenue-share pay is **lumpy**. The naive periodic method (annualize *this* pay period × periods/year, tax it, divide back) massively **over-withholds** in a big-commission month and **under-withholds** in a lean month. CRA provides two correct mechanisms:

### 3.1 TD1X — Statement of Commission Income and Expenses for Payroll Tax Deductions
- An employee who earns commission (or commission + salary) files a **TD1X** so the employer withholds based on **estimated annual net commission income** instead of per-pay annualization.
- TD1X computation: estimated annual commissions + salary/wages − estimated annual **commission expenses** = **estimated annual net commission income**. Tax is then withheld as a **flat percentage of each commission payment** sized to hit that annual estimate (the employer runs the TD1X numbers through CRA's **PDOC** / the T4127 commission formula to get the rate).
- Effect: smooths withholding across lumpy commission so YTD deducted tracks the true annual liability. This is the *correct* withholding regime for genuine commission earners.
- Source: [CRA TD1X form page](https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/td1x.html); [TD1X PDF](https://www.cchwebsites.com/content/pdf/tax_forms/ca/en/td1x_en.pdf).

### 3.2 Bonus method (when there is no TD1X / for irregular payments)
- For periodic, irregular, or one-off commission/bonus payments, CRA's **bonus method** is used: (a) compute tax on the employee's *expected base* income for the period, (b) add the bonus/commission to annualized income and compute tax again, (c) the **difference** is the tax to withhold on the bonus/commission. This avoids the periodic method's error of pretending the lumpy amount recurs every pay period.
- Source: CRA **T4127 Payroll Deductions Formulas** bonus-method section — [T4127 122nd ed. (Jan 1 2026)](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan.html); method summary corroborated [here](https://www.hrreporter.com/focus-areas/payroll/ask-an-expert/306718).

### 3.3 What the reconciliation calculator should actually compute
The deliverable is **not** a per-paycheque withholding engine — it is a **year-to-date true-up check**: "given total YTD gross actually paid (salary + all revenue share, lumpiness already baked in) and YTD income tax actually deducted (from QBO), what *should* the YTD income tax be on that accumulated income, and is there a shortfall?"

That question is **method-agnostic about how the lumpy pay arrived** — it just needs the CRA **annual tax on accumulated income**, prorated to the portion of the year elapsed. That is the T4127 **Option 1 annualized** computation (§4). This sidesteps the TD1X/bonus-vs-periodic debate: whichever way withholding *happened*, the YTD-expected benchmark is the annualized CRA tax on the income earned to date. (TD1X/bonus method matter for *explaining* a variance and for *fixing* go-forward withholding, not for the benchmark itself.)

---

## §4 — Recommended formula for the reconciliation calculator

### 4.1 T4127 "Option 1" annual tax structure (high level)
CRA Option 1 computes **annual** tax then divides by pay periods. For a YTD true-up we use the annual functions directly and prorate by elapsed share of the year.

- **Federal annual tax:**  `T1 = R × A − K − K1 − (other credits)`
  where `A` = annual taxable income, `R` = the bracket rate, `K` = the bracket constant (the cumulative adjustment so you don't re-tax lower brackets), `K1` = federal BPA/personal credits × lowest rate (14%). Equivalent and easier to implement: **sum tax bracket-by-bracket** on `A`, then subtract `14% × BPA_fed(A)`.
- **Ontario annual tax:**  `T2 = R(ON) × A − KP − K1P`, then **add Ontario surtax V1** and **Ontario Health Premium V2**:
  `ON_tax = bracket_tax_ON(A) − 5.05% × BPA_ON  → call this BasicONtax`
  `V1 = 0.20 × max(0, BasicONtax − 5,710) + 0.36 × max(0, BasicONtax − 7,307)`
  `V2 = OHP(TaxableIncome)` per §2.4 tiers
  `T2_total = BasicONtax + V1 + V2`
- Source for the T1/T2/V1/V2 decomposition: [T4127 122nd ed., Jan 1 2026](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan.html). **[UNVERIFIED]** exact K-constants/credit codes not transcribed (canada.ca PDF returned 403 to the fetcher) — implement via explicit bracket summation (mathematically identical) and reconcile against PDOC for 2–3 employees before trusting.

### 4.2 Concrete calculator (inputs → expected YTD tax → variance)
**Inputs (per employee, from QBO/payroll):**
- `ytd_gross` — YTD gross earnings (salary + revenue share + taxable benefits).
- `ytd_tax_actual` — YTD income tax actually deducted (QBO Payroll Summary → "Income Tax"). *Income tax only — exclude CPP/EI.*
- `frac_year` — fraction of the tax year elapsed/earned. Best: `pay_periods_elapsed / pay_periods_per_year` (Originality = semi-monthly = 24). Fallback: `days_elapsed_in_calendar_year / 365`. For mid-year hires, annualize off the **employment-period** earnings, not Jan 1.
- Province = Ontario; year = 2026 constants from §2.

**Step 1 — Annualize the accumulated income:**
`annual_income = ytd_gross / frac_year`

**Step 2 — Annual federal tax** (bracket summation on `annual_income`, §2.1) minus `14% × BPA_fed`, where `BPA_fed` = $16,452, phased to $14,829 over net income $181,440→$258,482 (§2.1).

**Step 3 — Annual Ontario tax** = BasicONtax (brackets §2.2 minus `5.05% × $12,989`) + V1 surtax (§2.3) + V2 health premium (§2.4).

**Step 4 — Total annual tax:** `annual_tax = fed_tax + on_tax`.

**Step 5 — Expected YTD tax (tax on the accumulated income):**
`expected_ytd_tax = annual_tax × frac_year`
(Algebraically: annual tax on the run-rate income, scaled back to the portion earned — i.e. CRA's Option 1 logic. Equivalent to `annual_tax × (ytd_gross / annual_income)`.)

**Step 6 — Variance & flag:**
`variance = ytd_tax_actual − expected_ytd_tax`
- `variance < 0` → **under-withheld** by `|variance|` (the risk case — flag, size, and recommend a catch-up adjustment over remaining pay periods).
- `variance > 0` → over-withheld (employee gets it back at filing; usually informational).
- Suggested triage: green if `|variance| ≤ max($150, 3% × expected_ytd_tax)`; yellow up to 8%; red beyond. (Thresholds are a starting heuristic — tune with Markie.)

**Step 7 — Reconcile against the sheet:** for each employee, compare `expected_ytd_tax` to the sheet's existing **"Expected CRA Deduction (YTD)"** column and `ytd_tax_actual` to **"Actual Tax Deducted (YTD)"**. Material divergence from the sheet's expected column likely means the sheet used the crude flat-rate method (§1.4) — the new annualized figure is the better benchmark.

### 4.3 Assumptions & caveats (state these in the deliverable)
1. **Income tax only.** CPP/EI are separate and have their own annual maximums (CPP YMPE/CPP2, EI MIE) — do not fold them into the income-tax variance. (And re-verify the sheet's `CPP 74,600 / EI 68,900` against CRA 2026 — **[UNVERIFIED]**.)
2. **Annualization is an approximation for lumpy commission.** A revenue-share spike makes `annual_income` overstate the run-rate, inflating `expected_ytd_tax`. For employees with genuinely front/back-loaded commission, prefer reconciling **late in the year** (frac_year large) where annualization error shrinks, or compute expected tax directly on `ytd_gross` treated as near-final near year-end. This is the unavoidable lumpiness problem §3 describes; the YTD true-up is most reliable at/near fiscal close.
3. **TD1 claims default to "basic."** The math above assumes only the basic personal amount (federal + Ontario). If an employee filed a TD1 with extra credits (or additional tax requested), expected tax shifts — capture per-employee TD1 claim codes if available; otherwise note the calc assumes basic.
4. **Ontario surtax & health premium are required.** Omitting them (a common spreadsheet error) understates expected tax for mid/high earners — they are included above precisely because they "materially change ON tax owed."
5. **Verify constants against the live canada.ca PDFs before shipping.** WebFetch was blocked (403) on canada.ca; the bracket/BPA/surtax/health-premium figures here come from canada.ca-cited search results + TaxTips/Richter/Wealthsimple cross-checks and match the Originality sheet's own embedded tables, but the exact T4127 K-constants and the surtax thresholds ($5,710/$7,307) should be eyeballed on the live T4127/T4032ON-Jan-2026 PDFs.

---

### Source list
- Originality payroll sheet: Drive ID `1154Xi7Wk9qj9eg7O2j7jvIJff-982o1TBacefWY7YbE`
- Paystubs PDF: Drive ID `1Cga-Zb5WxZDs_9qaHhDZOBotKDka2tyr`
- Payroll Hub (Tax Tables / revenue-share definitions): Drive ID `1PyKRtdOlC1_eeEUj-0sdz5YFtS3a5INpUiX5PuI7yu8`
- Scorecard/PnL: Drive ID `1nF7xMXWRsF8gXu6fvArYmyi7d5iTph3cKeYOnS8fdmE`; Client info: `1LTWesMl3XR7wQdjNObAJ3yte2V7Ov8aijMJuSDafG7o`
- Federal brackets/BPA: https://www.taxtips.ca/taxrates/canada.htm ; https://www.wealthsimple.com/en-ca/learn/tax-brackets-canada ; https://ca.finance.yahoo.com/news/cra-released-tax-numbers-2026-145834810.html
- Ontario brackets/BPA: https://www.taxtips.ca/taxrates/on.htm ; https://www.richter.ca/our-insights/2026-ontario-income-tax-tables/ ; https://wealthnorth.ca/taxes/income-tax/ontario-income-tax-rates/
- Ontario surtax + health premium (authoritative): CRA T4032-ON Jan 1 2026 — https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan.html (PDF: https://www.canada.ca/content/dam/cra-arc/migration/cra-arc/tx/bsnss/tpcs/pyrll/t4032/2026/t4032-on-1-26e.pdf) ; https://paystubpro.ca/blog/ontario-payroll-taxes-guide
- TD1X: https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/td1x.html ; https://www.cchwebsites.com/content/pdf/tax_forms/ca/en/td1x_en.pdf
- T4127 (Option 1 / bonus method / formula constants), 122nd ed. Jan 1 2026: https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan.html
