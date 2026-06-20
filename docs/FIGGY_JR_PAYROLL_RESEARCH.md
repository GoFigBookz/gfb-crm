# Figgy Jr — Payroll Module Research & Design

**Date:** 2026-06-20
**Author:** Claude Code (research agent)
**Status:** Research + design only — NO code/schema changed.
**Scope:** Design a payroll module for the Go Fig Bookz CRM. Every factual claim is
grounded in a real source (Drive file ID, Make scenario ID, QBO Payroll API, or web).
Unverified items are marked **[UNVERIFIED]** explicitly.

---

## 0. Sourcing note / what was reachable this session

- **Google Drive:** reachable. All file/folder IDs below are real and were read this session.
- **Make (team 2327575):** reachable. Full scenario list pulled; Clockify Pull (5323280)
  blueprint inspected.
- **QBO Payroll MCP:** **NOT reachable this session** — every `qbo_payroll_*` call returned
  `MCP server "Intuit_QuickBooks" requires re-authorization (token expired)`. Therefore **all
  QBO-Payroll-derived facts (employee counts, pay types, autopay status, last run) are
  [UNVERIFIED] from QBO** and are inferred from Drive paystubs/sheets instead. Re-auth the
  Intuit MCP and re-run the four `qbo_payroll_*` tools per realm to confirm.
- **Web research:** reachable; Canadian pay-run model + 2026 CPP/EI rates gathered (see §6).

---

## 1. Per-company table

Key for "Hours source": where the hours/gross originate before they become a pay run.
Employee counts marked **[UNVERIFIED — from Drive]** are counted from the most recent paystub
PDF/sheet, not from QBO Payroll.

