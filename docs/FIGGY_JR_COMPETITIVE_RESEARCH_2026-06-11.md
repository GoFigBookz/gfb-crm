# FIGGY JR / gfb-crm — COMPETITIVE RESEARCH & BEST-PRACTICE SYNTHESIS (2026-06-11)

Deep-research pass across ~9 source threads (practice-management platforms, AI
auto-coding tools, the client-query loop, multi-tenant QBO integration, and
self-host vs SaaS). Goal: bake the best of the market into gfb-crm + Figgy Jr,
judged against the mandate (less owner time, less cost, accurate books on cheap
autopilot, AI that learns per client, strict per-client isolation, build once).

---

## VERDICT (read first)
The market is **converging on exactly your bet**, and several big players that
bet the other way are failing at it:
- **Survivors gate every post behind human review.** Docyt posts only at 100%
  confidence ("nothing hits the ledger until you review and approve"); Truewind
  surfaces confidence + explanations and flags anything < ~90%.
- **The autonomous, auto-posting bets are stumbling.** Botkeeper (~$90M raised)
  **shut down Feb 2026**; Booke AI's reviews report "books got messed up / auto-
  categorize doesn't work." LLM hallucination benchmarks (15–52% general,
  higher in specialized domains) are why a human gate is correct, not timid.
- **Per-client isolation is a selling feature.** Booke advertises a "fully
  isolated AI Brain, trained only on each client's data — no cross-client
  sharing, ever." That's your `getConnectionForClient` boundary already.
- **Coding from history + supplier memory is the industry standard** (Xero
  default accounts, Dext Supplier Rules, Digits' vendor graph). Figgy's
  vendor-history brain is the right engine.

So Figgy isn't behind the market — on the things that matter (isolation, review
gate, history-based coding, multi-field dedup) it's **ahead of the auto-posting
crowd**. The gains are in polish (dedup normalization, confidence UX,
explainability), the client-query loop (Uncat is the benchmark), and a
best-practice connection + hosting layer.

---

