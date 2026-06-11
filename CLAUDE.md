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
- Re-code the 16 June OS posts (mostly miscoded to 1150040016) from vendor
  history once the Account Brain exists — not by guessing now.

## CRM repo notes
- Human review = `src/pages/Triage.tsx` (tabs: new / awaiting_client / approved
  / dismissed), backed by `api/agent-webhook-router.ts` (tRPC `agentWebhook`).
  Agents POST findings to `submitFinding` (X-Agent-Token), deduped by
  `sourceData` (Review Queue Row ID). This is where Brain flags should surface.
- Dev branch this session: `claude/figgy-junior-handoff-yiejeq`.
