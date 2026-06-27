# Figgy SaaS + Growth Engines — architecture / layout (2026-06-27)

Markie's brain-dump split into two very different risk classes. Plan first, build in phases.
Guiding principle (already a Figgy value): **strict module isolation** — firm/client data,
Markie's personal life, sellable-product tooling, and side-hustles each live in their own
walled lane and never entangle.

```
FIGGY (the platform)
├── 1. Firm CRM + AI agents        ← EXISTS (the cockpit + Fig/Sage/Wren/Liv/…)
├── 2. Figgy SaaS — financial tools ← NEW, high-stakes, accuracy-critical
│      ├── Cash Book   (micro-client bookkeeping)      ← BUILD FIRST (low risk, reuses rails)
│      ├── T1 returns  (personal, CRA AFR pull)        ← then this
│      └── T2 returns  (corporate, CRA cert filing)    ← hardest, last
├── 3. Skye Growth Engines          ← NEW, lower risk, mostly content/automation
│      ├── Business social cleanup  (set-and-forget, the firm)
│      ├── Reseller engine          (Rose + 700 frames + "sell your stuff")
│      └── Personal content channel (humor/hot-topics — PERSONAL, walled off)
└── 4. Phoenix Rising — personal OS  ← EXISTS (private)
```

---

## DOMAIN A — Skye's Growth Engines (start soon, lower risk)

