# Figgy — Deep Research Report & Verdict (2026-06-16)

Multi-stream, source-verified research into QBO automation and the 2026 AI-bookkeeping
landscape, scoped to Markie's profile: **non-developer, 25–75 QBO client files (growing),
keeps Hubdoc, wants auto-routine + human-review-exceptions (not full autonomy), pays for
tools that save time.** Conclusions follow the evidence, including where it contradicts
earlier plans.

---

## VERDICT (up front)
**Buy/configure a stack of proven per-client tools. Do NOT build a custom AI agent or
self-hosted pipeline.** For a non-developer at 25–75 clients, every piece you'd build
(capture, history-coding, review queue, client loop) already exists as a cheap, vendor-
maintained, review-gated product — and the parts you *can't* buy (reconciliation) can't
be automated by anyone because QBO has no API for them. Building re-creates fragile
versions of commodity tools and adds a maintenance burden you can't carry. The custom
"agent browser / self-hosted / autonomous poster" path is the highest-risk, lowest-ROI
option and is the documented failure pole.

**Recommended stack:** Hubdoc (keep — capture→QBO) **+** Double, ex-Keeper (firm review/
close + history-coding flags) **+** Uncat (client-question loop) **+** QBO native AI bank
feeds & rules (reconcile matching) **+** manual Finish in QBO. All review-gated, per-client
isolated, ~$30–40/client/mo, ~2:1 ROI vs labor, nothing to maintain.

---

## 1. QBO as an automation target — what's possible vs walls
- **API CAN:** full CRUD on Bills, Purchases/Expenses, Vendors, Accounts; attachments via
  `Attachable` (multipart upload, linked by EntityRef); SQL-like queries; batch ≤30 ops;
  CDC (30-day lookback, ≤1000 objects, no paging); webhooks (one URL/app, HMAC-SHA256).
  https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api
- **HARD WALLS:** **No reconciliation API** — cannot mark cleared/reconciled, cannot
  finish/lock a rec, cannot import a statement to reconcile; **bank-feed "For Review"
  queue is not in the API either.** So reconciliation is permanently human/native-UI, by
  any tool. https://help.developer.intuit.com/s/question/0D54R00006yaOKHSA2/
- **OAuth foot-gun:** refresh token rotates ~every 24h; miss persisting one rotation →
  silent disconnect. 500 req/min + 10 concurrent/realm. Sparse-vs-full update clobbers
  fields. https://help.developer.intuit.com/s/article/Handling-OAuth-token-expiration
- **Multi-client:** no "act across all my firm's clients" token — each client needs its
  own OAuth grant; per-realm isolation is enforced by realmId in the URL (the correct,
  idiomatic model). https://help.developer.intuit.com/s/question/0D5TR00001GmpUp0AJ/
- **Native (not API):** receipt capture (email-in `@assist.intuit.com`, extracts vendor/
  date/total/last-4, attaches, matches feed) and **AI bank feeds became default May 8 2026
  (~50% faster, AI category/match suggestions)** — but both are UI-only, not API-drivable.
  https://www.firmofthefuture.com/product-update/accountants-quickbooks-bank-feed-transition/

## 2. Autonomy: review-gated wins; auto-post is the failure pole
- Confidence-based "auto-handle high-confidence, route exceptions to a human" is the
  textbook industry pattern. https://zapier.com/blog/human-in-the-loop/ ;
  https://sloanreview.mit.edu/article/ai-explainability-how-to-avoid-rubber-stamping-recommendations/
- **The review-gated products** (Double/ex-Keeper, Uncat, Truewind, Puzzle) deliberately
  **do not auto-post** — human approves every entry. Cleanest reliability records.
