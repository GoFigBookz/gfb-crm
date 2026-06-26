# Figgy / Go Fig Bookz — Current Architecture Overview

> Written for Markie + ChatGPT + Claude to get on the same page (2026-06-26).
> Verified against the live codebase, not from memory. App = **figgy.gofig.ca**
> (Railway, auto-deploys from `main`). This is the **CRM + AI-firm** repo
> (`gofigbookz/gfb-crm`); the older transaction pipeline still lives partly in
> **Make.com + Google Sheets + QBO**, being pulled into this app.

This answers ChatGPT's seven questions in order.

---

## 0. The 30-second picture
- **One web app** (React + Vite frontend, tRPC/Hono backend, Node) on Railway.
- **One database**: libSQL/SQLite via Drizzle ORM (~90 tables). All queries written
  Postgres-portable (raw SQL where needed) so it can move to managed Postgres later.
- **One AI brain** (a set of DB tables) that ALL agents read/write — this is how
  they "talk" to each other at **zero marginal cost** (shared state, not paid calls).
- **8 named AI agents + Markie** (the human partner, final sign-off).
- **77 internal API modules** (tRPC routers) + a handful of **external APIs**
  (Anthropic, Google, Intuit QBO, Microsoft, payment connectors, Make.com).
- **Hard rule everywhere**: nothing posts/sends/files to a client's books without
  Markie's review. All auto-posters are OFF. Per-client data is isolated.

---

## 1. What AI agents already exist
Defined in `api/seed-ai-agents.ts` (DB-seeded) + `api/assistant-core.ts` (`AGENT_ROSTER`).
Each has a **skill pack** in `api/skills/<name>.ts`. The org chart is a **review
chain** — each tier checks the one below; nothing is final until the next level
(and Markie) clears it.

| Agent | Type | Job (one responsibility) |
|---|---|---|
| **Fig / Figs** | `bookkeeper` | JUNIOR BOOKKEEPER — the *doing*: pull from QBO, code vendors, intake receipts, post (proposals only). |
| **Sage** | `senior_bookkeeper` | SENIOR BOOKKEEPER — *checks Fig*, then preps HST / WSIB / payroll filings for approval. |
| **Wren** | `auditor` (controller) | CONTROLLER/AUDITOR — tie-outs (bank↔HST↔payroll↔GL), CRA audit support, the signed month-end workpaper. Reviews Sage. |
| **Liv** | `executive_assistant` | EXEC ASSISTANT + FRONT DESK — comms, agenda, email triage + tone-matched **draft** replies (never auto-send), Markie's **personal** life (walled off), Phoenix Rising. |
| **Jinx** | `qa` | QA / WATCHDOG — smoke-tests + live health checks; flags Markie only when something breaks. |
| **Tess** | `tax` | TAX SPECIALIST — T2/T1, HST/GST returns, year-end, instalments, CRA correspondence (prep only). |
| **Jade** | `cfo` | FRACTIONAL CFO — forward-looking finance/advisory. |
| **Skye** | `social_media_manager` | SOCIAL / MARKETING — content, calendar, + the resale side-business marketing. |
| **Markie** | human | PARTNER — final sign-off on everything. |

Status: all 8 are **live in chat** (advisory + their no-QBO tools). The QBO-dependent
"doing" (posting, filing) lights up when the QBO **write** connection is on.

---

## 2. What each one does — and the agent "operating system"
Beyond personas, every agent runs on a shared best-practice stack:
- **Procedural memory** — `api/skills/*` (one file per agent + `common.ts` standards
  + `quickbooks.ts` full QBO playbook). Injected into the active agent's prompt.
- **Charter / lanes** — `seedAgentCharter()` writes 9 `charter` records to the Brain:
  one coordination rule + each agent's **DOES / DOES-NOT / HANDS-OFF** lane. This is
  what enforces "no overlap, no duplicated work."
- **Episodic memory (learning loop)** — `agent_learnings` table + `learning-core.ts`.
  The `remember` tool and Triage review notes capture confirmed corrections; relevant
  lessons are injected into every agent's prompt. One correction teaches the whole team
  (per-client isolation preserved).
- **Evaluation** — `scorecard-core.ts` (acceptance rate, trend, grade) shown on System Health.
- **Governed autonomy** — `governance-core.ts` (`decideAutonomy`, default **OFF** =
  everything escalates) + `agent_audit_log` (`agent-audit.ts`). The dial that lets an
  agent act unattended once its scorecard earns trust. Not yet opened.
