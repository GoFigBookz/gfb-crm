# CRA Payroll Deductions Constants — 2026, Ontario (T4127 exact method)

Verified reference for building a CRA-grade payroll deductions calculator using
the **T4127 "Payroll Deductions Formulas"** exact-calculation method, **2026 tax
year, Ontario (outside Quebec)**.

> Precision note: these numbers drive real remittances. Each figure cites a
> source. Anything not independently verified for 2026 is flagged with the 2025
> fallback clearly labeled.

## Mid-year editions (READ FIRST)
CRA issues T4127 twice a year. For 2026 there are two editions:
- **122nd Edition — effective January 1, 2026** (`T4127-JAN`)
- **123rd Edition — effective July 1, 2026** (`T4127-JUL`)

**As of June 2026 you are still under the January 1, 2026 (122nd) edition** —
the July edition takes effect on payments dated **on/after July 1, 2026**. For
the **federal and Ontario income-tax brackets, rates, BPA, CEA, surtax, and
health premium**, the two 2026 editions carry the **same indexed annual figures**
(the brackets/credits are indexed once on Jan 1 and do not re-index mid-year).
The July edition exists to absorb any in-year statutory changes (e.g.
province-specific BPA bumps that get pro-rated for H2); none affecting **federal
or Ontario** core constants are known as of this writing. CPP/EI are calendar-year
constants and are identical in both editions. **Recommendation:** code the values
below; switch the *effective-date pointer* to the 123rd edition for pay dates
≥ 2026-07-01, and re-verify the July PDF for any Ontario/federal deltas before
that cutover.

---

## CPP — Canada Pension Plan (2026)

| Item | 2026 value | Source |
|---|---|---|
| Max pensionable earnings (YMPE) | **$74,600.00** | canada.ca CPP rates; CPB Canada |
| Basic exemption (annual) | **$3,500.00** | canada.ca; CPB Canada |
| Employee contribution rate (total) | **5.95%** | canada.ca; CPB Canada |
| — of which **base** rate (for tax credit K2) | **4.95%** | T4127 / CPP enhancement design |
| — of which **enhanced** ("first additional") rate | **1.00%** | T4127 / CPP enhancement design |
| Max annual employee contribution (total) | **$4,230.45** | CPB Canada |
| — Max **base** employee contribution | **$3,519.45** | = 4.95% × (74,600 − 3,500) |
| — Max **enhanced** (deductible) contribution | **$711.00** | = 1.00% × (74,600 − 3,500) |

### CPP2 (second additional)
| Item | 2026 value | Source |
|---|---|---|
| Second earnings ceiling (YAMPE) | **$85,000.00** | CPB Canada; Insight CPA |
| CPP2 earnings band | $74,600 → $85,000 | CPB Canada |
| CPP2 rate (employee) | **4.00%** | CPB Canada |
| Max annual CPP2 contribution (employee) | **$416.00** | CPB Canada (= 4% × (85,000 − 74,600)) |

Employer matches CPP and CPP2 1:1. Self-employed: 11.90% / 8.00% (max $8,460.90 /
$832.00) — not needed for T4 source deductions.

---

## EI — Employment Insurance (2026, outside Quebec)

| Item | 2026 value | Source |
|---|---|---|
| Employee premium rate | **1.63%** ($1.63 per $100) | EI Commission; Canadian HR Reporter |
| Max annual insurable earnings (MIE) | **$68,900.00** | EI Commission; Canadian HR Reporter |
| Max annual employee premium | **$1,123.07** | = 1.63% × 68,900; Canadian HR Reporter |
| Employer multiplier | **1.4×** (employer rate 2.282%, max $1,572.30) | Canadian HR Reporter |

(Quebec, for reference only: employee rate 1.30%, max $895.70 — NOT applicable to
Ontario clients.)

---

## Federal income tax (T4127, 2026)

### Brackets and rates (annual taxable income A)
| Bracket (A) | Rate R |
|---|---|
| 0 – $58,523 | **14.00%** |
| $58,523.01 – $117,045 | 20.50% |
| $117,045.01 – $181,440 | 26.00% |
| $181,440.01 – $258,482 | 29.00% |
| over $258,482 | 33.00% |