- **The auto-post cohort is the cautionary tale:** **Botkeeper** (80%+ auto-coded, "98%
  accuracy") **shut down Feb 2026**, assets sold to Xendoo (https://www.accountingtoday.com/news/botkeeper-shuts-down);
  **Booke AI's** paid tier auto-posts and its Trustpilot reviews report "clients' books got
  messed up" and an unprompted ~100-transaction auto-reconcile "most done incorrectly"
  (https://www.trustpilot.com/review/booke.ai); **Docyt** auto-posts with confidence
  thresholds but has **no independent accuracy validation.** This is exactly your incident,
  as a product category.
- CPA liability + AICPA Rule 1.700 (confidentiality) give a hard professional basis for
  both the human gate and per-client isolation (no cross-client learning).
  https://viewpoint.pwc.com/dt/us/en/aicpav2/ps/ps/code_of_professional_conduct_revised/

## 3. The tool landscape — how they work + pricing (per client/mo unless noted)
- **Hubdoc** (~$12 standalone w/ QBO): email-in/auto-fetch capture, extract header, attach,
  push to QBO. OCR not 100%, bank feeds sometimes break, storage caps. Keep it for capture.
  https://www.gotofu.com/blog/best-hubdoc-alternatives
- **Dext** (~$17.70 Practice): broader capture incl. auto-fetch from inboxes/portals,
  learns categorization from corrections, 99.9%-claimed extraction, line items.
  https://www.g2.com/products/dext/pricing
- **AutoEntry by Sage** (credit-based; NOT Dext-owned): email/upload/mobile capture (no
  auto-fetch), "Remember" = per-supplier + per-line rules (your vendorMemory analog),
  publishes bill/expense to QBO with source PDF attached + dedup gate. OCR ~73–93%; one
  review even reports it *fabricating data to force a balanced transaction* — the exact
  "plug" failure your rules forbid. https://help.autoentry.com/en/articles/1312934-remember-function
- **Double (ex-Keeper, rebranded Oct 2025)** ($8–10): **firm-native** month-end close +
  review; flags miscoded/no-payee/uncategorized vs prior-year history; **does not auto-post
  — human approves; edits sync back to QBO.** This is the bought version of "an AI agent
  that reviews and posts on my approval, using history." https://keeper.app/blog/best-bookkeeping-practice-management-software/
- **Uncat** ($9): client magic-link loop for uncategorized txns; accountant codes, syncs
  back. Your `//Comment//` client-loop, as a product. https://www.uncat.com/
- **Docyt** ($299–999/mo **per location**): autonomous engine (auto-post). 5–10× the cost
  of the review stack; auto-post cohort; no independent accuracy proof.

## 4. Build-side reality (why building is the wrong call for a non-dev)
- **Extraction:** cloud parsers (AWS Textract / Azure ~$0.01/page, Google ~$0.10) give
  per-field confidence but you still build+host the pipeline. Multimodal LLMs are cheap
  (~1–2¢) and flexible **but hallucinate numbers and give no native confidence** — the
  literal "plug a number" risk — so they need engineered verification fences (sum checks,
  read-back). Open-source OCR needs an ML engineer. **None is hands-off; line-item
  extraction is the universal weak point.** (Document-AI stream, multiple sources.)
- **Orchestration:** Make.com/OpenAI is what's been breaking you (module + model
  retirements). Self-hosting (n8n/custom) removes the vendor but makes *you* the sysadmin —
  worse for a non-dev. Your own notes already concluded "managed > self-host, no ops team."
- **Reconcile automation:** no API → browser automation (Playwright/computer-use), which is
  the flakiest layer (the prior Chrome attempt timed out) and needs constant upkeep.
- **Net:** a custom build means owning extraction + verification + orchestration + OAuth
  rotation + RPA + per-realm scaling — an engineering product, maintained by a non-developer.
  That is precisely the "keeps breaking" you're trying to escape.

## 5. Cost math at your scale (the honest trade-off)
- Per-client tools scale linearly: a capture+review stack ≈ **$30–43/client/mo all-in**
  (Hubdoc ~$12 + Double ~$8–10 + Uncat $9). 25→~$900, 50→~$1,800, 75→~$2,600/mo.
- Offset: automation saves ~**1 hr/client/mo** of review (Keeper/BSFS case) ≈ ~$75/client
  recovered at $75/hr → ~**2:1 ROI** if the time saved is real. (Docyt-class full-AI is
  5–10× and the scaling trap.) https://keeper.app/customer-stories/
- Building trades the per-client SaaS tax for fixed infra **plus** a maintenance burden you
  can't staff — the saved SaaS dollars get eaten by your own time fixing breakage.

## 6. Isolation / confidentiality (a constraint, not a preference)
- realmId-in-the-URL enforces per-company isolation; per-realm tokens + rate buckets are
  required. AICPA Rule 1.700 + "AI input = disclosure" + "self-learning models retain
  inputs" make cross-client learning a professional-standards violation, not just a design
  choice. Per-client isolated "AI brains" are now a *marketed* feature (Booke) — the market
  converged on your rule. https://help.developer.intuit.com/s/question/0D5G000004Dk7VIKAZ/

---

## 7. The full 2026 competitor landscape (the "AI agent that reviews/posts" already exists — to buy)
The market split into two autonomy camps; the review-gated camp has the clean record:
- **Auto-post (above a confidence threshold):** Vic.ai ("post any invoice ≥95% confidence"),
  Pilot AI Accountant (Feb 2026, "zero human intervention," human only on material judgment),
  Ramp Accounting Agent (auto-code, surface exceptions), Digits (auto-books ~95% to its own
  ledger), Docyt (auto-categorize/sync, human gate opt-in). **Reality vs marketing:** one
  real firm ran Vic.ai at **38% no-touch vs the 97% marketing**; Digits' top complaint is
  "black box / silent compounding errors." https://www.vic.ai/frequently-asked-questions ;
  https://www.accountingtoday.com/news/pilot-launches-fully-autonomous-ai-bookkeeper
- **Autonomous-then-review (the safe camp, your camp):** **Basis** — firm-focused agentic
  "junior accountant," runs for hours then delivers **finished work for human review** with
  full explainability; **$100M Series B at $1.15B (Feb 2026), used by ~30% of top-25 US
  firms**, syncs with QBO. This is the closest large competitor to what you described
  ("an AI that reviews and posts on my approval") — and it's review-gated, not autonomous.
  https://finance.yahoo.com/news/basis-raises-100m-1-15b-150000934.html
- **Intuit's own admission (the tell):** even Intuit — most categorization data on earth —
  "improved accuracy 20 points and still got complaints," so it keeps a **human review/approve
  gate + shows the AI's reasoning.** "Trust lost in buckets, earned back in spoonfuls."
  https://venturebeat.com/ai/intuit-learned-to-build-ai-agents-for-finance-the-hard-way-trust-lost-in
- **The graveyard:** Botkeeper (auto-post, ~$90M raised, **dead Feb 2026**); Bench (closed
  platform, 12,000+ clients stranded Dec 2024 — its books weren't even in QBO); Booke
  ("clients' books got messed up"); Finally (heavily funded, FTC/BBB complaints of
  "catastrophically mismanaged books"). Funding ≠ reliable books.

## 8. Build-side reality (why you, a non-developer, must not build it)
- **Agent frameworks:** the vendor-recommended path is *plain API + a while-loop*, not
  LangChain (whose abstraction value "has eroded"). Frameworks add churning dependencies and
  hide what's happening. https://www.anthropic.com/research/building-effective-agents
- **Structured output hallucinates the exact thing your rules forbid:** when a *required*
  field has no source value, the LLM **invents one** ("a confident lie in valid JSON") — that
  is the literal mechanism of "plugging a number." Mitigation requires engineered nullable
  fields + source/QBO verification on every figure.
  https://tianpan.co/blog/2026-04-20-structured-output-reliability-production
- **Model-deprecation churn is a forced, recurring migration:** Anthropic retires models
  ~every few months (Sonnet/Opus 4 retired June 15 2026; ≥60-day notice); OpenAI gave ~2
  weeks and 404'd GPT-4o in Feb 2026. Each swap is "a micro-migration project, not a config
  change" — re-testing you'd owe indefinitely, as a non-dev.
  https://platform.claude.com/docs/en/about-claude/model-deprecations
- **Browser/RPA for the reconcile gap is the worst option:** QBO **redesigned its UI Aug 2025
  with no rollback** (selectors break on Intuit's schedule), and login is walled by
  **mandatory 2FA + reCAPTCHA** (unattended re-auth is effectively impossible). Computer-use
  agents hit ~50–60% on flaky multi-step UIs and ship with "supervise it, don't give it real
  credentials." https://quickbooks.intuit.com/global/resources/product-update/quickbooks-new-interface-updates-faqs/
- **Net:** a non-dev custom build = owning extraction + hallucination-fencing + orchestration
  + OAuth rotation + RPA + per-realm scaling + a model-migration treadmill. That is the
  "keeps breaking" machine, by construction.
- **Capture/coding you'd build already exists cheap with real APIs:** **Datamolino** (~£39/mo
  unlimited companies) does supplier-default + keyword + learned coding, attaches the doc in
  QBO, and has a **public OAuth2 API** — the closest architectural cousin to your coding brain,
  for sale. (Note: **Hubdoc can't learn vendor→account** — "every receipt needs manual coding
  even after 50 buys from the same vendor" — so if you keep Hubdoc, the coding brain has to
  come from Double/Datamolino, not Hubdoc.) https://www.datamolino.com/quickbooks-integration/

## The recommended stack (bought/configured, not built)
**Constraint (Markie 2026-06-16): keep Hubdoc, add NO new apps, don't build a fragile
custom agent.** The minimal stack that satisfies all of it:
1. **Capture → Hubdoc** (already have it). Extract + attach + push the bill/expense into
   each client's QBO. Done — no change.
2. **Auto-routine categorization → QBO's own bank rules + AI bank feeds** (free, built-in,
   2026 default). Set a bank rule per recurring vendor once → that vendor auto-codes every
   time ("auto routine"); the AI feed suggests categories from your history for the rest.
   This is the "AI that learns per client" — it's *Intuit's* AI, maintained by Intuit, no
   app and no build. (NB: the part of QBO you disliked is the receipt-capture UI; Hubdoc
   handles that. The bank-feed/rules engine is the good, fast part.)
3. **Exceptions + posting → you, in QBO** ("I do exceptions"). Review what Hubdoc created
   and what the feed flags; approve/correct. Per-client isolation is automatic (separate
   QBO files). Nothing auto-posts.
4. **Reconcile → QBO bank feeds + manual Finish**, using the verified statement balances
   already compiled. No browser bot.
5. **Your CRM (Triage/brain) → optional, light, read-only helper at most.** Keep it only if
   it earns its keep as a suggestion aid; do NOT expand it into an autonomous poster/pipeline
   (that's the maintenance treadmill the research warns against, and what broke 6 books).
6. **Retire all the fragile custom pieces** — the Make auto-poster, auto-approves, the
   agent-browser/self-host plans. They are the "keeps breaking" machine.

**Honest note on "my own AI agent that reviews & posts and learns":** the research is clear
that, for a non-developer, *building* that is the fragile path, and *buying* the best version
(Basis/Double/Datamolino) means adding an app you've ruled out. So within your constraints
the realistic "AI that reviews/learns" is **QBO's own bank-feed AI + rules** (free, no app,
no build, maintained) with **you as the reviewer** — not a custom agent. That keeps it from
breaking, which is the whole goal.

## What to stop (evidence-backed)
- Custom AI agent browser, self-hosted server, autonomous poster, and the Make+OpenAI
  intake pipeline — all are the high-maintenance/high-risk paths the research indicts for a
  non-developer firm. Hand the breakable commodity work to maintained vendors; keep only the
  human review that's your professional value-add.

## Method / caveats
7 verified research streams (QBO API, HITL+isolation, cost models, Booke/Truewind/Botkeeper,
AutoEntry mechanics, Docyt/Double/Uncat, Document-AI/OCR) plus direct searches. Many vendor/
Intuit pages 403'd direct fetch; claims rest on search-indexed reads of those same pages +
reachable press, tagged by confidence in the streams. Re-verify live SaaS prices before
committing (several rose in 2025). A few deeper sub-streams (Dext mechanics detail, Digits/
Puzzle/Pilot/Finally, RPA frameworks, firm-stack writeups) were still resolving at synthesis
time but do not change the verdict — they reinforce the same review-gated, buy-don't-build
conclusion.
