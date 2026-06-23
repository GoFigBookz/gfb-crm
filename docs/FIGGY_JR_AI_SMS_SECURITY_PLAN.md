# Figgy Jr — AI Chatbot, SMS, and Data Security Plan

Architecture recommendations for three things Markie wants in the bookkeeping CRM,
grounded in the existing stack:

- **Server:** Hono on Railway (`figgy.gofig.ca`), tRPC v11, React front end.
- **DB:** Drizzle ORM over SQLite/libsql today, moving to managed Postgres.
- **AI today:** Anthropic Claude already wired in (`ANTHROPIC_API_KEY`) for the
  vendor web-classifier (`api/qbo-vendor-web-classify.ts`, raw REST `POST
  /v1/messages`, model default `claude-haiku-4-5`).
- **Learning today:** the Figgy vendor-brain (`api/qbo-vendor-brain*.ts`) learns
  vendor→account/tax coding from each client's live QBO history and caches it in
  the `vendorMemory` table, keyed `(connectionId, qboVendorId)`, with a
  `confirmedByHuman` flag that makes Markie's approval win over history.
- **Crypto today:** AES-256-GCM `enc:v1:` envelope for QBO tokens
  (`api/qbo-oauth.ts`), HMAC-signed OAuth state, key from `FIGGY_TOKEN_KEY`/`APP_SECRET`.
- **Auth today:** tRPC role middleware (`api/middleware.ts`) with
  `admin > senior_bookkeeper > junior_bookkeeper > client`; `clientVault` table
  holds bank logins/CRA logins/credit cards; `employees.sin` holds SINs.

Golden rules carried through all three: nothing posts to QBO without Markie's
review; per-client isolation via `getConnectionForClient` is never weakened.

Sources are cited inline as `[S#]` and listed at the end.

---

## 1. Built-in AI chatbot/agent that learns from the practice

### Recommended approach

Build a **practice copilot**: a chat panel in the CRM backed by a new
`api/assistant-router.ts` that runs **Claude Opus 4.8 with tool use (the manual
agentic loop), grounded by RAG over the practice's own data, and a durable memory
layer that folds in the existing Figgy vendor-brain.** Read-only by default; every
write to QBO stays behind the existing review gate.

Three layers:

1. **Retrieval (RAG) over the practice's own data.** Index the CRM's own tables
   plus QBO snapshots into an embeddings store and retrieve the top-k relevant
   chunks into the prompt on each turn. This is what makes it answer "where does
   Clark OS stand on HST?" or "what did we decide about Walker's freight split?"
   from real data instead of hallucinating.
2. **Tools (live lookups).** Give Claude a small set of read-only tools that call
   the existing tRPC/QBO layer for anything that must be live and exact (current
   QBO balances, this month's triage counts, a vendor's coding history). RAG for
   recall over a lot of text; tools for precise current facts.
3. **Memory (learning loop).** Persist corrections and decisions as durable rows
   the copilot reuses, and treat the existing `vendorMemory` as the first, proven
   instance of this pattern.

### Why this shape

- **Tool use is the documented agent surface for Claude** — one `POST /v1/messages`
  endpoint, you define tools and run the loop, looping until `stop_reason ==
  "end_turn"` [S1][S2]. You already call this endpoint by raw REST, so no new
  dependency is forced; for the richer loop the official `@anthropic-ai/sdk` tool
  runner is the cleaner path [S2].
- **Start at the simplest tier that works.** Anthropic's guidance is to default to
  single calls / workflows and only reach for an open-ended agent when the task
  genuinely needs model-driven exploration [S1]. A RAG + tools chat with a manual
  loop is a *workflow/agent hybrid you control* — the right tier here, and it keeps
  the review-gate enforceable because every tool call passes through your harness
  [S1].
- **Opus 4.8** is the recommended default model and supports adaptive thinking and
  1M context [S3]. Keep `claude-haiku-4-5` for cheap, high-volume sub-tasks (e.g.
  the existing vendor classify, or embedding-free quick lookups) [S3].

### What to embed, and where