Source: KPMG 2026 rate card; TaxTips.ca; ts2.tech. **Lowest federal rate = 14.00%**
(used for all federal non-refundable credits). Note 2026 is the first **full** year
at 14% (2025 was a blended 14.5% after the mid-2025 rate cut).

### K — bracket constant (the amount to subtract). Compute as the running
adjustment so the marginal formula equals a true progressive tax. Using
R = top rate of the bracket and the cumulative-difference method:

| Bracket top | R | **K (constant to subtract)** |
|---|---|---|
| ≤ 58,523 | 0.14 | **$0** |
| ≤ 117,045 | 0.205 | **$3,803.99** (= 0.065 × 58,523) |
| ≤ 181,440 | 0.26 | **$10,241.46** (+ 0.055 × 117,045) |
| ≤ 258,482 | 0.29 | **$15,684.66** (+ 0.03 × 181,440) |
| > 258,482 | 0.33 | **$26,023.94** (+ 0.04 × 258,482) |

> K is derived from the published brackets (CRA lists these as Chart 1 in T4127).
> Each row's K = previous K + (this rate − previous rate) × this bracket's lower
> threshold. Verify against the T4127 PDF Chart 1 before go-live; the brackets
> themselves are confirmed by 3 independent sources.

### Federal credits
| Item | 2026 value | Source |
|---|---|---|
| Basic Personal Amount — **maximum** (BPAF) | **$16,452** | Investment Executive; Narcity; canada.ca |
| BPA — **minimum / floor** (high income) | **$14,829** | Investment Executive |
| BPA phase-out **starts** (net income) | **$181,440** | Investment Executive |
| BPA phase-out **ends** (net income) | **$258,482** | Investment Executive |
| Canada Employment Amount (CEA) | **$1,501** | TaxTips.ca (CEA tax credit) |
| Lowest federal rate (for credits) | **14.00%** | KPMG; canada.ca |

BPA phase-out formula (matches the top two brackets): for net income NI between
$181,440 and $258,482, BPAF = 16,452 − (16,452 − 14,829) × (NI − 181,440) /
(258,482 − 181,440). Below $181,440 → $16,452; above $258,482 → $14,829.

> ⚠ CEA flag: one early secondary source reported "$210.14" — that is the *credit
> value* garble, not the amount. The CEA **amount** is $1,501 (credit = 14% ×
> 1,501 ≈ $210.14, which explains the confusion). Use **$1,501** as the amount in
> K4. Re-confirm against T4127 Chart 2 at go-live.

---

## Ontario income tax (T4032ON / T4127, 2026)

### Brackets and rates
| Bracket | Rate |
|---|---|
| 0 – $53,891 | **5.05%** |
| $53,891.01 – $107,785 | 9.15% |
| $107,785.01 – $150,000 | 11.16% |
| $150,000.01 – $220,000 | 12.16% |
| over $220,000 | 13.16% |

Source: KPMG 2026; PaystubPRO; Richter. **Lowest Ontario rate = 5.05%** (for ON
non-refundable credits).

### Ontario credits
| Item | 2026 value | Source |
|---|---|---|
| Ontario Basic Personal Amount | **$12,989** | PaystubPRO; immigrationnewscanada |
| Lowest ON rate (credits) | **5.05%** | as above |

### Ontario surtax (factor V1)
Applied to **basic Ontario tax after the ON BPA credit** (call it T4):
- **20%** of the amount by which T4 exceeds **$5,818**
- **+ 36%** (additional) of the amount by which T4 exceeds **$7,307**

V1 = 0.20 × max(0, T4 − 5,818) + 0.36 × max(0, T4 − 7,307).
Source: EY 2026 ON; CanadianTaxCalculators; PaystubPRO (two sources agree on
$5,818 / $7,307; one outlier secondary blog said $5,554/$7,108 — **rejected**,
likely a stale/mis-indexed figure. Verify on T4032ON before go-live.)