- **Constitution** — the **Figgy Operating System (FOS) v1.2**, seeded into the Brain
  (`seedConstitution()`); accuracy > speed, security > convenience, review gate always.

---

## 3. How they communicate
**Through one shared Brain (DB state), not by calling each other.** This is the key
design choice — talking is free because it's reads/writes to shared memory.

- **One chatbot** (the "Ask Figs" / Assistant page). **Liv is the front desk.**
  - `detectAgent()` routes by name ("Hey Sage / Hey Wren") OR by topic (`TOPIC_RULES`
    regex) — so Markie can "just talk" and the right agent answers, sticky across the thread.
  - `frontDeskSystem(agent)` builds that agent's system prompt = persona + FOS + skills
    + charter lane + remembered lessons + the team roster.
- **Hand-offs** = a short note left in the Brain (`addTruth`). The next agent reads it
  (`brainAsk`). No extra AI call is spun up just to "message" a teammate.
- **The review chain is the workflow path for the books**: Fig → Sage → Wren → Markie.
- **Shared chatbot tools** (every agent can DO things): `add_task`, `get_agenda`,
  `add_personal`, `firm_status` (live clients/tasks/triage counts), `system_health`,
  `agent_scorecard`, `remember`, `web_search` (+ live clock + device location).

---

## 4. What databases they use
**One database — libSQL/SQLite via Drizzle ORM** (`api/queries/connection.ts`,
`@libsql/client`), ~**90 tables** (`db/schema.ts`). Written to be Postgres-portable
(idempotent boot-time `ensure-*-schema.ts` guards using raw SQL). Major table groups:

- **Firm/clients**: `clients`, `employees`, payroll runs/lines, `company_groups`, interco.
- **QBO**: `qbo_connections` (native OAuth tokens encrypted at rest + Make-bridge transport), `vendorMemory` (per-connection coding memory).
- **AI brain & agents**: brain records + open questions, `agent_learnings`,
  `ai_agents`, `agent_scorecard`, `agent_audit_log`.
- **Work surfaces**: triage findings (agent webhook), calendar events, tasks, emails, sender rules.
- **Modules**: `rr_*` (Revenue Recognition/WIP), `banked_hour_*`, loans, subscriptions, `firm_registers` (knowledge-asset library).
- **Phoenix Rising (private, owner-only, walled off)**: `family_members` + genealogy
  (`genealogy_findings`, `genealogy_scan_runs`, `family_share_links`), `estate_items`,
  `side_products`/`side_sales`, `trading_*`, health tables, `personal_items`.

**Isolation guarantee**: every client QBO read goes through ONE connection whose
`realmId` is in the URL; `getConnectionForClient()` refuses to guess (0 = not connected,
2+ = ambiguous). Personal/Phoenix data carries no `clientId` and is scoped to the user id.

---

## 5. What knowledge they share
- **The Brain** — scoped `firm` / `client` / `personal`, category-tagged
  (`constitution`, `charter`, `decision`, `heritage`, tax/HR/legal knowledge, etc.).
  `addTruth` writes, `brainAsk` reads, `fileQuestion`/`answerQuestion` for open gaps.
  Decisions made in the app (Decision Register) are mirrored here so Liv can answer
  "why did we decide X?" years later.
- **Vendor Memory** (`vendorMemory`) — per `(connectionId, vendorId)` coding history;
  the heart of how Fig codes transactions from a client's own past.
- **Learnings** (`agent_learnings`) — confirmed corrections, shared across agents,
  isolated per client.
- **Skill packs** (`api/skills/*`) — the standardized procedures/playbooks.
- **Knowledge pack** (`seedKnowledgeBrain()`) — researched tax/payroll/HR/legal facts
  with "⚠ VERIFY ANNUALLY" on anything rate-sensitive.

Cross-client learning is **forbidden** by design — a client's quirks never leak to another.

---

## 6. What APIs they have
**Internal (this app):** ~**77 tRPC routers** (`api/router.ts`). Notable ones:
`assistant` (chatbot), `brain`, `learning`, `jinx` (QA/health), `jade` (CFO),
`marketing` (Skye), `agentWebhook` (Triage), `qboBrain` (vendor coding), `revRec`,
`bankedHours`, `genealogy`, `phoenix`, `health`, `personal`, `registers`, `connector`,
`googleSync`/`microsoftSync`, `monthEnd`/`monthlyClose`, `practiceHealth`, `dashboard`,
`payroll`/`time`/`workload`, `hstAudit`, `portal`/`signature`/`onboarding`.