**Store: `sqlite-vec` now, `pgvector` at the Postgres cutover.** You are on
SQLite/libsql today and moving to Postgres; match the embedding store to the DB so
there is one operational surface and one backup. `sqlite-vec` adds vector search
to the existing libsql file with no new service; on Postgres, `pgvector` is the
standard and gives you real ANN indexes (HNSW/IVFFlat). The embeddings table is
just another Drizzle table either way, so the migration is a re-embed, not a
re-architecture.

**Embedding model:** Anthropic does not ship a first-party embeddings endpoint, so
use a dedicated embeddings provider (Voyage AI is Anthropic's documented
recommendation for embeddings) — one more API key, called server-side only.
Chunking: ~500–1000 tokens with metadata (clientId, sourceType, sourceId, date).

**What to index (each chunk tagged with `clientId` so retrieval is per-client by
default):**

| Source | Table(s) | Why |
|---|---|---|
| Client profile + service flags | `clients` | "Does this client have payroll / HST period / year-end month?" |
| Tasks & close status | `tasks`, `clientTaskRules`, month-end snapshots | "Who's behind on close?" |
| Emails | `emails` (`bodyPlain`, subject) | recall what was said |
| Interactions / notes | `interactions` | calls, meetings, SMS notes |
| QBO coding + history | `vendorMemory`, `qboAccounts`, synced txns | "How do we usually code this vendor?" |
| Documents | `files` (name + extracted text) | receipts/statements recall |
| Triage findings | `triageFindings.sourceData` | "what needs posting" |
| Payroll (non-SIN) | `employees`, `payroll*` | payroll questions — never embed SINs |