### Ontario Health Premium (factor V2)
Function of annual taxable income A (per CRA T4127 V2 schedule):
| Taxable income A | OHP (V2) |
|---|---|
| ≤ $20,000 | $0 |
| $20,000 – $36,000 | lesser of $300 and 6% × (A − 20,000) |
| $36,000 – $48,000 | lesser of $450 and $300 + 6% × (A − 36,000) |
| $48,000 – $72,000 | lesser of $600 and $450 + 25% × (A − 48,000) |
| $72,000 – $200,000 | lesser of $750 and $600 + 25% × (A − 72,000) |
| > $200,000 | lesser of $900 and $750 + 25% × (A − 200,000) |

Source: CRA T4127 V2 formula (canada.ca; "$750 + 0.25×(A − 200,000), cap $900"
confirmed verbatim). Plateau values: $300, $450, $600, $750, $900. The breakpoint
rates are 6% in the first two bands and 25% in the upper three.
> ⚠ One secondary blog listed slightly different intermediate breakpoints
> ($38,500, $25,000) — that is a mis-stated version. The CRA V2 structure above
> (20k/36k/48k/72k/200k bands; 6% then 25%) is the canonical T4127 schedule;
> confirm against the 2026 T4127 PDF Chart for the exact wording before go-live.

---

## T4127 algorithm — federal annual tax structure (sanity check: CONFIRMED)

**T1 = (R × A) − K − K1 − K2 − K3 − K4**, where:
- **A** = annualized taxable income (gross-to-annual, **minus the enhanced/
  "first additional" CPP contribution and the CPP2 contribution**, which are
  *deductions* from income, not credits — see CPP note below).
- **R** = the rate of the bracket A falls in; **K** = that bracket's constant
  (table above).
- **K1** = lowest federal rate × BPAF = **0.14 × $16,452** (use the income-reduced
  BPAF if applicable).
- **K2** = lowest federal rate × (annual **base** CPP + annual EI), each grossed
  from the pay period to annual and **capped at its annual maximum**:
  K2 = 0.14 × [ min(annualized base-CPP, **$3,519.45**) + min(annualized EI,
  **$1,123.07**) ]. **Only the BASE (4.95%) CPP is credited here** — the enhanced
  1% is excluded from the credit because it was already deducted from income.
- **K3** = other authorized federal credits (e.g. medical, donations) — usually 0
  at source unless a TD1 authorizes it.
- **K4** = Canada Employment credit = lowest federal rate × min(A, CEA) =
  **0.14 × $1,501** (= $210.14 max).

### CPP enhancement handling (the part people get wrong) — CONFIRMED
Since **January 1, 2023**, the CPP **enhanced ("first additional") contribution**
is a **deduction from income at source**, not a tax credit. So:
1. When building **A** (annual taxable income), **subtract** the annualized
   enhanced CPP (1% portion, max **$711.00**) **and** the annualized CPP2 (max
   **$416.00**). These reduce taxable income.