### A1. Business social cleanup (light touch, "just works")
- **Goal:** a professional, set-and-forget presence for Go Fig Bookz.
- **Build:** Skye already has the content engine + cleanup playbook. Add a **standing content
  calendar** (auto-drafts a week of posts across the firm's pillars) + a **profile-cleanup
  checklist** per platform. Skye drafts; you approve a batch weekly.
- **Honest gap:** *auto-posting* needs the platform connections (your Business accounts +
  Meta/LinkedIn APIs, or a scheduler like Buffer/Metricool). Until then Skye drafts and you
  (or the scheduler) post. Drafting + calendar is buildable now.

### A2. Reseller engine ("let me sell your stuff" — Rose now, then 700 frames, then a side biz)
- **Goal:** turn accumulated inventory into cash; eventually a service.
- **Build:** an **inventory → AI-listing generator → multi-channel draft → sold/tracker** loop,
  on top of the existing Side Sales tracker (Phoenix Rising) + Skye's marketplace playbook.
  - Inventory item in → Skye drafts title/description/price/photos-needed for each channel
    (Marketplace, Kijiji, eBay, niche groups), tasteful + discreet where flagged.
  - Track listed → inquiries → sold → cash recovered vs floor price.
- **HONEST FLAG — Facebook Marketplace has NO official public listing API** (Meta removed it).
  "Automating" Marketplace = either (a) Skye drafts and **you paste/post** (zero risk), or
  (b) unofficial automation tools that **violate Meta ToS** (account-ban risk — not worth it).
  Recommendation: **draft-and-you-post** for Marketplace; real API automation only on channels
  that allow it (eBay has a real API; Shopify for a storefront).
- **Rose specifically:** start now — Skye drafts the listings + a clearance bundle plan; you
  post to Marketplace/groups. (Already has a task checklist on the board.)
- **Frames (700):** same engine; just inventory. Plain frames = fine to sell; if any are
  prescription/Rx, that's regulated — sell as frames-only.
- **"Side business" potential:** the same engine resells for OTHER people later — that's a real
  product, but prove it on your own stuff first.

### A3. Personal content / revenue channel (TikTok/YT/IG/FB — PERSONAL, walled off)
- **Goal:** light/sarcastic/dark-but-not-rude humor on hot topics; grow an audience; earn.
- **Build:** a **personal content engine** (separate brand, walled from the firm): trend radar
  (current hot topics) → hook/script generator in your voice → short-form script + shotlist →
  posting calendar. Skye drafts; **you film/voice + post** (and pick what's on-brand for *you*).
- **HONEST FLAGS:**
  - **Keep it 100% separate from Go Fig Bookz** — different accounts, never cross-linked. Dark
    humour + a bookkeeping brand don't mix; reputation risk if they touch.
  - **Monetization is real but slow** — creator funds + brand/affiliate need audience size first;
    don't expect fast income. Clickbait works for reach but burns trust; aim "irresistible hook,
    honest payoff," not bait-and-switch.
  - This is a **build-together, iterative** thing (your taste drives it) — not a set-and-forget.

---

## DOMAIN B — Figgy SaaS: the financial tools (high-stakes, build carefully)

This is potentially a real **product**, not just internal features. Accuracy + checks-and-balances
are non-negotiable (your words). Phase by risk: **Cash Book → T1 → T2.**

### B1. Cash Book — BUILD THIS FIRST (low risk, reuses everything, immediate value)
- **Goal:** lightweight bookkeeping for micro-clients (holding cos, ~30–40 txns/yr) who won't
  pay for QBO. Pull bank + CC statements → categorize → produce financials.
- **Why first:** it reuses rails **already built** — statement CSV import + the vendor-coding
  brain + reconcile + duplicate/stale finder. It's "QBO-lite" and needs **no CRA certification**
  (it's bookkeeping, not filing). Highest value-to-risk ratio by far.
- **Build:** a per-client cash-basis ledger: import statements → auto-code (brain) → review →
  trial balance → simple **Income Statement + Balance Sheet** → export. Checks: debits=credits,
  every txn coded, bank reconciles to statement, period locks.
- **Bonus:** the Cash Book feeds the T2 (its financials become the T2 inputs). Natural foundation.

### B2. T1 personal returns (CRA Auto-fill my return / AFR)
- **Goal:** build a T1 by pulling CRA data down (like TaxFreeway/AFR) + your inputs.
- **HONEST FLAG — this needs CRA authorization + certified software:**
  - **EFILE** registration (your EFILE number) to file electronically.
  - **Auto-fill my return (AFR)** access pulls slips (T4/T5/RRSP/etc.) — only through
    **CRA-certified software** connected via Represent a Client.
  - CRA **certifies T1 software annually** (you build to their specs, pass their test suite).
- **Effort:** medium-large + an annual recertification commitment. Doable, but it's a real
  product milestone, not a quick feature.

### B3. T2 corporate returns (CRA Corporation Internet Filing) — HARDEST, LAST
- **Goal:** generate a T2 from the financials, upload to CRA.
- **HONEST FLAG — this is the big one:**
  - CRA requires **certified T2 software** (CRA publishes the certified list each year). You build
    the full return (GIFI financials, schedules, CCA, etc.), then **pass CRA's annual
    certification** to get the upload code. This recurs every tax year.
  - The "code" you mentioned = CRA's **software certification / transmitter** credential, plus
    your own **EFILE/registration** as a preparer. **Two separate things — both must be verified.**
    "I think I might have this registered" → we need to confirm exactly what you hold before
    relying on it.
- **Effort:** large, ongoing. This is a genuine multi-quarter build + a permanent compliance
  obligation. Worth it IF you're adding T2 prep as a paid service at scale — but go in eyes-open:
  it's the most expensive, highest-liability piece, which is exactly why TaxCycle costs what it does.
- **Pragmatic interim:** Cash Book → clean GIFI-ready financials → **export for your existing T2
  software** until (and if) we commit to building + certifying our own filer. Captures most of the
  value (the data prep) without the certification mountain.

---

## Recommended phasing
1. **Now:** kick off **Rose reselling** (Skye drafts, you post) + the **reseller engine v1**
   (inventory → listing drafts → tracker). Low risk, you want the cash.
2. **Now/soon:** **business social** standing calendar + cleanup (light, set-and-forget).
3. **First real Figgy-SaaS build:** **Cash Book** — reuses what's built, no certification, real value.
4. **Then:** **T1** (after confirming EFILE/AFR path + budgeting for certification).
5. **Later, eyes-open:** **T2** filer — only if it's a committed paid service; until then, Cash
   Book → export to existing T2 software.
6. **Parallel, your-pace:** the **personal humor channel** — built together, iteratively.

## The two decisions that shape everything
- **Is Figgy SaaS for YOUR firm only, or a product you SELL to other bookkeepers?** (Internal tool
  vs multi-tenant SaaS is a fork in how Cash Book/T1/T2 are architected — build it right once.)
- **What CRA credentials do you actually hold today?** (EFILE #, RepID/Group, any software
  certification.) This gates T1/T2 — verify before we design around it.