## WHERE gfb-crm/Figgy ALREADY MATCHES OR BEATS BEST PRACTICE
| Practice | Best-in-class does | Figgy status |
|---|---|---|
| Code from vendor's own history | Xero/Dext/Digits | ✅ brain built + tested |
| Multi-field dedup (vendor+inv#+amt+date) | AutoEntry (4 fields), Hubdoc (3+inv#) | ✅ same key |
| Human review before posting | Docyt, Truewind, Bill.com | ✅ golden rule |
| Per-client data isolation | Booke "isolated brain" | ✅ realm-bound, refuses to guess |
| Capture which card paid as a signal | Digits | ✅ last-4 captured (Phase 1) |
| Ledger event → client task | Keeper/Double, Client Hub | ◑ Triage + awaiting_client exists |

---

## COMPETITIVE TEARDOWN (good / bad)
### AI bookkeeping / document-automation
| Tool | Good | Bad / caution |
|---|---|---|
| **Dext** | 99.9% OCR clean docs; Supplier Rules (cat/tax/pay-method per supplier); matches already-reconciled txns | No receipt-level dedup; pricey; weak on poor scans |
| **Hubdoc** | Free w/ Xero; dedup on supplier+date+total+inv#; auto-fetch | 3.5/5 extraction; **no line items** (not planned); misses payment card |
| **AutoEntry** | 99% accuracy; **dedup on 4 fields**; line items; per-doc pricing | Line-item errors; auto-post unreliable |
| **Uncat** | **Best client-query loop**: magic-link, auto-notify email/SMS, **2-way sync back to QBO** (cat/vendor/class + receipt); $9/client | Doesn't auto-code; thin reporting |
| **Keeper/Double** | Ledger-tied client questions; payee/entity dedup reports; branded portal | UI complaints; **no auto-sync of answers back to QBO**; US-QBO only |
| **Booke AI** | GPT-4 coding; isolated per-client brain; learns from corrections | **Auto-posts → "books got messed up"**; support complaints |
| **Botkeeper** | (historical) ML + confidence tiers | **Shut down Feb 2026** |
| **Docyt** | Posts only at 100% conf; voice + chat client queries; HpAI | $299+/mo; steep onboarding |
| **Truewind** | Confidence + **plain-English explanations**; SOC 2; fast close | Narrow (close automation); 3–6wk onboarding |
| **Digits** | Proprietary vendor **graph/semantic** model; instant learning; learns by which card paid | **Autonomous (no required review)** — control trade-off |
| **Vic.ai** | Multi-tenant learning from 1B+ invoices | Cross-client learning — **violates your isolation rule**; enterprise |
| **Klarity** | **Interactive "justify this decision" chat**; learns from approvals | AP/enterprise focus |
| **Ramp / Bill.com** | 92% first-pass, 8% flagged one-click; fraud detection | Spend/AP-centric, not GL depth |

### Practice-management platforms
| Tool | Good | Bad | Price |
|---|---|---|---|
| **Karbon** | Email "Triage" shared inbox → tasks; analytics | Pricey; no task dependencies; add-ons cost extra | $59+/user |
| **TaxDome** | All-in-one; excellent client portal + app; 2-way SMS | Steep setup; restrictive payments; weak reporting | ~$58/user |
| **Canopy** | IRS transcripts; new capacity planning | Complex modular pricing (top complaint); bugs | $150 base + modules |
| **Jetpack** | Simple recurring tasks; fast setup | **No client portal**; can't invoice from time; rigid templates | $40–49/user |
| **Financial Cents** | Best value; magic-link portal; 11 reports; 200+ templates | Limited dependencies; Xero via Zapier only | $19–69/user |
| **Pixie** | ~1hr setup; flat per-firm | No dashboard; limited portal | ~$65/firm |
| **Aero** | Flat (not per-user); embeds procedures; scope-creep view | Dated; learning curve | tiered flat |
| **Client Hub** | **Uncategorized txn → client task**; AI thread summaries; unlimited clients | Can't run overlapping workflow instances | $69–79/user |

---

## BEST-PRACTICE PATTERNS BY AREA

### A. Auto-coding & supplier memory
- Default to the account the vendor has used; surface confidence; learn from
  every correction (Dext, Digits, Ramp). Figgy does this from live QBO history.
- **Adopt:** an explainability line on each suggestion ("coded X because 14/14
  past bills used it") — Klarity/Truewind show reviewers *why*.
- **Adopt:** keep the **payment card/last-4** as a coding + dedup signal (Digits
  codes partly by which card paid; Figgy already captures it).
- **Avoid:** cross-client learning (Vic.ai) — violates isolation. Stay per-realm.

### B. Dedup
- Industry: exact match alone catches only ~30–40% of duplicates. Best tools add
  a **normalization layer** (strip dashes/spaces from invoice#, canonicalize
  vendor names, normalize dates) **then** fuzzy similarity (Infrrd, Ramp).
- **Adopt:** normalize before Figgy's exact + amount/date match. Cheap, high ROI.

### C. Human-in-the-loop review
- Confidence-routed queues + **color triage (green auto-eligible / yellow review
  / red mandatory)**; thresholds set by error cost (e.g. 95% coding, 99% pay).
- **Adopt:** confidence score + color on each Triage finding; keyboard/one-click
  clear (Ramp's 8%-flagged one-click confirm).
- **Keep:** never auto-post. The market's failures (Botkeeper, Booke) auto-posted.

### D. Client-query loop (Uncat is the benchmark)
- Uncat: syncs uncategorized txns out, **auto-notifies client email/SMS**,
  **magic-link (no password)**, client answers + uploads receipt, accountant
  reviews, **2-way syncs the answer back to QBO** (category/vendor/class/memo +
  receipt as attachment). Saves ~12 hrs / $238 per client per month vs email.
- Keeper batches questions then sends one notification; Docyt added **voice**
  categorization; Financial Cents/Client Hub auto-reminders.
- **Adopt for Figgy's `askClient`/`awaiting_client`:** magic-link replies;
  client sees a task list (dropdown account OR free-text + receipt), never the
  ledger; **batch silently, send ONE notification**, then auto-remind; write the
  cleared answer back **and** into Vendor Memory so it's never asked again.
- **Audit trail:** write the client's answer into the QBO transaction **memo**
  with a parseable prefix (Keeper uses `//Comment// [answer]`) so the *why* lives
  on the transaction permanently. [single-source]
- **Per-client auto-approve threshold:** confidence score per finding; below =
  human review, above = eligible for one-click clear (still never auto-posts —
  golden rule). Loosen the threshold for trusted clients, tighten for new ones.
- **Close the learning loop:** every client answer AND every Markie correction
  writes a `vendorMemory` rule — an answered question becomes future auto-coding.
- **#1 complaint to engineer around:** sync lag creating phantom/duplicate items.
  Clear an item the instant it's coded anywhere — and **realm-scoped**, given the
  Clark OS / Clark CW split.
- **Pitfalls:** clients ignore requests (→ low-friction magic link, SMS, batched
  single ping); per-question pinging (→ batch once); duplicate asks (→ dedupe by
  txn); lost context (→ memo write-back + tie to the receipt); don't make clients
  know your chart of accounts.

### E. Multi-tenant QBO connection layer (hard numbers, cross-verified)
- **OAuth:** Auth-Code flow; scope `com.intuit.quickbooks.accounting` only;
  `realmId` arrives on the **redirect**, not in the token — store it, never guess.
- **Tokens:** access = **1 hr**; refresh = **100-day rolling** but **rotates
  ~every 24 h** — the response returns a NEW refresh token and **expires the old
  one**. Must persist the rotated token in the same transaction every refresh, or
  next refresh = `invalid_grant` and the realm dies. Refresh proactively (~50
  min) + a **keep-alive** so quiet clients never cross 100 days. (Figgy's
  `qbo-router` already persists rotated tokens — keep that.)
- **Isolation:** token row per realm `(clientId, realmId, enc access, expiry, enc
  refresh, lastRotated, status)`; refresh independently so one dead token can't
  cascade; `realmId` in every URL is the boundary (matches `getConnectionForClient`).
- **Webhooks > polling:** ONE HTTPS callback per app, payloads tagged by realmId;
  validate `intuit-signature` = **HMAC-SHA256 of the raw body** keyed by the
  Webhook Verifier Token; return 200 fast, process async; back it with a periodic
  **CDC** sweep (`/cdc?entities=Bill,Vendor,Purchase&changedSince=…`). This is the
  durable fix for the Make ops-cost problem.
- **Rate limits:** **500 req/min** and **10 concurrent per realm** (429 =
  errorCode 003001); batch ≤ **30 ops**; retry 429 with the **same requestId**
  (idempotent). Serialize within a realm, parallelize across realms.
- **Security:** encrypt tokens at rest (KMS), secrets in a vault (not env-in-VCS),
  least-privilege scope, delete tokens on disconnect; Intuit requires a security
  review for production keys.

### F. Hosting / residency / backups
- **PIPEDA does NOT require Canadian residency**, but the firm stays **accountable
  for data on any processor**, must **disclose cross-border storage** to clients,
  sign a **DPA**, and **report breaches** (incl. a US host's breach) — fines up to
  **C$100k**. The US Patriot-Act exposure is why many financial clients
  contractually demand Canadian residency anyway.
- For a 28-client firm with **no dedicated ops/security team**, **managed hosting
  in a Canadian region (AWS `ca-central-1` / GCP Montreal) beats a self-hosted
  box.** Cost gap is only tens of $/mo; the real cost of self-hosting is the
  security labor (patching, TLS, firewall, DDoS, immutable tested backups) — and
  one exposed Postgres port = a reportable breach.
- **Move off SQLite to managed Postgres** for production multi-tenant financial
  data; **3-2-1-1-0** backups (encrypted, immutable/object-lock, tested restores).
- Self-host only with real ops expertise; if the only driver is residency, use a
  Canadian-region managed service instead of going unmanaged.

---

## PRIORITIZED "ADOPT NEXT" (tailored to the mandate)

**P0 — cheap, high-value, low-risk (bake into the brain/Triage now)**
1. **Dedup normalization layer** (invoice#/vendor/date) before exact+fuzzy match.
2. **Confidence score + color triage** (green/yellow/red) on each finding.
3. **Explainability line** on every suggestion ("X because N/N past bills").

**P1 — the connection layer (build to the verified QBO spec above)**
4. Native per-realm OAuth: realmId stored not guessed; rotate-and-persist refresh
   in one txn; keep-alive worker; `invalid_grant` → `needs_reauth` (no cascade).
5. Rate strategy: serialize-within-realm, 30-op batches, 429 retry same requestId.
6. Encrypt tokens at rest + secrets vault + least-privilege scope.

**P1 — client-query loop (Uncat-grade)**
7. Magic-link passwordless client replies; batched questions + auto-reminders;
   **2-way sync the answer back to QBO + into Vendor Memory** (never re-ask).

**P2 — durable cost + scale**
8. Webhooks + CDC sweep to retire Make polling (the ops-cost fix; Phase-4).
9. Managed Postgres in a Canadian region; 3-2-1-1-0 encrypted immutable backups;
   client cross-border disclosure + DPA if any US-region service remains.
10. Practice-mgmt polish: recurring job templates, capacity/workload view,
    owner+deadline+status on every task.

**AVOID**
- Auto-posting without review (killed Botkeeper; broke Booke's clients).
- Cross-client learning (Vic.ai) — violates isolation.
- Depending on per-client-priced SaaS (Uncat/Keeper $8–10/client × 28) — owning
  the stack is the whole point.
- Modular/add-on pricing complexity, rigid non-propagating templates, and any
  flow that forces email document-chasing (no portal).

---

## SOURCE CONFIDENCE
Cross-verified across vendor docs + G2/Capterra + engineering blogs + Intuit
developer snippets. Flagged where single-source. Verify before hard-coding:
Intuit's exact sandbox rate (≈100/min), webhook delivery frequency, CDC 30-day/
1000-object caps (Intuit's own pages 403 automated fetch — confirm via browser).
PIPEDA specifics corroborated via OPC + Barclay Damon + IAPP; not legal advice —
a short Canadian privacy-lawyer confirmation on residency is cheap insurance.