**External APIs integrated:**
- **Anthropic** (`api.anthropic.com`) — the chatbot, vendor web-classifier, and the
  genealogy monthly web-search scan. Key = `ANTHROPIC_API_KEY` (features degrade safely without it).
- **Google** — Gmail (intake/email), Sheets, Tasks, Calendar, **Drive**, OAuth2.
  *Blocker:* the Google OAuth app is still in "testing," which is why prod email/Drive
  automation is gated (task #42 = publish to Production — the master unlock).
- **Intuit QuickBooks Online** — TWO transports that coexist: **native per-realm OAuth**
  (`api/qbo-oauth.ts`, tokens AES-256-GCM encrypted, rotation persisted) AND a **read-only
  Make webhook bridge** (`hook.us2.make.com/...`) so the brain can run on live books today.
  *QBO writes/posting are OFF* pending the prod Intuit app + Markie's go-live.
- **Microsoft Graph** — email sync (`microsoftSync`).
- **Payment/ops connectors** (per client): PayPal, Stripe, Wise, Square (+ Jobber OAuth);
  API keys encrypted at rest. Monthly statement-pull sync funcs in `api/connector-router.ts`.
- **Make.com** — scenarios for Gmail/Drive intake, the per-realm QBO tools, sanity guard, etc.

---

## 7. What workflows are already implemented
- **Receipt/email intake** — Gmail + Drive → Make → 34-column capture → Triage.
- **Email → client sorting** — `api/google-sync.ts` matches each email to a client by
  address/domain on sync + backfills nulls.
- **Vendor coding brain** — `qbo-vendor-brain*`: resolve vendor → code from history;
  cold-start name classifier; live web classifier; confidence + traffic-light triage +
  plain-English "why". Read-only; posters off.
- **Triage review surface** (`src/pages/Triage.tsx` + `agentWebhook`) — agents POST
  findings; "✨ Get Figgy's suggestions" enriches them live; approve/dismiss teaches the Brain.
- **Month-end close cockpit** — per-client status + portfolio "who's behind" board +
  per-client "Open in QuickBooks" deep-links; cached snapshots (cheap, not live-fanned).
- **Payroll** — per-employee backfills, banked-hours ledger (shared client sheet), run hours.
- **Revenue Recognition / WIP** — percentage-of-completion (ASPE 3400), DRAFT journal
  entries only (never posts), per-client share link.
- **Family tree** — confidence-rated genealogy; Liv's **monthly web scan on the 28th**
  → review inbox (never auto-merged) → shareable public page.
- **Scheduled jobs (boot + daily)** — QBO token keep-alive, dashboard trend snapshots,
  tax-rate auto-refresh, inbound email sync (every 20 min), genealogy monthly scan.
- **Health/agent stack jobs** — Jinx health checks, scorecard, governance/audit logging.

---

## Deployment & ground rules
- **Railway** auto-deploys `figgy.gofig.ca` from `main` only. The repo commits a
  prebuilt `dist/`; `BUILD_TAG` in `api/boot.ts` is bumped every deploy so prod-vs-source
  is unambiguous. Every batch of work ends with a PR merged to `main`.
- **Golden rules**: nothing posts to QBO without Markie's review; chart of accounts is
  LOCKED (no invented accounts); Clark OS & Clark CW are permanently separate books;
  per-client isolation always; personal/Phoenix data walled off from firm/client data.
- **Engineering standard** (`docs/FIGGY_ENGINEERING_STANDARD.md`): no black boxes,
  document while building, modular (one responsibility), standardize anything repeated
  >2×, security as a requirement, fail safely, build for change, preserve auditability.

---

## Honest status (what's live vs pending) — for the ChatGPT conversation
- **Live now**: the whole CRM/UI, all 8 agents in chat, the Brain + learning + charter +
  scorecard + governance scaffolding, vendor coding brain, Triage, month-end cockpit,
  payroll tools, RevRec drafts, banked hours, Phoenix Rising suite, family tree,
  **read-only** QBO via the Make bridge.
- **Pending Markie/creds (not code)**: publish Google OAuth to Production (#42 — unlocks
  live email + Drive automation); register the prod Intuit app to turn on **native QBO +
  writes**; connect the remaining payment providers with real keys.
- **Deliberately OFF (safety)**: all auto-posters; governed autonomy (default escalate).

*If ChatGPT proposes something that conflicts with the golden rules, the review chain,
or per-client isolation, that's where we'd push back — those are non-negotiable. Almost
everything else is on the table.*