2. **K2** then credits **only the base CPP** (4.95% portion, max **$3,519.45**)
   plus EI. The T4127 K2 formula was specifically modified in 2023 to **isolate
   base CPP from total CPP** for exactly this reason (CRA confirms "K2 formulas
   modified to isolate CPP base contributions from total CPP contributions").

### Provincial side (Ontario), parallel structure
- **T2 (basic ON tax)** = (V × A) − KP, with V/KP the ON bracket rate/constant.
- **T4 = T2 − K1P − K2P − K3P − K4P** (ON credits at ON lowest rate 5.05%:
  K1P = 0.0505 × ON BPA $12,989; K2P = 0.0505 × (base CPP + EI capped)).
- **Provincial tax payable** = T4 **+ V1 (surtax)** **+ V2 (health premium)**
  − any provincial-specific reductions. Then annual provincial tax / pay periods.

---

## Quick-reference constants (copy into config)

```
CPP_2026 = { YMPE: 74600, EXEMPTION: 3500, RATE_TOTAL: 0.0595, RATE_BASE: 0.0495,
             RATE_ENH: 0.01, MAX_TOTAL: 4230.45, MAX_BASE: 3519.45, MAX_ENH: 711.00 }
CPP2_2026 = { YAMPE: 85000, RATE: 0.04, MAX: 416.00 }
EI_2026   = { RATE: 0.0163, MIE: 68900, MAX: 1123.07, EMPLOYER_MULT: 1.4 }
FED_2026  = { BRACKETS: [58523,117045,181440,258482],
              RATES: [0.14,0.205,0.26,0.29,0.33],
              K: [0, 3803.99, 10241.46, 15684.66, 26023.94],
              BPA_MAX: 16452, BPA_MIN: 14829, BPA_PHASE_START: 181440,
              BPA_PHASE_END: 258482, CEA: 1501, LOW_RATE: 0.14 }
ON_2026   = { BRACKETS: [53891,107785,150000,220000],
              RATES: [0.0505,0.0915,0.1116,0.1216,0.1316],
              BPA: 12989, LOW_RATE: 0.0505,
              SURTAX_T1: 5818, SURTAX_T2: 7307, SURTAX_R1: 0.20, SURTAX_R2: 0.36,
              OHP_BANDS: [20000,36000,48000,72000,200000],
              OHP_CAPS: [300,450,600,750,900], OHP_RATES: [0.06,0.06,0.25,0.25,0.25] }
EDITION: "T4127 122nd (Jan 1 2026) until 2026-06-30; 123rd (Jul 1 2026) after"
```

---

## Verification status / flags
- ✅ CPP, CPP2, EI: fully verified (CRA announcement + CPB Canada + EI Commission).
- ✅ Federal brackets/rates, BPA max/min/phase-out, lowest rate: 3 independent
  sources agree (KPMG, TaxTips, Investment Executive).
- ⚠ **Federal K constants**: *derived* from the confirmed brackets, not lifted
  verbatim from the T4127 PDF (canada.ca/cchwebsites PDFs returned 403 to the
  fetch tool). Re-check against T4127 Chart 1 at go-live — brackets are solid, so
  K is arithmetically determined.
- ⚠ **CEA = $1,501**: from TaxTips; one source garbled it to the $210.14 credit
  value. High confidence on $1,501; confirm on T4127 Chart 2.
- ⚠ **Ontario surtax thresholds $5,818 / $7,307**: 2 sources agree; 1 outlier
  blog disagreed (rejected). Confirm on T4032ON.
- ⚠ **OHP V2 band breakpoints**: canonical CRA schedule used; one blog had
  mis-stated intermediate bands (rejected). Confirm the V2 chart wording.
- ⚠ **Jan vs Jul 2026**: federal/Ontario core figures expected identical across
  both editions; re-read the 123rd-edition PDF for any Ontario/federal delta
  before the 2026-07-01 cutover.

### Sources
- CRA CPP rates/maximums/exemptions — canada.ca
- Certified Professional Bookkeepers of Canada — 2026 CPP announcement (YMPE $74,600, max $4,230.45, CPP2)
- Insight Accounting CPA — CPP2 2026 ($85,000 YAMPE, $416 max)
- Canadian HR Reporter — 2026 EI rate $1.63, MIE $68,900, max $1,123.07, employer 1.4×
- EI Commission (canada.ca) — 2026 EI premium rate
- KPMG — Canada federal & provincial tax rates and brackets 2026 (PDF)
- TaxTips.ca — 2025/2026 federal tax rates; Canada Employment Amount tax credit
- Investment Executive — Essential tax numbers 2026 (BPA $16,452/$14,829, phase-out $181,440–$258,482)
- Narcity — 2026 basic personal amount
- EY — 2026 Ontario combined tax rates (surtax, health premium)
- PaystubPRO Canada — Ontario payroll taxes 2026 (BPA $12,989, surtax, brackets)
- CanadianTaxCalculators — Ontario surtax & health premium stacking
- Richter — 2026 Ontario income tax tables
- ts2.tech — Canada 2026 tax brackets summary
- Mercans — CRA 2026 payroll deductions guides released (T4127 122nd/123rd, T4032)
- canada.ca T4127 — Payroll Deductions Formulas 122nd (Jan 2026) & 123rd (Jul 2026)

_Compiled 2026-06-20 for the gfb-crm / Figgy Jr payroll calculator._
