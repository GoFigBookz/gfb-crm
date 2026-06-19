# CLAUDE.md — gfb-crm / Figgy Jr operating context

Auto-loaded each session so we continue with **zero re-derivation**. Keep this
current. The CRM (this repo) is the human-review surface; Figgy Jr's pipeline
lives in **Make.com** + Google Sheets + QBO.

## Mandate (judge every choice against this)
Work smarter not harder: **less of Markie's time, less money (Make ops),
accurate books on cheap autopilot, an AI that learns & grows per client. Build
ONCE on consolidated rails — never per-client clones.**

## Golden rules (never violate)
- Nothing posts to QBO without Markie's review. All posters stay OFF.
- Chart of accounts is LOCKED — Figgy never invents/guesses an account.
- **Clark OS (Owen Sound)** and **Clark CW (Collingwood)** are permanently
  separate entities/books — never merge. Judge client by the bill-to + location
  on the document, never sender/folder/alias.
- Verify every change against live QBO before reporting done. Sanity Guard
  stays on and is never weakened.

## Where we are (2026-06-11)
- **Phase 1 DONE + live-proven:** richer 34-col capture (invoice#, subtotal,
  HST, total, payment method/account w/ last-4, bill-vs-expense, email
  instructions) + email-body triage. Intake write bug FIXED on the 2 active
  intakes (`makeAPICall GET A:A → updateRow at length+1`; never hand-built JSON).
- **Account-Selection Brain — LOGIC BUILT + TESTED (2026-06-11).** Lives in the
  CRM: pure core `api/qbo-vendor-brain-core.ts` (resolve vendor → code from
  vendor history → integral dedup; 16/16 checks green via
  `node --experimental-strip-types scripts/brain-verify.ts`), I/O + tRPC in
  `api/qbo-vendor-brain.ts` (router `qboBrain.suggestCoding`, read-only),
  `vendorMemory` table added. Verified against real Clark OS QBO shapes.
- **PREREQUISITE / BLOCKER:** the CRM is **NOT yet connected to QBO** — it's a
  shell with dummy data. The brain is connection-agnostic (takes a per-client
  QBO connection) but needs a real connection layer to run live. **Next build =
  the CRM↔QBO connection layer (best-practice multi-tenant OAuth)**, OR bridge
  the brain to the existing live Make per-realm QBO tools in the interim.
- Tracked after: P3 robust poster, P4 config-drive + retire clones + webhooks.
  Spec/reasoning: `docs/FIGGY_JR_NEXT_STEP_2026-06-11.md`.
- **Competitive research done (2026-06-11):** `docs/FIGGY_JR_COMPETITIVE_RESEARCH_2026-06-11.md`
  (teardown of Karbon/TaxDome/Canopy/Client Hub + Dext/Hubdoc/AutoEntry/Uncat/
  Keeper/Booke/Docyt/Truewind/Digits + multi-tenant QBO + hosting). Verdict:
  Figgy is AHEAD of the auto-posting crowd on isolation+review+history-coding;
  market is converging on the same bet (Botkeeper shut down Feb-2026, Booke
  "books got messed up" — both auto-posted). Adopt-next: P0 dedup-normalization +
  confidence/color triage + explainability line; P1 native per-realm OAuth (token
  rotation persisted, keep-alive, no cascade) + Uncat-grade magic-link client loop
  w/ memo write-back (`//Comment//`) + answers write vendorMemory rules; P2
  webhooks+CDC (retire Make polling), managed Postgres in a Canadian region
  (AWS ca-central-1 / GCP Montreal), 3-2-1-1-0 backups. AVOID: auto-posting,
  cross-client learning, per-client-priced SaaS dependency.
