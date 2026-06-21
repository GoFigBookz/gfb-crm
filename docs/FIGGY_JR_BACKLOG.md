# Figgy Jr — Backlog (decisions captured)

_Living list of agreed-but-not-yet-built work, with the decisions made so we
don't re-derive them._

## BACKLOGGED THIS SESSION (Markie: finish client cards first, then these)
- **Payroll calcs pull live data from QBO Payroll, per client + pay run.** Stat-pay,
  vacation-pay, and prorated payroll should auto-fill the earnings/period inputs from
  QBO Payroll (the CRM doesn't run payroll — QBO does). Stat = 4-work-week earnings ÷ 20
  (ON); vacation = % of vacationable earnings; prorated = business-day fraction of period.
  Formulas are now correct + clearly labeled; wiring waits on the QBO payroll connection.
  Add a client/pay-run selector that loads the numbers instead of manual entry.
- **Mem-time-style automatic activity tracking** (knows what client/work is active) —
  beyond the current start/stop timer.
- **Owner-only Insights — per-client pricing intelligence.** The "scope quote vs
  flat fee / what we should bill vs what we bill" build was REMOVED from the client
  card (Markie's call). Rebuild it as an Insights area visible only to the owner,
  filterable by client. (Engine already exists: `quote.forClient`.)
- **Website lead webhook / form hookup.** `POST /api/lead` is live + the Leads tab/
  board exist; the gofig.ca inquiry form just needs to point at it. BLOCKED: the
  website repo `GoFigBookz/app` isn't in this session's scope (no add_repo tool here)
  — add it, then wire the form + test end-to-end.

## 0. SMART CLIENT SYNC + LOOKUP SYSTEM (Markie 2026-06-21: "syncs everything, looks up everything, extremely smart")

### ✅ DONE this session (live on main, build 2026-06-21.15)
- **Canonical master = sheet `1pcAw-WSQXXnVn-0L-TQ2FIExkHQ0Olf4dzz47t0gTUk`** (Markie
  chose it). ONE `Client Master` tab (33 active, 26 cols incl. Bio at Z + gov
  registry E–H) + `Inactive Clients` tab (13 dissolved). Header frozen/coloured.
- **OUTBOUND CRM→sheet** (`api/master-sheet-sync.ts`): onboard + intake edit upsert
  the client's row (key = CRA BN, else name), PRESERVING gov-only cols
  (closePeriod/#employees/POS). `onboarding.syncAllToMaster` = full reconcile.
  Transport = committed Make webhook proxy **scenario 5453235 / hook 2483768**
  (`hook.us2.make.com/d4h33m0na6ulrlm9nkv9dyyfa8hv1bcs`, Google conn 9040573) —
  zero-touch like the QBO bridge, no token. Off via `FIGGY_SHEET_SYNC_DISABLE=on`.
- **GOV-REGISTRY LOOKUP on add** (`api/gov-registry-lookup.ts`): Anthropic
  web_search → bio/CRA#/registry#/incorp/corp type/status/industry/website/addr/
  phone. New clients auto-enrich (blank fields only) then sync. Card button →
  `onboarding.lookupGovRegistry`. ON with `ANTHROPIC_API_KEY`; off `FIGGY_GOV_LOOKUP=off`.
- **CARD HOLDS EVERYTHING**: clients gained bio/registryNumber/incorporationDate/
  corpType/governmentStatus; `api/seed-gov-registry.ts` (boot) backfills curated
  research onto every existing card by BN; ClientDashboard snapshot shows it all.

### TODO (next phases of the smart system)
1. **INBOUND sheet→CRM** read-back: scheduled Make scenario reads the master tab,
   POSTs changed rows to a CRM webhook (like agent-webhook); CRM upserts by BN.
   → makes it truly bidirectional / crash-safe both ways.
2. **Conflict rule**: last-writer-wins per row via `updatedAt`; CRM authoritative
   for new records. Nightly full reconcile job.
3. **Extend sync to payroll / employees / tasks** (not just clients): one tab each
   or a workbook, same upsert pattern.
4. **Inactive flow**: when a client goes inactive in the CRM, MOVE its row from
   `Client Master` → `Inactive Clients` automatically.
5. **Smarter lookup**: cache/verify CRA# against an authoritative source; flag
   low-confidence registry hits for review (never auto-trust a guessed BN/date).

### Original two-way design notes (kept for reference)
Markie's requirement: the Google Sheet is the **crash-safe mirror / fallback** —
"the back end of the Google Sheets must always match what we're building here.
If the CRM crashes we can still work in the Sheets." Sync **both ways** for
**clients, payroll, employees, tasks**.

TARGET SHEET DESIGN (Markie 2026-06-21):
- **ONE consolidated "Client Master" tab** holding ALL info per active client:
  client fields + HST (cadence/#/next-due) + payroll + government-registry data —
  NOT multiple tabs. Pull the HST sheet + government-data sheet content INTO this
  one tab.
- **"Inactive Clients"** on a separate tab.
- Keep the government-registry notes.
- RECONCILE the sheets first — there are several "master"-ish sheets today:
  - MASTER_INTAKE_DATABASE `1_PCg6gNlx5yHg1McBQTFiwyuLIWB6xnKCY74QTfqDRE` (what
    import-client-master reads, embedded snapshot).
  - "GFB — Master Client Directory" `1DbGC1383G-WakjK2eC_ylp5_74HAXa4NSWw_c6kXxCA`
    (what Make scenario 5318047 "Add Client to Master" APPENDS to).
  - GFB_Client_Master_Government_Data `1SkaMTVIKiweb7yFFgqc29-8n8mYVgCWH`.
  - HST sheet `12rGz-CYGDsF1Zu1LhjELECU3Ioibsf-NpJwm9sqW4z0`.
  - Task Summary / Client Summary `1dYQKO3L4miCZtGMU0K7HOkay1229l8zz` (legacy ref).
  → DECISION NEEDED: pick ONE to become the canonical single-tab master (or build
    fresh), then point everything at it.

ARCHITECTURE (server can't touch Google directly — no runtime creds; use Make,
same pattern as the QBO bridge):
- OUTBOUND (CRM → Sheet): on client/payroll/employee/task create+update, call a
  Make "upsert row" scenario (keyed by CRA# / id) via Make's run API. Scenario
  5318047 exists but is APPEND-ONLY → needs an UPSERT (match-or-add) version.
  Requires `FIGGY_MAKE_API_TOKEN` set on the CRM (still pending — known wiring).
- INBOUND (Sheet → CRM): a Make scenario on a schedule/edit reads the master tab
  and POSTs rows to a CRM webhook (like agent-webhook); CRM upserts by key.
- CONFLICT RULE: define which side wins (proposal: last-writer-wins per row with
  an `updatedAt`; CRM authoritative for new records). Must be explicit.
PHASES: (1) consolidate the sheet to single tab + reconcile IDs; (2) outbound
client upsert on onboard/edit; (3) inbound client read-back; (4) extend to
payroll/employees/tasks; (5) conflict handling + nightly full reconcile.
BLOCKERS: canonical-sheet decision + `FIGGY_MAKE_API_TOKEN` on the server.

## 1. Transaction posting into QuickBooks — THE core workload (HIGH)
Decision (Markie): build the **QBO API poster** (not a Chrome/browser bot — QBO
has a full write API; browser automation is brittle and unnecessary). Posting
mode: **auto-post safe rule matches** (high-confidence rules, e.g. fixed monthly
bills), everything else waits for review in Triage.

**BLOCKED on:** the live native per-realm QBO OAuth connection. Native OAuth is
*built* (`api/qbo-oauth.ts`) but not switched on — needs the prod Intuit app
registered + `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET`/`FIGGY_TOKEN_KEY` + redirect,
then Connect per company. **Markie can't build the connector right now — on hold.**

Scope when unblocked:
- Pull the "to-post" queue FROM QBO (bank/credit-card "For Review" feed) + Hubdoc.
- Code via the vendor brain (history + rules + cold-start classifier).
- **Rules engine**: "vendor X → account Y every time", recurring fixed-monthly
  auto-entries, and rule cleanup UI.
- Review gate in Triage (one-click approve→post); auto-post the trusted rules.
- Post via the QBO Accounting API (Purchase/Expense/Bill). Reversible, audited.
- Optional: a browser/computer-use *fetch* agent ONLY for no-API sources
  (e.g. pulling Visa statement PDFs from a bank portal with no feed).

## 2. Interco journal tracker — ✅ STAGING BUILT (2026-06-20)
230 ("numbered co") pays expenses for the other entities on its credit card and
bills them back via inter-company JEs each month.
- **BUILT (staging/review):** `/interco` page + `interco` tRPC router +
  `interco_periods`/`interco_entries` tables. Pick paying entity + month → log
  bill-back entries → **readiness gate** ("all source txns + Visa posted in QBO",
  manual confirm for now) → nets per counterparty → generates a **balanced draft
  settlement JE** (copy-to-clipboard) → "Mark posted" (gated on readiness, records
  JE#). Accounts are user-picked from the locked chart — never invented. Posters
  stay OFF (review-only). JE builder unit-tested (`api/interco-router.test.ts`).
- **REMAINING (needs live QBO connection):** auto-PULL the bill-back amounts from
  230's QBO (TransactionList/Purchase report) instead of manual entry, and
  auto-CHECK the readiness gate against QBO (are all txns posted?). Push of the JE
  stays manual by golden rule (review gate). Slots into the same router once the
  connection is live.

## 3. 2303851 / Fractal / Motion Invest roster import (LOW)
Old combined sheet located + parsed (see FIGGY_JR_ORIGINALITY_GROUP_PAYROLL.md).

## 4. CRA T4127 final eyeball (Markie task)
Before remitting real money, confirm a few 2026 constants against the official
CRA T4127 PDF (canada.ca blocked the auto-fetch; values cross-checked instead).

## 5. Set client types + payroll-feature boxes for remaining clients (Markie, UI)

## 6. Set `FIGGY_SIN_PIN` in Railway to enable SIN reveal/printing (Markie, env)

## 7. FULL INTAKE → END-TO-END FLOW AUDIT (HIGH — Markie ask 2026-06-21)
Every field captured about a client must flow through the whole app and DO its
thing automatically, for EVERY client (not just the test ones). Systematically
verify + fix the chain for each intake field:
- HST (has/period/year-end) → HST filing tasks generated + correct due dates +
  shows on month-end board/calendar. (Backfill bug fixed 2026-06-21; re-verify
  across all clients after deploy.)
- Payroll (has/frequency/remitter Regular/Threshold1/Quarterly) → payroll run
  setup + PD7A remittance tasks at the right cadence + T4 task. **Pull remitter
  type from the master "Reporting Period" so PD7A timing is exact** (Threshold 1
  = accelerated; currently defaults to Regular).
- WSIB (has/account/quarter) → WSIB reconciliation/filing tasks.
- Year-end month → year-end close tasks + month-end board relevance.
- clientType (monthly/quarterly/annual/payroll/wholesale) → task cadence +
  board inclusion + quote.
- Quote/pricing fields → quote actually generated/clickable.
- Workflow status, dividends (T5), non-resident, ecommerce/POS, Hubdoc, etc.
Deliverable: every intake field has a verified, clickable, working downstream
effect; a checklist of field → effect with pass/fail; fix the gaps. Two task
systems exist (client-task-creator vs task-generator) — unify onto one to remove
the dual-write/duplicate-title risk.

## 8. CALCULATOR ACCURACY PROGRAM (MED — Markie ask 2026-06-21)
Make every calculator real, not "estimate," pulling from authoritative sources.
- ✅ DONE 2026-06-21: **CPP/EI** now exact 2026 CRA maximums (YMPE/exemption/
  CPP2/MIE, proper formula) from the single `CPP_EI_2026` source — no more stale
  editable 2024 defaults. **FX/Currency** now pulls LIVE **Bank of Canada** daily
  rates (Valet `FX_RATES_DAILY`), static fallback only if offline. **Depreciation**
  de-duplicated → lives in the **Business** tab only.
- TODO: **Payroll tax calculator (Canada)** is federal + Ontario-accurate but
  ESTIMATES other provinces — add the remaining provincial brackets/credits so
  it's actual nationwide (or wire CRA PDOC). **US payroll tax** is an estimate —
  build real federal + state withholding (or integrate a payroll-tax source).
- Cross-check all 2026 constants against the CRA T4127 (see #4) before any are
  used to remit real money.

## Reminder
QuickBooks is the **source of truth for all numbers** — every figure should pull
from QBO; CRM computations are fallbacks/cross-checks until the connection is live.