**Freshness:** embed on write. Add an `afterMutation` hook in the routers that
touch these tables (or a nightly reconcile job on the existing scheduler) that
upserts/deletes the chunk for the changed row. Keep QBO data fresh from the
existing snapshot layer (CLAUDE.md's month-end snapshot), not by fanning out live
QBO on every chat turn — that respects the Make ops cap and the snapshot mandate.

### Learning loop (durable memory, Figgy folded in)

Generalize the proven `vendorMemory` pattern into a `practiceMemory` table:
durable, human-confirmable facts the copilot retrieves before answering.

- **Capture corrections as memory.** When Markie corrects the copilot ("no, code
  X to account Y", "this client files HST quarterly"), write a `practiceMemory`
  row with `confirmedByHuman = true`. Confirmed facts win over inferred ones and
  are never silently overwritten — exactly the rule `vendorMemory` already enforces
  via `confirmedByHuman`/`confirmedAt`.
- **Per-client memory** via `clientId` scoping (NULL = practice-wide).
- **Figgy already is this loop for coding.** The copilot reuses it directly: a
  coding question calls `suggestForClient(clientId, …)` as a tool, so the chat and
  the Triage cards share one brain and one cache. No second source of truth.
- **No cross-client learning.** Practice-wide memory holds *Markie's* rules and
  preferences, never one client's financial data surfacing for another. Retrieval
  filters by `clientId`; the QBO isolation boundary (`getConnectionForClient`,
  refuses to guess) is unchanged.

### Concrete data model

```
chatThreads        (id, userId, clientId?, title, createdAt, updatedAt)
chatMessages       (id, threadId, role: user|assistant|tool,
                    content TEXT, toolCalls JSON?, tokensIn, tokensOut, createdAt)
embeddings         (id, clientId?, sourceType, sourceId, chunkText,
                    embedding VECTOR, metadata JSON, updatedAt)
practiceMemory     (id, clientId?, key, value, rationale,
                    confirmedByHuman BOOL, confirmedAt, source, updatedAt)
```

### Components

- `api/assistant-router.ts` (tRPC, `staffQuery`): `ask` (RAG + Claude + tool loop),
  `listThreads`, `getThread`, `confirmMemory`.
- `api/assistant-core.ts`: pure prompt-build, retrieval, and the agent loop —
  unit-testable like the existing `*-core.ts` files.
- `api/embeddings.ts`: embed + upsert/delete; called from mutation hooks + nightly.
- Read-only tools exposed to Claude: `getClientStatus`, `searchPractice` (RAG),
  `getVendorCoding` (→ `suggestForClient`), `getMonthEndStatus`, `listTriage`.
  **No write tool ships in v1** — drafting an email or proposing a coding returns a
  *suggestion object* the UI shows for one-click human action; nothing posts to QBO.
- React: a chat panel (drawer) reusing the Triage card styling.

### Phased build plan

1. **Chat shell (no RAG):** tables + `assistant-router.ask` calling Claude with the
   current client's profile in the system prompt; stream the reply. Proves the
   panel and the model call end-to-end.
2. **Tools:** add the 5 read-only tools over existing tRPC/QBO; manual agentic loop.
   Now it answers live "where does X stand" questions.
3. **RAG:** `sqlite-vec` + embeddings table + nightly indexer over emails, notes,
   tasks, vendorMemory; retrieval into the prompt.
4. **Memory:** `practiceMemory` + `confirmMemory`; wire Figgy's `suggestForClient`
   as the coding tool so the chat and Triage share the brain.
5. **Postgres cutover:** swap `sqlite-vec` → `pgvector`, re-embed.

### What Markie must provide

- An **embeddings API key** (e.g. Voyage) as a server env var.
- Confirm Opus 4.8 for chat (cost: $5/$25 per MTok) vs Haiku for cheap paths [S3].
- A decision on whether the copilot may ever *draft* (not send) client emails in v1.

---

### BUILT: Figgy chatbot v1 (2026-06-23)
Phone-friendly chat at `/assistant` ("Ask Figgy" in the sidebar): Claude tool-loop
(`assistant-router.ts` + `assistant-core.ts`) with two tools — **add_task** (NL →
task via `parseTaskCommand`) and **get_agenda** (overdue/today/upcoming tasks +
today's calendar events). Voice-dictation button for hands-free. Needs
ANTHROPIC_API_KEY (set). Model `FIGGY_ASSISTANT_MODEL` (default claude-haiku-4-5;
bump to sonnet/opus for "smarter"). NEXT (to make it the driving copilot Markie
wants): more read tools (client status, "what's due for HST", month-end board),
SMS front door (Twilio) so he can TEXT it, and richer agenda (date-range queries).

### TODO: EMAIL INTELLIGENCE + DEFINE ALL AI-AGENT ROLES (Markie 2026-06-23)
The app must be SMART about incoming client email (now that client-only email +
real send/reply are built):
- **Monitor client emails → auto-flag tasks** that need doing (e.g. "send me the
  May statements" → a task on that client), surfaced in Triage / the client card.
- **Draft replies in Markie's tone** (LEARNED from his past replies — a tone/style
  the agent improves over time), shown as a DRAFT for one-click send (never
  auto-send), reusing the real send path.
- **DEFINE THE AGENT ROLES CLEARLY (open question):** who does what — Figgy Jr
  (bookkeeping pipeline) vs an "Executive Assistant" agent (email triage, drafts,
  agenda, the chatbot)? Markie wants the rules of each AI agent spelled out. Decide:
  one agent with modes, or distinct agents (Figgy Jr = books/posting; EA = comms/
  scheduling/chatbot). Decide before building the email-intelligence loop so it
  slots under the right agent + shares the learning/memory layer.

### Built now: natural-language "add a task for client X" (2026-06-22)
The specific thing Markie asked for ("text the bot: add this task for client X") has
a **deterministic, dependency-free core shipped**: `api/task-command-core.ts`
(`parseTaskCommand`) extracts the client (longest name match), title, due date
("Friday"/"tomorrow"/"in 3 days"/"by Jun 30"), and priority ("urgent") from one
line of text. Unit-tested (`task-command-core.test.ts`, 10 cases). Exposed as tRPC
`task.quickAddFromText` (RBAC-scoped — only matchable to clients the user can
access) and wired into the **Quick Add** page as a "type it like a text" box.
**To make it literally text-able:** stand up the Twilio `POST /api/sms/inbound`
route (section 2) and, when a message starts with "add task"/"remind me", call the
SAME `parseTaskCommand` + create the task, replying with a confirmation. The parser
is the shared brain; SMS is just another front door. An LLM (Claude) fallback can
wrap the parser later for fuzzier phrasing — but the cheap path covers the common
case today.

## 2. Texting (SMS) clients

### Recommended approach

Add a dedicated **Messages inbox** in the CRM backed by **Twilio Programmable
Messaging** with a **Canadian 10-digit long code (CLC)**: inbound texts hit a Hono
webhook → stored → matched to a client by phone → shown in an in-CRM thread;
outbound sends from the same number. Keep Messages a **separate surface** from the
chatbot, but let the chatbot *read* it (messages get indexed into RAG) and offer
**draft replies** for Markie to send.

### Provider choice

**Twilio** is the recommended provider: mature API, first-class inbound webhooks,
strong Canadian number support, and the broadest docs. (Alternatives — Telnyx,
Bandwidth, MessageBird — are viable but Twilio is the safest default for one
practice on a tight ops budget.)

**Canadian numbers / compliance — the real gotcha:**

- **A2P 10DLC is the US registration regime; it does NOT apply to Canadian
  numbers.** For texting Canadian clients, provision a **Canadian Local (long
  code) number** in the client's area code. Canadian carriers do enforce
  anti-spam/consent rules (CASL), so: get explicit consent to text (the engagement
  letter / onboarding form is the natural place), honour STOP/unsubscribe, and
  identify the business. This is lighter than US 10DLC but consent is mandatory.
- If volume ever grows or US clients are added, US numbers texting US recipients
  *do* require A2P 10DLC brand + campaign registration — revisit then, not now.
- Practical note: keep one sending number per practice (not per client) so threads
  are coherent and consent is easy to track.

### Inbound capture → store → link to client

1. Twilio is configured to POST inbound SMS to `POST /api/sms/inbound` on the Hono
   server (a public, signature-verified route — see below).
2. The handler **verifies the Twilio request signature** (`X-Twilio-Signature`,
   HMAC over the URL + params with the Twilio auth token) before trusting anything.
3. Normalize the `From` number to E.164 and match against `clients.phone` (and a
   new alternate-numbers table). On match → link `clientId`; on no match → leave
   unlinked for manual assignment (mirrors how Triage handles unmatched findings).
4. Insert an `smsMessages` row and an `interactions` row (`type: "sms"` already
   exists in the schema) so texts show in the client timeline.

### In-CRM inbox + outbound

- A **Messages** page: left list of conversations (by client / unlinked), right a
  thread view; a compose box sends via `smsRouter.send` → Twilio REST.
- Outbound sends from the practice's Canadian number; store the sent row, mirror to
  `interactions`.
- Delivery receipts: Twilio status callbacks → `POST /api/sms/status` updates the
  row (`queued`→`sent`→`delivered`/`failed`).

### Fold into the chatbot, or separate?

**Separate surface, shared data.** Texting is a human-to-human channel — Markie
should read and reply himself, especially for a financial practice. But:

- Index inbound/outbound SMS into RAG so the copilot can answer "what did this
  client text about the bank statement?"
- Let the copilot **propose a draft reply** in the Messages thread (one-click send),
  never auto-send. Same review-gate philosophy as QBO posting.

### Concrete data model

```
smsMessages   (id, clientId?, direction: inbound|outbound,
               fromNumber, toNumber, body, twilioSid,
               status, mediaUrls JSON?, createdAt)
clientPhones  (id, clientId, e164, label, consentAt, consentSource)  -- consent audit
```
(plus an `interactions` row per message — `type: "sms"` already supported.)

### Components

- `POST /api/sms/inbound` and `POST /api/sms/status` — Hono routes, Twilio-signature
  verified, **not** tRPC (Twilio posts form-encoded).
- `api/sms-router.ts` (tRPC `staffQuery`): `listThreads`, `getThread`, `send`,
  `assignToClient`, `recordConsent`.
- `api/sms-core.ts`: number normalization, client matching, signature verify
  (unit-testable).
- React: `Messages.tsx` inbox.

### Phased build plan

1. **Inbound only:** buy a Canadian number, point the webhook at the CRM, store +
   match + show in the client timeline via `interactions`.
2. **Inbox + outbound:** Messages page, `send`, status callbacks.
3. **Consent + compliance:** `clientPhones` consent audit, STOP handling, capture
   consent in onboarding.
4. **Copilot integration:** index SMS into RAG; copilot draft-reply.

### What Markie must provide

- A **Twilio account** + a provisioned **Canadian long-code number**; set
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_NUMBER` as env vars.
- Confirm the **practice's public webhook URL** (`figgy.gofig.ca`) for Twilio.
- Add an **SMS consent checkbox** to the onboarding/engagement flow (CASL).

---

## 3. Data protection / security

This system holds bank logins, CRA logins, credit-card numbers (`clientVault`) and
**SINs** (`employees.sin`) — the highest-sensitivity data in the practice. The good
news: the hardest primitive (AES-256-GCM field encryption + key management) already
exists for QBO tokens. The work is to **extend it to the vault and SINs**, harden
auth, and lock down the Railway deployment with Canadian data residency.

### Encryption at rest

- **Reuse the proven envelope.** `encryptSecret`/`decryptSecret` in
  `api/qbo-oauth.ts` already do AES-256-GCM with an `enc:v1:` self-describing
  envelope, key derived from `FIGGY_TOKEN_KEY`/`APP_SECRET`. Extract these into a
  shared `api/crypto.ts` (no new dependency — Node `crypto`).
- **Field-level encryption for the crown jewels — priority 1:**
  - `clientVault.*` secret columns (bank/CC/CRA/IRS logins & passwords, CVV).
  - `employees.sin`. **Encrypt the SIN, and store a search-blind index** (HMAC of
    the SIN with a separate key) if you ever need to look one up — never a plaintext
    or reversible-from-index value. Mask in the UI to last-3 by default; full reveal
    is an audited, admin-only action.
- **DB-level encryption at rest:** managed Postgres gives you encryption-at-rest on
  the volume for free; field-level encryption is the layer that protects against a
  *leaked dump or a curious DBA*, which volume encryption does not.

### Encryption in transit

- HTTPS everywhere (Railway terminates TLS at `figgy.gofig.ca`); enforce HSTS.
- Postgres connections over TLS (`sslmode=require`).
- Outbound to Anthropic/Twilio/QBO is already HTTPS; never log full request bodies.

### Auth & session hardening

- Role middleware already exists (`requireMinRole`) — good. Add:
  - **Short-lived sessions + rotation**, `HttpOnly`+`Secure`+`SameSite` cookies.
  - **MFA for staff logins** (TOTP) — this data set warrants it.
  - **Rate-limit auth + public webhooks**; verify the Twilio signature and the
    existing `X-Agent-Token` on every public POST.
  - Strong password hashing (the `passwordHash` column exists; ensure argon2/bcrypt).

### RBAC (least privilege)

- Keep `admin > senior > junior > client`. **Gate the vault and SINs to
  admin/senior only** — a junior bookkeeper should not read bank passwords or SINs.
  Add explicit capability checks on `vault-router` and any SIN-returning query.
- Client-portal role must only ever see its own `clientId` (it already does via
  portal tokens — keep that boundary).

### Secrets management

- All keys (`FIGGY_TOKEN_KEY`, `QBO_CLIENT_SECRET`, `TWILIO_AUTH_TOKEN`,
  `ANTHROPIC_API_KEY`, embeddings key) live in **Railway environment variables /
  secrets**, never in the repo. Note CLAUDE.md commits read-only Make webhook URLs
  as an interim trade-off — close that with native OAuth (already underway) and keep
  *write*-capable secrets out of git permanently.
- **Separate keys per purpose** (token-encryption key ≠ SIN-index HMAC key) so a
  single leak has a bounded blast radius; the existing `deriveKey(purpose)` helper
  already supports this.
- Plan a **key-rotation** procedure: the `enc:v1:` prefix lets you bump to `v2:` and
  re-encrypt lazily on next write (same pattern already used for legacy plaintext).

### Canadian data residency / PIPEDA

- **Move to managed Postgres in a Canadian region** — AWS `ca-central-1` (Montreal)
  or GCP Montreal, exactly as CLAUDE.md's roadmap states. This keeps client
  financial data and SINs resident in Canada, the cleanest PIPEDA posture.
- **Railway region:** deploy the app in / closest to Canada and confirm the
  database provider's region is Canadian. If Railway's managed Postgres cannot
  guarantee a Canadian region, use an external managed Postgres (e.g. AWS RDS
  `ca-central-1`, Neon/Supabase Canadian region) and point the app at it.
- **Sub-processor note:** Anthropic, Twilio, and the embeddings provider process
  data outside Canada. PIPEDA allows transfers with comparable protection +
  transparency — disclose sub-processors in the privacy policy/engagement letter,
  and **never send SINs to any LLM or SMS provider** (SINs are excluded from
  embeddings and from any prompt by construction).

### Backups (3-2-1)

- **3** copies, **2** media/locations, **1** offsite: managed Postgres automated
  daily backups + point-in-time recovery, plus periodic encrypted dumps to a
  second Canadian-region object store. CLAUDE.md already targets 3-2-1-1-0 — adopt
  it. Backups inherit field-level encryption (vault/SINs stay ciphertext in dumps),
  and **test a restore** quarterly.

### Audit logging

- Add an `auditLog` table: `(id, userId, action, entityType, entityId, ip,
  userAgent, createdAt)`. Log: vault reads, SIN reveals, QBO posts/approvals, auth
  events, role changes, copilot tool calls that touch sensitive data. Append-only;
  retained per policy. This is both a security control and a PIPEDA accountability
  artifact.

### Prioritized hardening checklist (Railway, self-hosted)

1. **Field-encrypt `clientVault` + `employees.sin`** with the existing AES-256-GCM
   envelope (shared `api/crypto.ts`); SIN search-blind HMAC index; UI masking.
2. **RBAC gate** vault + SIN access to admin/senior; add capability checks.
3. **Secrets in Railway env only**; separate keys per purpose; document rotation.
4. **MFA for staff**, hardened cookies, session rotation, auth rate-limiting.
5. **Verify all public webhooks** (Twilio signature, agent token) + rate-limit.
6. **Managed Postgres in `ca-central-1`/Montreal**, TLS, encryption at rest.
7. **3-2-1 backups** with tested quarterly restore; encrypted offsite dumps.
8. **`auditLog`** for vault/SIN/QBO/auth/role/copilot-sensitive actions.
9. **Privacy policy + sub-processor disclosure**; SINs never leave the DB to any
   third party (LLM/SMS); confirm SIN exclusion from embeddings.
10. **HSTS + security headers**; redact secrets and PII from all logs.

### What Markie must provide

- Decision: Railway-managed Postgres in a Canadian region, or external managed
  Postgres (RDS/Neon/Supabase) in `ca-central-1`/Montreal.
- A backup destination (second Canadian-region bucket) + retention policy.
- Sign-off to require **MFA** for all staff logins.
- The privacy-policy / engagement-letter language disclosing sub-processors and SMS
  consent.

---

## Sources

- [S1] Anthropic, *Building LLM-Powered Applications with Claude* (claude-api
  skill): "Which surface should I use?" / "Should I build an agent?" / Agent Design
  Patterns — start simple, use tool use for custom-tool workflows/agents, harness
  controls the loop and the security boundary.
- [S2] Anthropic, *Tool Use Concepts* (claude-api skill) + TypeScript tool-use
  docs: single `POST /v1/messages` endpoint, manual agentic loop (`stop_reason ==
  "end_turn"`), `@anthropic-ai/sdk` tool runner, read-results/`tool_result`
  contract.
- [S3] Anthropic, *Current Models* / `shared/models.md` (claude-api skill): Opus
  4.8 (`claude-opus-4-8`, $5/$25 per MTok, 1M context, adaptive thinking) as the
  default; Haiku 4.5 (`claude-haiku-4-5`, $1/$5) for cheap high-volume paths.
- [S4] Codebase: `api/qbo-oauth.ts` (AES-256-GCM `enc:v1:` envelope, HMAC state,
  `deriveKey(purpose)`), `api/qbo-vendor-brain*.ts` + `vendorMemory`
  (`confirmedByHuman` learning loop, `getConnectionForClient` isolation),
  `api/middleware.ts` (role hierarchy), `db/schema.ts` (`clientVault`,
  `employees.sin`, `interactions.type = "sms"`, `emails`, `clients`, `tasks`).
- [S5] CLAUDE.md operating context: month-end snapshot mandate / Make ops cap,
  managed Postgres in `ca-central-1`/Montreal + 3-2-1-1-0 backups roadmap,
  golden rules (review gate, per-client isolation), interim committed-webhook
  trade-off to be closed by native OAuth.
- [S6] Public domain knowledge (provider/regulatory): Twilio Programmable Messaging
  + inbound webhook signature verification; A2P 10DLC applies to US numbers (not
  Canadian long codes); CASL consent/STOP obligations for Canadian SMS; PIPEDA
  data-residency and cross-border transfer guidance.