- **BRIDGE BUILT (2026-06-11, proven on live Clark OS):** transport seam so the
  brain runs on real books NOW via Make. `qboRequest`/`ensureValidToken`
  (`api/qbo-router.ts`) are transport-aware; `transport="make_bridge"` connections
  call Make's **scenario-run API (responsive)** against the existing per-realm QBO
  tool scenario (Clark OS 5347484 / Clark CW 5347489) — `api/qbo-make-bridge.ts`
  POSTs `{responsive:true,data:{url,method,qs_query,body}}` w/ `Authorization:
  Token <FIGGY_MAKE_API_TOKEN>`, reads `outputs.tool_output.body`. Isolation = one
  scenario per realm (design-time-bound connection). Schema: `qbo_connections` +
  `transport/bridgeUrl/bridgeSecret` (bridgeUrl=run endpoint; bridgeSecret=token
  override). Seed: `scripts/seed-clark-os-bridge.ts` (realm 9341456017349963 →
  client, idempotent — now seeds BOTH Clark OS (realm 9341456017349963 → scenario
  5347484) AND Clark CW (realm 13633946244024404 → scenario 5347489)). Backlog →
  Triage (read-only, posters OFF): `scripts/figgy-suggest-backlog.ts`. GO-LIVE
  RUNBOOK: `docs/FIGGY_JR_GO_LIVE_RUNBOOK.md`. ZERO-TOUCH SELF-CONFIG ON BOOT
  (`api/bridge-bootstrap.ts` ← `boot.ts startServer`): ensures the 3 columns +
  binds Clark OS/CW to EXISTING CRM clients matched by city ("Clark Pools Owen
  Sound"/"...Collingwood" already in clients table — NEVER creates a dup).
  Transport = READ-ONLY (GET-only) Make WEBHOOK PROXIES I built (team 2327575):
  Clark OS hook 2441572/scenario 5359685/conn 9302460 →
  hook.us2.make.com/zwooriouroqy1hiqrfwfjueni6ju1uq6 ; Clark CW hook
  2441594/scenario 5359734/conn 9291854 →
  hook.us2.make.com/2s1inh9yfy749c3o42yx6bm4hohfios3. URLs are capability secrets
  committed in code (private repo) so go-live is TRULY zero-touch — no Make token,
  no env vars. `qboRequestViaMake` auto-detects hook.* host → flat POST no-auth.
  INTERIM SECURITY TRADE-OFF (close w/ native OAuth): read-only QBO via committed
  webhook URL. Opt out: FIGGY_BRIDGE_DISABLE=on. Deploy: figgy.gofig.ca on Railway,
  auto-deploys from GitHub main → bridge live on next deploy with NO action.
  Only optional secret left: ANTHROPIC_API_KEY (web lookup; everything works w/o).
  LIVE-VERIFIED (responsive run): Walker(653) 3 bills→🟡81%, Highbury(225) 8 bills
  →🟢95% (both all 1150040016/tax6, correctly coded), dup-catch on reformatted
  invoice#. NON-BILL EXPENSES WIDENED (2026-06-11): report path now works end to
  end — bridge keeps multi-param querystrings in `url` (scenario's single `query`
  qs only fits /query SQL), and the brain sends BOTH start_date AND end_date (QBO
  keeps a "month-to-date" macro otherwise → empty). Clark OS has 402 Purchases, so
  real coverage. SAFETY HARDENING (critical): `parseExpenseReport` is now
  conservative — skips non-spend txn types (Bill/Bill Payment/transfer/…) AND any
  control account (A/P/receivable/clearing/undeposited/equity). Without this the
  end_date fix would have POISONED history: Central Spa(27) "Expense" rows post
  `other_account`=Accounts Payable(26), which would've been learned as the coding.
  Bills stay the trusted spine; report is best-effort. FUTURE (cleaner): ingest
  the Purchase entity directly (line-level AccountRef, client-side EntityRef
  filter) instead of the noisy TransactionList other_account.
  **REMAINING WIRING (1 step):** set `FIGGY_MAKE_API_TOKEN` on the deployed CRM,
  then run `seed-clark-os-bridge` + `figgy-suggest-backlog` → Triage lights up.
  (Server can't call MCP tools at runtime — uses Make's HTTP run API instead.)
- **NATIVE PER-REALM OAUTH — BUILT (2026-06-19, `api/qbo-oauth.ts`).** The durable
  rail (design Option A) now exists beside the Make bridge; both transports coexist
  (`transport`=`native`|`make_bridge`) so realms cut over one at a time. Tokens
  ENCRYPTED at rest (AES-256-GCM `enc:v1:` envelope; legacy plaintext passes
  through + re-encrypts on next refresh); OAuth state SIGNED + time-boxed (HMAC,
  binds realm→clientId = isolation at authorize time, CSRF-safe); refresh-token
  ROTATION persisted EVERY call; `invalid_grant`→inactive + `reconnectReason`
  column + `ReconnectRequiredError` (never silent → brain sees inactive = "not
  connected", UI shows "⚠ Reconnect"); KEEP-ALIVE job (boot+daily) so a quiet
  client's rolling 100-day window never lapses. Flow: `GET /api/qbo/connect?clientId=N`
  → Intuit authorize (scope accounting-only, signed state) → `GET /api/qbo/callback`
  → `exchangeAndPersist`. `qboRequest`/`ensureValidToken` delegate native
  refresh+decrypt to qbo-oauth (ONE hardened path; removed the old duplicate
  refresh). Key = `FIGGY_TOKEN_KEY` (or `APP_SECRET`); keyless = plaintext+unsigned
  +warn (dev only). Tests `api/qbo-oauth.test.ts` 11/11; suite 26/26; brain 27/27;
  build green. GO-LIVE: register prod Intuit app, set `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET`
  /`FIGGY_TOKEN_KEY` + redirect `https://figgy.gofig.ca/api/qbo/callback`, click
  Connect per company, retire that realm's Make tool once authorized. Also fixed
  build health this session: vitest missing `@db` alias (suite couldn't load) +
  package-lock pinned to the blocked npmmirror registry (now npmjs.org).
- **Connection-layer design:** `docs/FIGGY_JR_QBO_CONNECTION_DESIGN.md`. Decision
  (Markie 2026-06-11): bridge brain to live Make QBO tools NOW + build native
  OAuth in parallel, cut over later. QBO facts: access token 1h; refresh 100-day
  rolling, ROTATES ~24h (persist new token every refresh or invalid_grant); 500
  req/min + 10 concurrent per realm; batch ≤30 ops; webhooks = 1 callback/app,
  HMAC-SHA256 raw-body verify; CDC backstop. Hosting: managed > self-host (no ops
  team); move SQLite→Postgres for prod.

## Per-client isolation (guaranteed — Markie's requirement)
The brain CANNOT cross-pollinate clients: every QBO read goes through ONE
connection whose `realmId` is in the URL, so a Clark OS call can't return Clark
CW data. `getConnectionForClient(clientId)` is the single boundary and REFUSES
to guess — 0 connections = not-connected, 2+ = ambiguous (never silently picks
a realm). Vendor Memory cache is keyed by `(connectionId, vendorId)`.

## QBO API realities (verified live 2026-06-11, Clark OS)
- Bills filter by vendor via SQL: `SELECT * FROM Bill WHERE VendorRef='ID'`
  (line-level AccountRef + TaxCodeRef). Purchase/Expense do NOT (`EntityRef`
  not queryable) → use TransactionList report, vendor-filtered, `other_account`
  column (params go in the URL path, not the `query` arg).
- QBO Vendor has NO native default-account/tax field → coding memory lives in
  `vendorMemory`; only contact fields (email/phone/address) write back to the
  QBO vendor card.
- **Cost:** over the Make Core 10k ops/mo cap (testing + backlog spike).
  Intervals already widened. Watch ops 24h for true steady-state before any
  webhook rebuild — that's a Phase-4 change, done once when clones are retired.

## Key IDs
- Make: Team **2327575**, Org 7748567 (plan CORE 10k ops/mo), region us2.
- Active scenarios: Gmail Intake `5171304`, Drive Intake Clark OS `5339099`,
  Receipt Stager `5351819`, Sanity Guard `5352122`, Nightly Prune `5352943`.
  Per-realm QBO API tools (on-demand): Clark OS `5347484`, Clark CW `5347489`,
  Universal `5342806`, Alderson `5342778`, Ovita `5343005`, 2303851 `5343229`.
  All per-client Auto-Approve/Poster/Drive-Intake clones are OFF (to be retired
  for ONE config-driven pipeline — do NOT patch them individually).
- Sheets workbook: `1lDtTggtV6YnGENYPXEZXng6gV2wclADGUgKqntWnql8`
  (Review Queue gid 91210369; State_Log read-first/append-last; Archive;
  Vendor Memory; Client Directory). Data structure 393091 "Figgy Jr AI Response".
- Clark OS QBO: conn 9302460, realm 9341456017349963, Figgy Clearing acct 53,
  HSTon 6 / OOS 4 / M&E 7 (M&E rate ref 15). Miscode account to fix-from-history:
  `1150040016` "Parts/Goods COGS". Clark CW: conn 9291854,
  realm 13633946244024404 (NON-STANDARD tax codes 7/5/9).
- Drive: Clark OS drop `1GdgYGv_OAiui8_GxvPFX_vo5bU4ByOjF`; Gmail→Drive staging
  `19dE9npuJX82K7UOMPvQHSMpQn92Rw6qk`; Figgy Junior folder
  `15QYs3Ujgm9irHn3nXzdxoeuV2VPtmjT_` (companion docs live here).

## Open items
- QBO #970 (Latham freight) + #983 (Walker split): blocked on source invoices.
- 4 TEST pdfs in the Clark OS drop folder — harmless, delete for tidiness.
- MISCODE SWEEP (live, 2026-06-11): the "16 June posts mostly miscoded to
  1150040016" worry looks OVERSTATED — sampled Clark OS history is largely
  vendor-appropriate + consistent: Bumper to Bumper 6/6 → Auto Repairs & Maint
  (1150040013), Walker/Highbury → Parts/Goods COGS (1150040016), Sunbelt 2/2 →
  Equipment:General Shop Equipment (1150040053). Only Sunbelt (equipment rental →
  equipment sub-account) warrants a human confirm. Run `figgy-suggest-backlog`
  on deploy for the FULL systematic sweep; don't hand-recode on the old assumption.
- GOTCHA (verified): a COLUMN-PROJECTED `Bill` query drops the line AccountRef —
  must use `SELECT *` (guard-commented in `qboVendorHistory`).
- CAVEAT (history-trust): the brain repeats history confidently, so a CONSISTENT
  miscode would still go 🟢green — green = "matches this vendor's history", not
  "provably correct". Human review gate stays the backstop.

## CRM repo notes
- Human review = `src/pages/Triage.tsx` (tabs: new / awaiting_client / approved
  / dismissed), backed by `api/agent-webhook-router.ts` (tRPC `agentWebhook`).
  Agents POST findings to `submitFinding` (X-Agent-Token), deduped by
  `sourceData` (Review Queue Row ID). This is where Brain flags should surface.
- **Enrich-on-click (2026-06-11):** Triage has a "✨ Get Figgy's suggestions"
  button → tRPC `qboBrain.enrichFindings` runs the brain over current-tab findings
  and folds triage/confidence/rationale/suggestedAccount into each `sourceData`
  (read-only QBO, defensive per-finding, returns error samples for remote debug).
  Shared core extracted to `suggestForClient(clientId, input)`. This is the live
  end-to-end test of the webhook bridge: click it, the cards light up (or the
  status line shows the bridge error to diagnose).
- **Brain triage on the cards (P0 done 2026-06-11):** Triage renders a
  traffic-light pill + confidence% + plain-English "Why" from the finding's
  `sourceData` JSON. Contract — posters/bridge include in `sourceData`:
  `triage` ("green"|"yellow"|"red"), `confidence` (0-100), `rationale` (string),
  optional `suggestedAccount`; alongside existing `vendor/amount/date/category/
  hst/gmailMsgId`. UI falls back to deriving color from the stored `confidence`
  (0-1) column if `triage` absent (`src/pages/Triage.tsx` `codingTriage`).
- **COLD-START CLASSIFIER (2026-06-11, Markie ask): `api/qbo-vendor-classify.ts`.**
  When a vendor has NO history, instead of a blank "needs account" Figgy offers a
  review-gated HINT from the vendor name: gas stations→Fuel (1150040005, tax 6),
  restaurants/takeout→Meals & Entertainment (1150040020, tax 7 / M&E 50% rate
  ref 15); also courier→shipping, telecom buckets. GOLDEN-RULE SAFE: maps only to
  REAL locked-chart accounts (per-realm `CATEGORY_MAPS` in qbo-vendor-brain.ts),
  always LOW confidence (40) + yellow + flagged, NEVER auto-posts, NOT cached
  until Markie confirms (then it's history-based). Layer 2 = LIVE WEB LOOKUP
  (Markie chose live runtime 2026-06-11): `api/qbo-vendor-web-classify.ts` calls
  Claude w/ server-side web_search to classify names keywords miss, fed through
  the SAME review-gated hint (source="web"). ON once `ANTHROPIC_API_KEY` set
  (Markie 2026-06-11; disable w/ `FIGGY_WEB_CLASSIFY=off`); model
  `FIGGY_CLASSIFY_MODEL` default `claude-haiku-4-5` (Markie's pick, ~5x cheaper).
  Clark CW now in `CATEGORY_MAPS` too (realm 13633946244024404): meals→Meals and
  entertainment(142, tax 9 M&E), fuel→Vehicle - Fuel(108, tax 7 HST).
  Fully defensive: any failure → null → brain falls back to plain no_history flag
  (web hiccup can't block/poison coding). Uses stable REST endpoint via fetch (no
  new dep). Wired into `suggestCoding` no_history branch. 27/27 checks.
- **Brain P0 core upgrades (`api/qbo-vendor-brain-core.ts`, 19/19 checks):**
  `decideCoding(entries, greenThreshold=85)` now returns `confidence` (0-100),
  `triage`, `rationale`; `decideDedup` compares invoice#s via
  `normalizeInvoiceNumber` (strip spaces/dashes/`INV`/`#`). tRPC
  `qboBrain.suggestCoding` takes optional `autoApproveThreshold`.
- Dev branch this session: `claude/figgy-junior-handoff-yiejeq`.
