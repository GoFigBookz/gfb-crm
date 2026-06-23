# Figgy Jr — Backlog (decisions captured)

_Living list of agreed-but-not-yet-built work, with the decisions made so we
don't re-derive them._

## BACKLOGGED THIS SESSION (Markie: finish client cards first, then these)
- ✅ **master-sheet-sync double-encode FIXED + re-enabled (2026-06-22).** Root cause: CRM
  pre-encoded the range AND Make scenario 5453235 re-encoded {{1.url}} → 'Client%20Master'
  reached Sheets. Fix (centralized in `sheetsApi`): decode the caller's encoding before POSTing
  so Make does the single encode. Re-enabled via the opt-out flag (FIGGY_SHEET_SYNC_DISABLE=on
  to pause). NOT live-verified from here (the Make hook host isn't in the dev network allowlist)
  — confirm on next deploy: boot inbound-pull + a client save should round-trip cleanly. If Make
  errors resume, set FIGGY_SHEET_SYNC_DISABLE=on and revisit the append-endpoint encoding.
- ✅ **Discrete platform checkbox columns in Client Master (2026-06-22, Markie ask).** Replaced
  the messy "POS / Apps" name-list with per-platform TRUE/FALSE columns (Stripe/Square/Jobber/
  TouchBistro/PayPal/Wise) — bidirectional + self-provisioning (upsert appends any missing
  headers). Live on client_onboarding; inbound routes them there via `applyOnboardingPatch`.
  TODO (cosmetic): format those 6 columns as real checkbox UI (BOOLEAN data-validation) — values
  are written as TRUE/FALSE so they become checkboxes once the column is checkbox-formatted.
- **Monthly sales-receipt automation (2026-06-21, ~6 clients).** Intake flag `monthlySalesReceipt`
  + `salesReceiptSource` now captured. Build the automation: pull the month's TOTAL sales from
  the source (Jobber/Square/etc.) and create ONE sales receipt in the client's QBO file. Driven
  off the intake flag; only runs for flagged clients.
- **Vendors/Customers gated by intake (2026-06-21).** When we build the vendors/customers
  sections (pulled from QBO): show VENDORS only if billPayResponsibility is we_pay/both; show
  CUSTOMERS only if invoicingResponsibility is we_invoice/both. If we don't pay bills / don't
  invoice, don't surface them.
- **Auto-pull hours 9 AM Wednesday each pay period (2026-06-21).** For the 4 timesheet
  companies only (Clark OS, Clark CW via Jobber; the two restaurants via TouchBistro):
  period ends Tuesday, Markie processes Wednesday — so auto-import that period's hours at
  ~9:00 AM Wednesday into the pay run, ready for him. Scheduled job once the connectors are live.
- ✅ **Client-facing onboarding link — works end-to-end (2026-06-22).** "Generate Link"
  (Onboarding page) creates a `/onboarding/{token}` link + copy button for ANY client (was
  limited to new leads). The public form (`OnboardingForm.tsx`) now mirrors the staff intake's
  intake-driven fields: dividends (T5), platforms (Stripe/Square/Jobber/TouchBistro/PayPal/Wise),
  who-invoices / who-pays (incl. "both"), and the monthly total-sales-receipt flag + source.
  `onboarding.submit` persists them; `onboarding.review` (approve) now MAPS the onboarding
  record → client-card flags (HST/payroll/WSIB/dividends/sales-receipt/year-end) the same way
  the staff intake does, so a client self-submission actually provisions the card + correct
  tasks. "both" invoicing/bill-pay now triggers the invoicing/A-P task rules. NOT rolled out
  yet (Markie's call) — but functional if turned on. TODO when rolling out: payroll *sub-options*
  (hours source / revenue share / CRA comparison) stay staff-only (internal process choices),
  add them to the public form only if a client should self-report them.
- **Sales + payment platforms on intake drive connect buttons (2026-06-21).** Like hours-source
  drives the Jobber button: the client's sales platform (Square/Jobber/Stripe/etc.) and payment
  platform fields on intake should drive which connect buttons + integrations appear per client.
- **EVERYTHING per-client runs from the intake form (2026-06-21, Markie's directive).**
  The intake form is the single source that provisions a client's surfaces: has payroll →
  payroll surface; hours source = Jobber → Jobber button; TouchBistro → TouchBistro; has
  WSIB → WSIB link, else NO WSIB link; no payroll → no payroll calculator link; etc. Quick
  links + feature buttons must be CONDITIONAL on the client's actual features. Also: REMOVE
  the payroll calculator from the client quick links entirely. (Started: hours-source field
  drives the Jobber button; extend this pattern to all features + wire the intake form.)
- **Client card sub-cards: employees, vendors, customers (2026-06-21).** Build add/edit of
  employees, vendors, and customers INSIDE the client card (per-client), pulling vendor/
  customer data from QBO where possible. (Ties to the contacts card + vendors backlog items.)
- **Hours source belongs on the client intake (2026-06-21).** Which integration a payroll
  client uses (Jobber / TouchBistro / Clockify / QBO autopay / manual) is currently inferred
  from the client NAME. Make it an explicit intake/client-card field, and drive the
  per-client integration buttons (e.g. Connect Jobber only for Jobber clients) off that field.
- **Dock King = flow-through client only (2026-06-21).** NOT an active client — no monthly
  bookkeeping, no services. We only invoice him for the QuickBooks wholesale software. Just
  pull his data from QBO. Future: put him on Stripe autopay. Also fix the error hit when
  changing his intake/billing status (couldn't reproduce without the error text).
- **Add Wise to our monthly payment-solution providers + sales (2026-06-21).** Offer/track
  Wise alongside the other payment options for clients (payments + sales).
- **Move Payroll higher in the nav (2026-06-21).** Markie runs payroll EVERY WEEK — it's
  core weekly work, so Payroll should sit near the top of the sidebar, not buried.
- **Employee expense → bill-to-pay → QuickBooks (2026-06-21).** Let an employee email
  an expense to the CRM; Figgy creates it as an expense/bill record, routes it for review,
  then pushes it to QBO as a Bill to be paid (vendor = employee, reimbursement). End-to-end:
  email intake → CRM expense → review → QBO Bill. (Ties into the existing intake + poster.)
- **Payroll calcs pull live data from QBO Payroll, per client + pay run.** Stat-pay,
  vacation-pay, and prorated payroll should auto-fill the earnings/period inputs from
  QBO Payroll (the CRM doesn't run payroll — QBO does). Stat = 4-work-week earnings ÷ 20
  (ON); vacation = % of vacationable earnings; prorated = business-day fraction of period.
  Formulas are now correct + clearly labeled; wiring waits on the QBO payroll connection.
  Add a client/pay-run selector that loads the numbers instead of manual entry.
- **Mem-time-style automatic activity tracking** (knows what client/work is active) —
  beyond the current start/stop timer.
- **Client grouping (2026-06-21).** One owner (e.g. John) can have multiple companies/
  accounts — group those client records under a parent/owner so they're seen together.
- **Contacts card per client (2026-06-21).** Additional contacts inside a client company
  (e.g. the receptionist we deal with) — a contacts card that SAVES + EDITS, scoped per client.
- **Vendors section + mass email (2026-06-21).** Create a vendors area, pull vendor data
  (from QBO), and mass-email vendors for statements / new processes / missing statements /
  missing invoices / etc. (segment + template + send).
- **TouchBistro + Clockify hours imports (2026-06-21).** Same pattern as the Jobber connector
  just built — pull employee hours into the timesheet for the restaurants (TouchBistro) and
  Originality/Clockify.
- **Import 2026 payroll history from the sheets (IN PROGRESS 2026-06-21).** Periods + pay
  dates + per-employee hours for the roster, 2026 only (Markie chose periods+hours). Source:
  the per-client payroll Google Sheets.
- **Client-card UI fixes (2026-06-21):** (a) Filing obligations must be CLICKABLE (link to
  the filing/detail) — currently useless. (b) Add PAST HST FILINGS with a link to them in the
  client's file folder. (c) Payment "who pays" option needs a **Both** choice (we pay / client
  pays / both) — and the same Both option for SALES.
- **Owner-only Insights — per-client pricing intelligence.** The "scope quote vs
  flat fee / what we should bill vs what we bill" build was REMOVED from the client
  card (Markie's call). Rebuild it as an Insights area visible only to the owner,
  filterable by client. (Engine already exists: `quote.forClient`.)
- **Website lead webhook / form hookup.** `POST /api/lead` is live + the Leads tab/
  board exist; the gofig.ca inquiry form just needs to point at it. BLOCKED: the
  website repo `GoFigBookz/app` isn't in this session's scope (no add_repo tool here)
  — add it, then wire the form + test end-to-end.

## MacrosLM teardown (Markie 2026-06-22) — borrow, don't buy
MacrosLM = a library of pre-built AI agents for AUDITORS/accountants (recs,
workpapers, SOX testing, tie-outs → citation-backed reports "reviewed, defended,
signed"). Same philosophy Figgy already runs on (AI busywork + human sign-off).
Built for audit/assurance + corp-finance/diligence at firms — NOT Canadian
small-biz QBO bookkeeping. Verdict (matches competitive-research doc): do NOT
adopt as core infra (US-focused, no HST/CRA/QBO knowledge, per-seat SaaS
dependency = against the mandate). BORROW the two best patterns into Figgy:
- **Citation-backed, signable month-end workpaper.** Each close produces a
  reviewable workpaper: per-procedure result + the evidence/source it's based on
  (we already carry sourceData/rationale on findings) → one PDF Markie reviews +
  "signs." Highest-value steal.
- **Tie-outs in the cockpit.** Auto-tie QBO trial balance to source: bank balance,
  HST filed/remitted, payroll remitted, AR/AP subledger → GL. Surfaces breaks on
  the month-end board. Fits the close-cockpit north star exactly.
- **Procedure library** (their "agents per category"): turn the close checklist
  into named procedures (reconcile bank, tie HST, verify remittance) each emitting
  a citation-backed pass/fail. Optional: trial MacrosLM only for any audit/
  diligence work OUTSIDE bookkeeping — it's strong there.

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

## BANK STATEMENT CONVERTER — PDF → CSV → QBO (Markie 2026-06-22, BROKEN, fix)
The "Bank → QBO" converter (`/bank-converter`, src/pages + api/bank-converter*)
must do **PDF bank statement → CSV → QBO import format**. It's currently not
working end-to-end. Fix the chain: accept a PDF statement, extract the transaction
table (date/description/amount/balance), normalize, and output a QBO-importable CSV
(3-column Date,Description,Amount or QBO's expected layout) — then a one-click path
into QBO (CSV/QBO Web Connect). Verify with a real statement before calling done.
(Markie: "Don't skip over things I've told you to fix.")

## FIGGY JR POSTING — CONSOLIDATION VERDICT (audited 2026-06-22)
We do NOT need to rebuild posting. Audit of both sides:
- **CRM side is review-complete**: brain (history coding + cold-start + web classify,
  read-only, tested) → Triage (enrich, traffic-light, approve/dismiss/ask-client) →
  learning loop (approve writes confirmed vendorMemory). The ONLY missing wire is
  **approve → post**; `qboRequest` is already write-capable on the NATIVE transport
  (the Make bridge is read-only by design).
- **Make side**: 6 QBO Poster clones + 5 Auto-Approve clones (all OFF) that are
  structurally identical, differing only by hardcoded client name / connection id /
  map-tab / tax codes. The active "Auto-Approve GATE TEST (5353339)" already runs the
  gate for ALL clients in ONE scenario = proof the consolidation works.
- **Cleanest path** (when a live native WRITE connection exists — needs Intuit prod
  creds, Markie's part): add ONE poster module in the CRM (finding.sourceData → QBO
  Bill/Purchase via qboRequest POST), wire it to a GATED "approve & post" in Triage
  (nothing auto-posts), reuse the existing learn-on-approve. Then RETIRE the ~14 Make
  per-client clones (already OFF) — keep only the read-only proxies + per-realm tools.
- Net: ~1–1.5 wk for manual review-and-post (Phases poster + queue + one-click),
  auto-post rules later. Front-loadable: build the poster module + tests now against
  documented QBO shapes, switch on when the connection lands.

## DRIVE FOLDER AUTO-CREATE — BUILT (2026-06-22), needs token + live test
"Auto-create folders under the hardcoded GFB Clients parent; never save to root."
- `api/client-drive-folders.ts` builds the standard tree (`Finance - <Client>` →
  1 Company Documentation/Engagement Letters, 2 Tax Filings/[HST·Payroll·WSIB·
  Dividends·Corp Tax | US: Sales Tax·Payroll·Dividends·Corp Tax], 3 Year-End
  Financials/[01 Financials·02 Accountant], 4 Statements, 5 Triage, 6 Vendors,
  7 Customers, ARCHIVE) under `GFB_CLIENTS_PARENT_FOLDER_ID`
  (1OdxTvo0DiWnDL0e9g2ii6eG5ysBke_0G). Idempotent (reuses existing folders).
- Transport `api/drive-make-bridge.ts` → Make Drive proxy scenario 5342854
  (interface {url,method,body,qs_fields,qs_q}) via the scenario-RUN API. WRITE op,
  so it uses the authenticated run API → needs **FIGGY_MAKE_API_TOKEN**.
- Wired: auto-attempt on `crmClient.create` (non-blocking, only if token set) +
  manual `crmClient.createDriveFolder` mutation + a "Create Drive folder" button
  on the client card when the link is missing.
- **TO GO LIVE (Markie):** set FIGGY_MAKE_API_TOKEN on the deployed CRM, click
  "Create Drive folder" on a test client, confirm the tree appears under GFB
  Clients. CAVEAT: if "GFB Clients" lives on a SHARED DRIVE, scenario 5342854 may
  need `supportsAllDrives=true` added to its Drive module (its interface doesn't
  expose that param) — verify on the first live run; if creates 404/403, that's it.
  Can't be verified from the dev env (no Google access).

## CRA AUDIT SUPPORT SECTION (Markie 2026-06-22 — "think about workflow for future")
CRA keeps auditing clients' **HST** (common, painful). Markie wants a section that
pulls all the data and helps him *defend* an audit. Scoping notes for the future build:
- **Owner**: senior bookkeeper / controller (CFO-tier) role — gate behind RBAC
  `senior_bookkeeper`+ once roles exist (ties to the RBAC backlog item). Not a
  junior surface.
- **What an HST audit needs (the data to pull, per client + period under audit):**
  - HST return(s) as filed (line 101 sales, 105 collected, 108 ITCs, net) — from
    the HST filing tab/sheet + QBO.
  - Sales tie-out: QBO total sales for the period → line 101 (catch mismatches).
  - ITC support: every input-tax-credit-bearing expense with a **source document**
    (receipt/invoice) link — CRA disallows ITCs without backup. This is where the
    receipt/Drive intake + vendor brain already help (we have sourceData + Drive).
  - Exceptions report: ITCs claimed with NO attached document; tax coded to the
    wrong rate; personal/meals (50%) flags; large/round-number entries.
  - Bank/HST reconciliation: remittances actually paid vs filed.
- **Deliverable shape (borrow the MacrosLM "citation-backed workpaper" pattern,
  already in this backlog):** one audit workpaper per client/period — each line
  item with its evidence link — exportable to PDF to hand CRA. "Reviewed + signed."
- **Build dependency:** strongest once the live QBO connection is on (pull GL +
  documents). Until then, can assemble from the HST sheet + Drive receipts.
- **Reuse:** the tie-out engine here is the same one the month-end "tie-outs"
  cockpit item wants — build ONE tie-out core, surface it in both. Don't fork.

## RBAC — per-staff client access (CORE BUILT 2026-06-22)
Access model (Markie ask: "some users won't have access to all clients"):
- **admin + senior_bookkeeper → ALL clients** (owner/controller view).
- **junior_bookkeeper → all clients UNLESS `restrictedToClients` is on**, then only
  the clients granted in `client_access`. Flag defaults OFF (non-disruptive — no one
  gets locked out on deploy; admin opts a user in + picks clients).
- client role → unchanged (clients.userId ownership).
BUILT: `users.restrictedToClients` + `client_access` table (+ boot schema guard
`ensure-rbac-schema.ts`); `api/rbac.ts` helpers; scoping applied to
`crmClient.list` + `crmClient.get`; user-router `clientAccess`/`setClientAccess`/
`setRestricted`/`setActive` (all admin); Users page rebuilt (add user via
`localAuth.register`, role select, deactivate, per-client access dialog). Admin +
Insights sidebar sections now both gated to senior+ (juniors don't see them).
REMAINING (extend the same `restrictedClientIds(ctx)` filter for full enforcement):
- Other per-client READ surfaces: `payroll.clients`, the tasks board/list, the
  month-end board, client-dashboard-router — a restricted junior can still reach
  clients through these until scoped.
- Route-level guard on `/users` (+ admin pages) — currently sidebar-hidden only;
  backend mutations are adminQuery-protected, but add a route guard for polish.
- Task-assignment validation: restrict the assignee picker (and server) to users
  who can access that client.
- Client-scoped communications (emails/messages) for restricted users.

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
effect; a checklist of field → effect with pass/fail; fix the gaps.
- ✅ DONE 2026-06-22: **Task systems UNIFIED.** Retired `client-task-creator`
  (differently-titled direct inserts → duplicate risk) onto the `task-generator`
  rule engine via `ensureComplianceForClient(clientId)` (maps client row + its
  onboarding record → idempotent `ensureComplianceRulesAndTasks`). All callers
  migrated (client create/update, bulk import, boot seeds). Audit found 24/25
  intake fields already WIRED; the one GAP (`salesEntryFrequency` /
  `monthlySalesReceipt`) now drives a dedicated "Monthly Sales Receipt" rule.
- REMAINING: the field→effect pass/fail checklist across ALL clients (re-verify
  HST due dates, PD7A cadence from remitter type, WSIB, year-end, T5) after deploy.

## 8. CALCULATOR ACCURACY PROGRAM (MED — Markie ask 2026-06-21)
Make every calculator real, not "estimate," pulling from authoritative sources.
- ✅ DONE 2026-06-21: **CPP/EI** now exact 2026 CRA maximums (YMPE/exemption/
  CPP2/MIE, proper formula) from the single `CPP_EI_2026` source — no more stale
  editable 2024 defaults. **FX/Currency** now pulls LIVE **Bank of Canada** daily
  rates (Valet `FX_RATES_DAILY`), static fallback only if offline. **Depreciation**
  de-duplicated → lives in the **Business** tab only.
- ✅ DONE 2026-06-22: **Payroll tax calculator (Canada) is now NATIONWIDE.** All
  12 provinces/territories have verified 2026 brackets + BPA (`api/payroll-
  provincial-2026.ts`); Ontario keeps its dedicated surtax + health-premium path,
  Quebec applies the 16.5% federal abatement. Threaded `province` through the CRA
  engine (computeCraLine/computePaycheck) with ON unchanged (regression-tested,
  14 payroll tests). Tables flagged `verified`: a few (BC/NS BPA, NL mid-thresholds,
  NT thresholds) are `verified:false` pending a canada.ca byte-check (WebFetch was
  403-blocked during research) — confirm on the CRA "Income tax rates and income
  thresholds" payroll page when reachable; everything else is 2026-official.
- TODO: **US payroll tax** is still an estimate (real 2025 federal brackets + flat
  per-state rate) — build real 2026 federal + per-state withholding (or integrate a
  payroll-tax source). Lower priority (Canadian firm); only a few US-paid staff.
- TODO (verify): byte-check the 4 `verified:false` provincial values above on
  canada.ca, then flip them to `verified:true`.
- Cross-check all 2026 constants against the CRA T4127 (see #4) before any are
  used to remit real money.

## Reminder
QuickBooks is the **source of truth for all numbers** — every figure should pull
from QBO; CRM computations are fallbacks/cross-checks until the connection is live.
