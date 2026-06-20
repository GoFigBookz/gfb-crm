# Figgy Jr — Per-Client Payroll Details (from Google Sheets)

Extracted directly from the client payroll sheets/files. Where a field is not shown in the source, it is marked **(not shown)**. No values are inferred.

Sheets read (most recent pay period shown):
- Originality — `1154Xi7Wk9qj9eg7O2j7jvIJff-982o1TBacefWY7YbE` (pay date 15th/EOM; commission period Apr 2026)
- West York Paving — `1TkCX7FSfsO8UKaWDi24773SO-OQoIJhw` (paystub PDFs, pay period 30/05/2026–05/06/2026, pay date 12/06/2026)
- 2303851 Ontario Inc — `1d4ZYqlMVfIM6mwQDdcwA5kOKfhUfzSMo` (legacy .xls QBO export, Oct 2023–Sep 2024)
- Selective Painting — `1sYhf5Jy4rW8rqZO61xMjuZFFMVodagQkKCKhm8928sE`
- Clark Pools Owen Sound — `1BbnBDFhBFRA8CKs__jV-YNKIpKyfavkQ`
- Clark Pools Collingwood — `1P-m-fBBbKT-L8VrcYG6Fd73DeskmUfrO6z7HWOlnR7k`
- Sher-E-Punjab — `1BsiHTPaSnFhXZPwI_5YnLK32rdJhFOi6EWdCeujnPIo`

---

## ORIGINALITY (most important) — revenue share

### Pay frequency
Semi-monthly: **15th and End of Month (EOM)**. Hourly period split 1–15 and 16–EOM, processed 2 days after. Commission period runs monthly (sheet shows "Apr 2026"). Hours pulled from Clockify.

### Revenue-share employees vs. plain salary
The Originality sheet has TWO distinct comp groups:

**A. "Motion Invest" net-profit commission (the live revenue-share / profit-share that runs every period).** These people earn a percentage of Motion Invest's monthly Net Profit (NP) on top of base:
- **Kelley Van Boxmeer — 10% of Motion Invest NP** (column "Kelley 10% Comm Paid").
- **Ryan Gunn — 1% of Motion Invest NP** (column "Ryan 1% Comm Paid").
- Historical/closed participants visible in older tabs: **Amel — 5% of NP** (Fiscal 2024), **Eric — 10% of NP** (2021), and a separate **Melissa Robertson — 10% commission** off a different P&L ("Maddie" P&L, PnL minus payroll → 10%). These appear in historical tables, not the current active period.

**B. Salaried staff with an additional "%" figure shown beside their salary** (the 29.65% / 19.05% / 31% / 49.53% etc. column). NOTE: in the main current-period employee table this percentage column is the **effective tax/withholding rate** applied to that person's salary, not a revenue-share. The genuine revenue-share is the Motion Invest NP commission group above (Kelley/Ryan, plus historical Amel/Eric/Melissa). The one salaried person with a true external revenue-share doc is **Maddie Lambert-Taylor** (see link below).

**Plain salary (no revenue share), current period — Originality:** Andrade Meira, Nathan; Bejtic, Narcis; Bhagawati, Arnav; Bongiorno, Thomas; Empey, Sarah; Gillham, Jon; Lapp, Motiejus; Laroque, Kristin; Ma, Janay; Moshood, Joshua; Mc Nally, Liam; Patel, Urvish; Shafie, Ghazale; Tran, Trinh; Watt, Connor.
**Hourly (no revenue share):** Fraiman, Michael; Sawyer, Jessica; Zhu, Kayla.