| Company | Entity / realm | Pay frequency | # employees | Hours / gross source | What the CRM must do | Drive report name + ID |
|---|---|---|---|---|---|---|
| **West York Paving** | West York Paving Ltd. (own QBO realm; Make scenario **FIGGY QBO API — West York Paving = 5389401**) | **Weekly**, remitter = **regular** (per Client Info doc) | **[UNVERIFIED]** ~handful (weekly paystub PDFs are multi-employee) | Autopay already runs **inside QuickBooks** — no hours entry by CRM | **PRINT & EMAIL weekly paystubs only.** No calc. | Folder "West York Paving Payroll" **10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj** (the drop folder); paystub PDFs e.g. "Payday May 29, 2026.pdf" **1tdEpHdrVL6TAB548qSxeyIC9zUWPxxbH**, "Jun 5th, 2026 Paystubs.pdf" **1qOomGNKwEvGTobIe_zMfsqciPMrjC8Rg**, "Jun 12th, 2026 Paystubs.pdf" **1TkCX7FSfsO8UKaWDi24773SO-OQoIJhw**, "West York Paving Jun 19 payroll.pdf" **1lel6-qWVWTtZXSQz6BvSCL6ONg0Qbkyb**; "West York Paving Payroll" sheet **1_G0YDO0A0zH3oiQDYtmMnTp7GLSvhQoaezAcRD76yGA**; "PD7A West York Paving.pdf" **1JqvGaSt-dXDeob5GCIwmNPuYcJUgRgxr**; "WestYorkPavingLtd._PayrollSummaryByEmployee_10062026_125.xls" **10m6F776d-OyP3X1TMBobGjh-RJN8ToP_** |
| **Selective Painting** | Selective Painting (HST RT 784617565; WSIB 46023) | **Monthly** roll-up (sheet has Jan/Feb/Mar… rows) | **1** (Allesandro Le Marco) [from sheet] | **Gross pay handed in; sheet already computes** CPP/EI/tax/employer/remittance | Capture gross → store the computed CPP/EI/tax/remittance (sheet logic) → produce CRA remittance figure | "Selective Painting Payroll" sheet **1sYhf5Jy4rW8rqZO61xMjuZFFMVodagQkKCKhm8928sE** (columns below). Note: Client Info doc says "Payroll Processing: N/A" but a live payroll sheet exists — **flag for Markie to reconcile.** |
| **Originality (.AI)** | Originality.AI Inc, 1 First Street #220, Collingwood ON | Mixed: **salaried staff paid on the 6th** (period "05-06-2026") + **hourly staff semi-monthly** (period 16–31 May, total-hours shown) | **13** on the 2026-06-05 stub run [from PDF]: Bejtic, Bhagawati, Bongiorno, Empey, Fraiman*, Gillham, Lambert, McNally, Sawyer*, Shafie, Tran, Watt*, Zhu* (*=hourly w/ Total Hours) | **Clockify** for hourly staff (timesheets) → hours feed the run | Pull Clockify hours, build the run, produce paystubs | "Originality Last Pay Stubs.pdf" **1Cga-Zb5WxZDs_9qaHhDZOBotKDka2tyr**; "Originality AI Invoice.pdf" **1XK_MWnhehjvoNiGpPEk6pmNReemUkvcC** |
| **Clark Pools Owen Sound (Clark OS)** | realm 9341456017349963, conn 9302460; Make QBO scenario **5347484** | **[UNVERIFIED]** | **[UNVERIFIED]** | **Jobber AND TouchBistro** (per Markie). NOTE: the only "OS-Jobber" file found is a **revenue/invoice export**, not an hours export — see §4 caveat. | Pull hours from Jobber + TouchBistro, build the run | "OS-Jobber May 2026" sheet **1-hdnCltf7ih9_Hp-MchOBDsKdAbLgzq5lCRmrESIhc0** (this is a Jobber **invoice/revenue** export, columns = invoice#, client, line items, totals — NOT employee hours); Jobber folder **1Gmvvyym2J4EPznaAgyzTcdVWV_pUHoxx** |
| **Clark Pools Collingwood (Clark CW)** | realm 13633946244024404, conn 9291854; Make QBO scenario **5347489** | **[UNVERIFIED]** | **[UNVERIFIED]** | **Jobber AND TouchBistro** (per Markie) | Pull hours from Jobber + TouchBistro, build the run | No dedicated Clark CW hours/payroll sheet found this session — **[UNVERIFIED]** |
| **2303851 Ontario Inc.** | RP 847759909RP0001; FYE Sep 30; Make QBO scenario **5343229** | **Monthly** (Client Info: "Payroll Processing (Monthly)") | **[UNVERIFIED]** | **[UNVERIFIED]** — historical "PayrollSummaryByEmployee" export exists | Monthly run + remittance | "2303851OntarioInc._PayrollSummaryByEmployee_10082024_1320.xls" **1d4ZYqlMVfIM6mwQDdcwA5kOKfhUfzSMo**; Client Info **1fLLB27VahF5Kc8mw9CkPikyh4een07iv0NX9YTyiBTE** |
| **Fractal (SAAS Inc.)** | RP 739247070RP0001; FYE Sep 30; Stripe integration | **Monthly** (Client Info: "Payroll Processing: Yes — Frequency: Monthly") | **[UNVERIFIED]** | **[UNVERIFIED]** | Monthly run + remittance | Client Info **1sd-ndUjxk4b4A1C7xGtpi3KVzn9JS_741_uI5kE-drE** |

### Restaurants using TouchBistro (per Markie — note on naming)
- **"Old Spot Pub"** and **"Sherry Punjab"** are the TouchBistro restaurants. Drive shows the
  formal entity for the latter: **"1001196626 Ontario Ltd (Sher-E-Punjab)"** (Client Info
  **1IiLR1jyiVne4WzvdDgW0tlwGSGrLDeIagaY3KHCR5Yg**; "Sher-E-Punjab Payroll Tax.pdf"
  **1sgg62wEuu5V5pbYMNVUIv7EXnHzAtuCV**; Finance folder **1pbNsufSywSXkETjYRTg8zFeqBxBpnuWy**).
  No "Old Spot Pub" file was located this session — **[UNVERIFIED]**. These are payroll clients
  whose **hours source is TouchBistro**, distinct from the Clark pools (Markie said TouchBistro
  is "used by restaurants Old Spot Pub and Sherry Punjab"; he also said Clark uses TouchBistro —
  reconcile whether Clark genuinely pulls TouchBistro or that was a conflation).

### "West York" vs "West selective painting" — RESOLVED: **two separate companies.**
Drive has independent client profiles, finance folders, and HST/CRA numbers for each:
- **West York Paving Ltd.** — CRA# 877933515; weekly payroll; autopay in QBO; own QBO realm
  + Make scenario 5389401.
- **Selective Painting** — HST RT 784617565RT0001; WSIB 46023; monthly 1-employee gross
  roll-up sheet.
They are **not** one company. (Sources: the two Client Info docs and two Finance folders cited above.)

---

## 2. Recommended CRM data model

### 2.1 What already exists (reuse, do not rebuild)
- **`clients`** table — the tenant key. Every payroll row keys off `clients.id`. (Existing.)
  Relevant existing columns on `clients` include `hasPayroll`, `payrollFrequency`
  (`weekly|bi-weekly|semi-monthly|monthly|self`), `payrollRemitterFreq`
  (`regular|quarterly|accelerated`), `payrollRpNumber`, `lastPayrollRemitted` —
  see `db/schema.ts`. **Reuse these for the per-client payroll config; don't duplicate.**
- **`employees`** table (`db/schema.ts` ~line 936) — already rich: `clientId`, name, `sin`,
  `payType` (`salary|hourly|commission|contract`), `annualSalary`, `hourlyRate`,
  `hoursPerWeek`, benefits flags, and **T4 box fields** (`t4Box14Wages`, `t4Box16Cpp`,
  `t4Box18Ei`, `t4Box20Rpp`, `t4Box44UnionDues`, `t4Box46Charitable`). Backed by
  **`employeeRouter`** (`api/employee-router.ts`, full CRUD) and surfaced in
  **`src/pages/Employees.tsx`** (per-client employee manager, client selector + add/edit/delete).
- **`timesheets`** table (`db/schema.ts` ~line 907) — already models per-employee, per-pay-period
  hours: `clientId`, `employeeId`, `payPeriodStart/End`, `regularHours`, `overtimeHours`,
  `vacationHours`, `sickHours`, `statHolidayHours`, `hourlyRate`, `overtimeRate`,
  `status` (`draft|submitted|approved|paid`). **It has NO router and NO UI yet** — it is the
  natural hours line-item surface to wire up.
- **`connectorStatements` / `connectorSyncLogs`** (`db/schema.ts` ~line 1248) — already enumerate
  providers `wise|stripe|jobber|touchbistro|paypal`. The Jobber/TouchBistro hours import can ride
  these rails or extend their provider enum.

> **Verdict:** ~70% of the model already exists. The gap is a **pay-run header** that groups
> timesheets into one run per client per period, **earnings/deduction line storage** richer than
> the flat timesheet hours, and a **remittance/T4** layer.

### 2.2 New tables to add (proposed — names/cols are a design, not built)

**`pay_runs`** — one row per client per pay period (the "run").
```
id                pk
clientId          fk clients.id            -- tenant key (reuse)
payPeriodStart    timestamp
payPeriodEnd      timestamp
payDate           timestamp
frequency         weekly|biweekly|semi_monthly|monthly  -- snapshot of client setting
runType           regular|off_cycle|bonus
status            draft|review|approved|paid|posted
hoursSource       manual|clockify|jobber|touchbistro|qbo_autopay  -- provenance
totalGross        real
totalNet          real
totalEmployeeDeductions  real
totalEmployerCost real
remittanceId      fk remittances.id  (nullable)
notes / createdAt / updatedAt
```

**`pay_run_lines`** — one row per employee per run (the paystub). Replaces/augments raw timesheet.
```
id  pk
payRunId   fk pay_runs.id
employeeId fk employees.id
regularHours, overtimeHours, vacationHours, statHolidayHours, sickHours   real
grossPay, vacationPayAccrued, vacationPayPaid                              real
cppEmployee, cpp2Employee, eiEmployee, federalTax, provincialTax          real
otherDeductions (json), employeeNetPay                                    real
cppEmployer, cpp2Employer, eiEmployer                                     real
netPay
```
> Per the web research (§6), store **per-earning flags** vacationable/pensionable/insurable if you
> want to compute T4 boxes 24/26 + CPP2 cleanly. If earnings stay simple (most clients here are
> salary or single gross), the flat columns above suffice for v1.

**`payroll_remittances`** — the PD7A figure per client per remittance period.
```
id pk · clientId fk · periodStart · periodEnd · dueDate
remitterType regular|quarterly|accelerated   (reuse clients.payrollRemitterFreq)
incomeTax · cppEmployee · cppEmployer · eiEmployee · eiEmployer · totalRemittance
status pending|filed · filedDate · createdAt
```

**(Optional v3) `t4_slips`** — already mostly covered by the T4 box columns on `employees`; a
per-year slip table only needed when you generate slips. Defer.

### 2.3 The "one clean sheet" entry surface (what Markie asked for)
A single page, **separated by client**, with **multiple employees and multiple payrolls per
client**. Concretely:

- **Client selector** at top (reuse the `Employees.tsx` pattern — `crmClient.list` + state).
- **Per selected client:** a list of **pay runs** (newest first), each expandable into a grid of
  **pay-run lines** (one row per employee = the "clean sheet"). Columns: Employee · Reg hrs ·
  OT · Vac · Stat · Gross · CPP · EI · Tax · Net — editable inline, mirroring the Selective
  Painting / Originality stub layout.
- **"New pay run"** button → pick period + pay date → auto-seed one line per active employee of
  that client (from `employees`), pre-fill rates from the employee record.
- **Provenance badge** per run (manual / Clockify / Jobber / TouchBistro / QBO autopay) so West
  York shows "autopay — print only" and Originality shows "Clockify".
- This is `pay_runs` + `pay_run_lines` rendered as a master-detail grid; the existing `timesheets`
  table can be the v1 backing store for the hours columns if you don't want new tables on day one.

---

## 3. Phased rollout plan (recommended build order)

**Phase 1 — Manual one-clean-sheet + per-client separation + West York paystub print/email.**
- Add `pay_runs` + `pay_run_lines` (or reuse `timesheets`), a `payrollRunRouter`, and a
  "Payroll" page modeled on `Employees.tsx` (client selector → runs → editable line grid).
- **West York first because it's the simplest, highest-value win:** no calc, no hours entry —
  just *fetch the weekly paystub PDF from the drop folder and email it.* Drop folder
  **10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj** already exists with weekly PDFs. Wire a
  "print/email paystubs" action (Drive read + Gmail send) keyed to the weekly cadence.
- Selective Painting (1 employee, monthly gross roll-up) is the second easy case — capture gross,
  store the sheet's CPP/EI/tax/remittance outputs.

**Phase 2 — Clockify → Originality import.**
- Clockify pull already exists as a generic HTTP proxy (Make scenario **5323280**, on-demand,
  takes apiKey/url/method/body — confirmed this session). Map Clockify time entries → hours on the
  hourly Originality employees' `pay_run_lines`. Salaried Originality staff stay manual/auto.

**Phase 3 — Jobber / TouchBistro → Clark (+ restaurants).**
- **Build needed:** no Jobber or TouchBistro *hours* scenario exists in Make today (only QBO and
  Clockify proxies). The one "OS-Jobber" sheet found is a revenue export, not hours (§4). Decide
  whether Jobber hours come via Jobber API (timesheets) or a sheet export; same for TouchBistro
  (Old Spot Pub, Sher-E-Punjab). `connectorStatements` already enumerate both providers.

**Phase 4 — Deductions / remittance / T4.**
- `payroll_remittances` + PD7A generation (remitter rules in §6), then T4 slips/T4 Summary using
  the existing `employees` T4 box columns. Year-end only; lowest urgency.

---

## 4. Integration notes — what has an API/Make today vs. needs building

| Source | Today | Concrete IDs | Build needed |
|---|---|---|---|
| **Clockify (Originality hours)** | ✅ Exists | Make scenario **5323280** `FIGGY — Clockify Pull` (generic HTTP proxy; inputs apiKey/url/method/body; on-demand; returns `tool_output`). Confirmed live this session. | CRM-side mapper: Clockify entries → `pay_run_lines` hours. |
| **QBO Payroll (per realm)** | ⚠️ Partial | Per-realm Make QBO scenarios: West York **5389401**, Clark OS **5347484**, Clark CW **5347489**, 2303851 **5343229**, Alderson 5342778, Ovita 5343005, Universal 5342806. QBO Payroll **MCP was down this session** (token expired). | Re-auth Intuit MCP; confirm autopay status + employee counts + last run per realm via `qbo_payroll_*`. West York autopay lives in QBO. |
| **Jobber (Clark hours)** | ❌ No hours scenario | Only a Jobber **revenue** export sheet "OS-Jobber May 2026" **1-hdnCltf7ih9_Hp-MchOBDsKdAbLgzq5lCRmrESIhc0** (invoice columns, not hours) + Jobber folder **1Gmvvyym2J4EPznaAgyzTcdVWV_pUHoxx**. `connectorStatements` enum already has `jobber`. | Build a Jobber timesheet pull (API or sheet) → hours. |
| **TouchBistro (restaurants + Clark?)** | ❌ No scenario | `connectorStatements` enum has `touchbistro`; no Make scenario found. | Build TouchBistro hours pull for Old Spot Pub + Sher-E-Punjab. |
| **West York paystubs** | ✅ Folder exists | Drop folder **10FgSl5ctYkgxIaAa2-eTir7xOquQ7Xzj** with weekly PDFs. | Build print/email-on-cadence (Drive read + Gmail send). |
| **CRM employees/timesheets** | ✅ Exists | `employees` + `employeeRouter` + `Employees.tsx`; `timesheets` table (no router/UI). | Add pay-run router/UI; wire `timesheets`. |

### Caveats / things to verify before building
1. **QBO Payroll numbers are all [UNVERIFIED]** — MCP was down. Re-run the four `qbo_payroll_*`
   tools per realm (esp. West York for autopay confirmation, Originality/2303851/Fractal for
   employee counts + pay types).
2. **"OS-Jobber" is revenue, not hours.** Confirm where Clark *employee hours* actually live
   (Jobber timesheets? TouchBistro? a separate sheet?). Markie's "Jobber AND TouchBistro for
   Clark" needs a real hours artifact to confirm.
3. **Selective Painting** Client Info says payroll "N/A" yet a live monthly payroll sheet exists
   — reconcile with Markie.
4. **TouchBistro scope:** Markie named restaurants (Old Spot Pub, Sher-E-Punjab) AND said Clark
   uses TouchBistro — confirm whether both are true.
5. **Selective Painting Payroll sheet columns** (verified, sheet 1sYhf5J…): Month | Net Pay |
   Gross Pay | CPP Employee | EI Employee | Income Tax Employee | Employer CPP | Employer EI |
   CRA Remittance. Tax params in-sheet: CPP 5.95%, EI 1.66%, Est. tax 15%. (Note: EI 1.66% is the
   sheet's value; 2026 employee EI is 1.63% per §6 — confirm the rate.)

---

## 5. Make scenario inventory (team 2327575, pulled this session — payroll-relevant)
- `FIGGY — Clockify Pull` **5323280** (time source — confirmed).
- Per-realm QBO API tools: West York **5389401**, Clark OS **5347484**, Clark CW **5347489**,
  2303851 **5343229**, Alderson 5342778, Ovita 5343005, Universal 5342806.
- No Jobber/TouchBistro/payroll-specific scenarios exist. (Other scenarios are intake, poster,
  recon, admin — not payroll.)

---

## 6. Web research — Canadian pay-run data model (informs §2)

**Pay-run shape (Wagepoint, Payworks, Humi, QBO Payroll CA, Gusto all converge):** a *pay run*
belongs to a *pay group/schedule* (fixes frequency), spans a *pay period* (start/end), has a
*pay date*, and contains one *pay statement (paystub)* per employee, each holding *earnings line
items + deductions + employer contributions → net pay*. Salaried gross = annual ÷ periods;
hourly = hours × rate. Vacation pay accrues per run as % of vacationable earnings.
(Sources: Wagepoint help — wagepoint.kayako.com/article/39-run-your-first-payroll; Humi vacation —
support.humi.ca; Gusto vacation-pay glossary.)

**Canonical earnings:** Regular, Overtime, Vacation pay, Statutory holiday pay, Bonus, Commission,
Salary. **Employee deductions:** CPP (CPP1 + CPP2), EI, Federal income tax, Provincial income tax
(+ union dues, RRSP, garnishments). **Employer contributions:** CPP (1.0×), EI (1.4× employee),
+ provincial EHT/WSIB where applicable.

**T4 boxes:** 14 Employment income · 16 CPP · 18 EI · 22 Income tax · 24 EI insurable earnings ·
26 CPP pensionable earnings · 44 Union dues · 46 Charitable · 52 Pension adjustment → roll up into
**T4 Summary**. (Sources: Rise People T4 box KB; Wealthvieu T4 guide.) The CRM's `employees` table
already carries boxes 14/16/18/20/44/46.

**Remitter frequency (PD7A) — set by AMWA from 2 calendar years ago:**
- **Quarterly** (new/small): due Jan 15 / Apr 15 / Jul 15 / Oct 15.
- **Regular** (AMWA < $25k): due 15th of month after payday. ← *West York is "regular".*
- **Accelerated Th.1** ($25k–$99,999.99): 1st–15th paydays by 25th; 16th–EOM by 10th next month.
- **Accelerated Th.2** (≥ $100k): within 3 working days of period end.
(Source: CRA "types of remitters" / "remit due dates" pages.)

**2026 rates — cross-verified across 5+ Canadian accounting sources, NOT confirmed on canada.ca
([UNVERIFIED] official):** CPP 5.95%, basic exemption $3,500, **YMPE $74,600**, max ee
$4,230.45; **CPP2 4.00%, YAMPE $85,000**, max $416.00; **EI ee 1.63%, MIE $68,900**, max
$1,123.07; employer EI 1.4× (2.282%) max $1,572.30. (Sources: canajunfinances 2026 CPP/CPP2/EI;
TAAG; BOMCAS.) **Confirm on official CRA "CPP contribution rates" and "EI premium rates" pages
before hardcoding for any posting/remittance calc.**

**Design takeaway:** store the three per-earning flags (vacationable / pensionable / insurable)
rather than deriving from earning type — it makes boxes 24/26, vacation accrual, and CPP2 correct
without special-casing each earning.

---

## 7. Bottom line
The CRM already has `clients` (tenant key), a rich `employees` table + router + page, an unused
`timesheets` table, and connector enums for Jobber/TouchBistro. The payroll module is mostly a
**pay-run header + line grid ("one clean sheet"), a remittance/T4 layer, and source importers** on
top of that. Build order: **West York print/email + manual sheet → Clockify/Originality →
Jobber+TouchBistro/Clark → remittance/T4.** Re-auth the Intuit MCP to fill every QBO-Payroll
[UNVERIFIED] cell, and confirm where Clark's employee *hours* truly originate.