### Revenue-share LINK (the P&L the % is calculated from)
The percentages are applied to **Motion Invest Net Profit**, sourced from the linked P&L document:
- **`https://docs.google.com/spreadsheets/d/1nF7xMXWRsF8gXu6fvArYmyi7d5iTph3cKeYOnS8fdmE/edit#gid=0`** — titled **"Originality.AI Scorecard and PnL"** (owner jonhaver11@gmail.com; linked from the Watt, Connor row). This is the live P&L feeding the NP figures.
- Maddie Lambert-Taylor's row links to **`https://docs.google.com/spreadsheets/d/1q3gwVuzUIeXfKeNJjvyG5sgMvqVzunkO5fu3hfsuU9c/edit#gid=75536714`** — her individual revenue/commission P&L. **This file could NOT be opened** (Drive returns "Requested entity was not found" — deleted or not shared with this account). A related historical doc exists: **"ContentRefined Updated Maddie Plan"** (`16YfG2f337lotoTUUhAECCBDJVqdVY7hthHeAiy-EYtM`), which documents Maddie's historical 33% profit-share split (25% to equity accrual, 56% cash commission, 19% to Laura) — context only, not the current Originality calc.
- Other linked docs referenced in the sheet: Conor Loan Tracker `1A_rCnumHknfQWFiQGlkeIZ_kCr9rBXFLyvgFTLZATxU`; Connor Watt advance-payback P&L `1nF7xMXWRsF8gXu6fvArYmyi7d5iTph3cKeYOnS8fdmE` (same Scorecard/PnL doc); a Prorate helper `1kiU4fsXjbBz3b4e8lXkyyHP2G8ZLkp_g`.

### Revenue-share percentage + how the dollar amount is computed
- Formula (from the Motion Invest tables): **commission = % × Motion Invest Net Profit for the month**, accrued monthly and paid (column "…Comm Paid"). Negative-NP months produce negative commission that carries against the running total.
  - Kelley: `NP × 10%`
  - Ryan: `NP × 1%`
  - (Amel `NP × 5%`, Eric `NP × 10%`, Melissa `NP × 10%` of PnL-less-payroll — historical)
- Example rows (Fiscal 2025): Nov NP $9,900.03 → Kelley $990.00, Ryan $99.00; Dec NP −$10,057.03 → Kelley −$1,005.70, Ryan −$100.57.

### Originality — phone allowance / expense reimbursement / other add-ons
- **Phone allowance:** none shown as a recurring line in this sheet. (Maddie Lambert-Taylor's 2025 **T2200** — separate PDF `1FWxLWpmEOduex5bqXzRQZfVNHH7Em1DW` — answers "pay for use of a cell phone? **No**" and reimbursements "**No**", so no cell allowance for her.)
- **Expense reimbursement:** the company summary row shows a combined **"Reimburse/Vac Pay/Bonus = $13,000.00"** for Originality this period (not broken out per employee in the table). No per-employee reimbursement amounts are itemized.
- **Other add-ons:**
  - **Grant funding:** Empey, Sarah row flagged "Grant"; Laroque, Kristin = "GRANT NRC"; a historical grant tab (ICT Boost 25% / DS4Y 75%) lists term-grant contractors (Gleeson, He, Wu, Flax, Elhelay, Prajapati, May/Janay, etc.) at hourly rates $23.08–$31.19.
  - **Advance / pay-back:** Watt, Connor — "Advance pay back 250 p/m" (links to his P&L).
  - **Stat pay:** sheet computes via Ontario calculator (gross last 4 wks 970.42 ÷ 20 = 48.521/day; 1 stat day = $48.52 example).
  - **Salary-rate notes:** Moshood, Joshua "Now Salary" (note: $83.34/hr from July 8); Empey start $4,166.67; Patel "Start May 6th 4166.67, Last day May 4 2026".

### Originality — pay rates (as shown)
Hourly:
- Fraiman, Michael — **$30.00/hr** (15th + EOM)
- Sawyer, Jessica — **$30.00/hr** (15th + EOM)
- Zhu, Kayla — **$70.00/hr** (15th + EOM)

Salary (monthly amount shown in the salary column):
- Andrade Meira, Nathan — $6,833.33
- Bejtic, Narcis — $8,268.75
- Bhagawati, Arnav — $6,562.50
- Bongiorno, Thomas — $7,612.50
- Empey, Sarah — $4,375.00 (start note $4,166.67)
- Gillham, Jon — $26,000.00
- Lapp, Motiejus — $1,354.17
- Laroque, Kristin — $3,416.67 (GRANT NRC)
- Ma, Janay — $6,142.50
- Moshood, Joshua — $7,000.00 ("Now Salary"; $83.34/hr ref)
- Mc Nally, Liam — $6,431.25
- Patel, Urvish — $396.07 (partial/last period; start ref $4,166.67)
- Shafie, Ghazale — $7,500.00
- Tran, Trinh — $9,528.75
- Watt, Connor — $7,525.00 (advance payback $250/mo)

---

## WEST YORK PAVING (paystub PDFs)

### Pay frequency
**Weekly** (pay period 30/05/2026–05/06/2026; pay date 12/06/2026; some paystubs note "M – Monthly" pay-period-type on the QBO template but the period shown is one week).

### Phone allowance
**None shown** on any paystub.

### Expense reimbursement
**None shown** ("OTHER PAY" lines are all $0.00).

### Other add-ons
- **Garnishment (deduction, not add-on):** Remo Sottile — $386.96 this period ($3,095.68 YTD).
- Vacation Pay accrued at 4% on hourly staff (shown as YTD vacation $; salaried = $0).
- No bonuses/commissions/car/health allowances shown.

### Pay rates (as shown)
Salaried (per period / YTD):
- Calogero Barone — Salary $1,720.92/period ($41,302.08 YTD)
- Carmela Barone — Salary $675.00 ($16,200.00 YTD)
- Dina Barone — Salary $1,186.92 ($28,486.08 YTD)
- Frank Barone — Salary $1,250.00 ($30,000.00 YTD)
- Giuseppe Barone — Salary $1,250.00 ($30,000.00 YTD)
- Loredana Barone — Salary $675.00 ($16,200.00 YTD)
- Maria Sottile — Salary $700.00 ($16,800.00 YTD)

Hourly (rate × 40 hrs unless noted):
- Gianpiero Cassaro — **$53.25/hr**
- Luis Chica — **$25.00/hr**
- Michelle Dinis — **$15.00/hr**
- Saif Naqwaj — **$27.50/hr**
- Carlos Pereira — **$35.00/hr**
- Miguel Perez — **$26.00/hr** (50 hrs)
- Edwin Purizaca — **$26.00/hr** (50 hrs)
- Jose Rolando — **$30.00/hr**
- Remo Sottile — **$30.00/hr** (garnishment applies)
- Thomas Sottile — **$25.00/hr**
- Vittorio Sottile — **$41.25/hr**

---

## 2303851 ONTARIO INC

The provided file is a **legacy QuickBooks .xls export** ("Payroll summary by employee report, From 01 Oct 2023 to 30 Sep 2024"). It is a binary QBO report; the readable content shows it is the holding-company payroll summary with employees **Gillham Stacey, Gunn Ryan, Robertson Melissa, Van Boxmeer Kelley, Watson Ryan** (the same Motion Invest / Originality-group people) and category columns including **Hours – Motion Invest Comm., Hours – SeaHorse, Hours – Reimbursement, Hours – Seahorse Comm, Hours – Expense Reimbursement**, plus the standard salary/vacation/tax columns.

- **Pay frequency:** **(not explicitly shown)** in the export; the Originality master summary lists "2303851" paid **$8,333.33 as Total Salary** with $0 hourly/commission for the current period (i.e. a salaried owner draw of $8,333.33/mo).
- **Phone allowance:** **(not shown)**.
- **Expense reimbursement:** the report HAS dedicated reimbursement columns ("Reimbursement", "Expense Reimbursement"), but per-employee dollar figures are inside the binary cells and **not cleanly extractable** from this .xls; current-period Originality summary shows 2303851 Reimburse/Vac/Bonus = $0.00.
- **Other add-ons:** commission columns present (Motion Invest Comm, SeaHorse Comm) — this is the entity that actually pays the Kelley/Ryan/Melissa revenue-share commissions described under Originality.
- **Per-employee rates/salaries:** **not extractable** from this binary export (request a Google-Sheet or PDF version to itemize).

> Note: 2303851 Ontario Inc is also the holding co in the **Clark Pools Collingwood** sheet (52.5% Class A/B owner; loan tables there).

---

## SELECTIVE PAINTING

A monthly **CRA-remittance / cost summary** sheet for a single employee, **Allesandro (Alessandro) Le Marco**.

- **Pay frequency:** monthly remittance rows (Jan/Feb/Mar shown); pay frequency itself **(not explicitly stated)** — figures are monthly accruals.
- **Phone allowance:** **none shown**.
- **Expense reimbursement:** **none shown**.
- **Other add-ons:** none (no bonus/commission/allowance lines).
- **Rate/salary:** **not stated as a rate**; sheet shows monthly **Gross Pay** for the one employee: Jan $2,971.96, Feb $7,752.94, Mar $11,629.41 (ramping). Tax params: CPP 5.95%, EI 1.66%, est. tax 15%.

---

## CLARK POOLS OWEN SOUND

An **employee-information master** (rates and terms), not a per-period run.

### Pay frequency
**(Not stated for hourly staff.)** Salaried staff are explicitly **Biweekly**.

### Phone allowance
**None shown.**

### Expense reimbursement
**None shown.**

### Other add-ons
- **Commission:** **Debbie Martin** (Store Clerk/AR) — "**Plus Commission on Hot tub and A/G Pools**": **$500–$1,000 per hot tub** (depends on price) and **$200–$300 per Above-Ground pool**.
- **Bonuses:** discretionary (Chris' discretion) **lump sum each December**, **$250 to $3,500 per employee** based on attendance/quality/attitude/tenure.
- Vacation Pay % shown per employee (4% or 6%; salaried 8%).

### Pay rates (as shown)
Hourly:
- Bartley, Cathy (Store Clerk) — **$19.00**, vac 4%, Part Time
- Bowlby, Dustin (Labourer) — **$22.00**, vac 4%, FT Seasonal
- Cook, Jammie (Technician) — **$31.00**, vac 6%, FT/Seasonal
- Dickinson, Dean (Labourer) — **$31.00**, vac 6%, FT Seasonal
- Kennedy, Michael (Labourer) — **$24.00**, vac 4%, FT Seasonal
- Martin, Debbie (Store Clerk/AR) — **$23.00**, vac 6%, FT + commission (above)
- Nickle, Brad (Labourer) — **$30.00**, vac 6%, FT Seasonal
- Shaw, Bradly (Labourer) — **$26.00**, vac 4%, FT Seasonal

Salary (biweekly):
- Prentice, Chris (Estimator/Proj Mgr) — **$6,120.00 biweekly**, vac 8%
- Prentice, Jennifer (AP/Bank Rec) — **$3,766.14 biweekly**, vac 8%

---

## CLARK POOLS COLLINGWOOD

A full per-period payroll workbook + shareholder/profit-share tables.

### Pay frequency
**Biweekly** (pay dates shown 5/15/2026 and 5/29/2026; two-week hourly periods, e.g. May 13–26).

### Phone allowance
**None shown** (sheet has Phone/Email columns but they are contact info, mostly blank, not allowances).

### Expense reimbursement
Combined column **"Reimburse/Bonus/Advance"** — most hourly staff get a flat **$23.08** each period (this recurs as a fixed line; labeled reimburse/bonus/advance, not itemized which). MacDonald, Aidan shows $23.00; Companion, Matteo and Lally, Dave often $0.

### Other add-ons (profit share)
- **Chris Hawton** — **Profit Share: 10% of profits, paid quarterly (Jan/Apr/Jul/Oct)** as a commission. Plus earned-equity ladder: <$50k NP/yr = 0% equity, $50–99k = 2%, $100k = 5%, up to max 25%. Owns 14.5% (145 Class A / 145 Class B).
- **Brendan Essex** — **10% of net profit, paid quarterly.** Owns 33% (330 Class A / 330 Class B) via $121k book-value buy-in + $40k 8% loan from Jon.
- Profit-share formula (from the "Net Profit / Chris 10% / Brendan 10%" tables): **each = Net Profit × 10%**, accrued per quarter, "Paid" tracked separately. Example: Q1 Dec NP $131,715.27 → Chris $13,171.53, Brendan $13,171.53.
- **Bonus:** Haight, Chris noted "Future – Construction bonus".
- Stat holiday pay computed (ESA s.24 method), 4% vacation pay on hourly.
- Pricing/rate ladder (note): "18 to start, $19 @ 3 months, $20 yr 1, $21 yr 3+, $23 sr. tech".

### Pay rates (as shown)
Salary:
- Chris Hawton — **$60,000.00/yr** (salary; $2,330.77/period + $23.08 reimburse)
- Brendan Essex — **$80,000.00/yr** (sheet shows $80k in run; shareholder note says $70,000/yr — discrepancy present in source; $3,100.00/period)

Hourly:
- Companion, Matteo — **$18.00**
- Greig, Logan — **$24.00** (Last Day Oct 28)
- Haight, Chris — **$27.00**
- Hawton, Corey — **$26.50**
- Koutsomichos, Justin — **$23.00**
- Lally, Dave — **$24.00**
- MacDonald, Aidan — **$21.00**
- Pool, Justin — **$22.00** (Last Day Jun 3)
- Robbeson, Adrian — **$24.00**
- Thompson, Chris — **$24.00**
- Venditti, Lisa — **$25.00**
- Weaver, Alan — **$35.00**

Related linked doc: AL/banked-hours tracking `1g-t9Is6WFdPpEE1LlEMntHYT1EY4fHcI3te6xiqW734`; intercompany loan tracker `1M2GlgnsYFogcjrF-xJZAOpwSe-dAmx5walHPJtmOtCA`.

---

## SHER-E-PUNJAB (restaurant)

Per-period payroll workbook (multiple pay periods).

### Pay frequency
**Biweekly** (pay dates 5/1, 5/15, 5/29, 6/12/2026; two-week hourly periods, e.g. May 27–Jun 9). Hours from TouchBistro.

### Phone allowance
**None shown.**

### Expense reimbursement
Column exists ("Reimburse/Bonus/Advance/Termination") but **no recurring per-employee amounts shown** (entries blank/$0). One salaried person's $70,000 salary line carries no reimbursement.

### Other add-ons
- **Vacation Pay 4%** on hourly staff (shown per line).
- Stat holiday pay computed (ESA s.24 method).
- No commissions / phone / car / health allowances.
- Note: "$17.60 is new start rate for Servers".

### Pay rates (as shown)
- Bhattrai, Surya (Chef) — **$21.00/hr**
- Bahadur Poudel, Upendra (BOH) — **$17.60/hr**
- Dahal, Akash (FOH) — **$19.00/hr**
- Dhimal, Rohit (BOH) — **$18.00/hr**
- Gurung, Dhiren (BOH) — **$18.00/hr**
- Limbu, Suraj (BOH) — **$18.00/hr** (rate column also shows $17.60 in one period block)
- Vasisth, Deepak (FOH) — **$17.60/hr** (ROE? flag)
- One **salaried** line — **$70,000.00/yr** ($2,692.31/period) — **name not labeled** in the readable rows (likely owner/manager); appears at top of each period block.

---

## Summary of phone-allowance & reimbursement findings (quick answer)

| Client | Recurring phone allowance | Expense reimbursement |
|---|---|---|
| Originality | None per-employee | Combined "Reimburse/Vac/Bonus" $13,000 company total (not itemized) |
| West York Paving | None | None |
| 2303851 Ontario Inc | (not shown) | Columns exist; figures not extractable from binary .xls |
| Selective Painting | None | None |
| Clark Pools Owen Sound | None | None |
| Clark Pools Collingwood | None | Flat $23.08/period "Reimburse/Bonus/Advance" most hourly |
| Sher-E-Punjab | None | Column exists, no amounts shown |

**No client shows a dedicated recurring phone allowance line** in these sheets. Closest signal is the per-period $23.08 "Reimburse/Bonus/Advance" at Clark Pools Collingwood (purpose not specified) and the lump "Reimburse/Vac/Bonus" total at Originality.
