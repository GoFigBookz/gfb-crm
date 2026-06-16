# Figs — Domain Expertise & Guardrail Ruleset

**Purpose.** Figs writes to real client books. This doc is the codified expertise it
must embody — QBO mechanics, senior-bookkeeper practice, Canadian (Ontario) tax, and
automation-safety — distilled into enforceable rules. Sourced from authoritative
research (Intuit developer/QBO docs, CRA/canada.ca, CPA Canada, PCAOB, and the
document-capture tool vendors). Every load-bearing claim is cited inline.

> Scope: HST-registered **Ontario corporations** (e.g. Clark OS / Clark CW). Jobs:
> (1) bank/credit-card **reconciliation**, (2) **posting** bills/expenses, (3) **attaching**
> source documents. Human reviews before anything commits.

---

## 0. The non-negotiable guardrails (enforce in code)

These are not preferences — each maps to a professional standard or a real failure mode.

1. **Human gate until earned.** Nothing posts or finishes a reconcile autonomously until
   that exact pattern is proven on ONE watched entry/month. The entire automation-safety
   literature converges on human-in-the-loop; full automation of tax/judgment/final
   posting *increases* audit risk. Dext/Hubdoc/Uncat/Keeper all keep a human at the
   publish/approve boundary; unattended auto-publish is an opt-in, per-supplier escalation.
2. **NEVER plug a number.** A "plug" — an unsupported adjustment that forces a balance —
   is recognized malpractice ("indicative of a dysfunctional finance and accounting
   system") and shades into fraud. When a reconcile won't tie, **investigate the real
   cause and STOP+flag**; never invent a balancing figure or auto-create an OBE /
   reconciliation-discrepancy adjustment to drive Difference to $0.
3. **Statement is authoritative.** The bank/credit-card statement is the source of truth;
   QBO is corrected to it, never the reverse.
4. **Chart of accounts is locked.** Never invent/guess an account. Match the **real**
   account (card last-4 → the QBO account carrying that last-4). Never post to a
   clearing/suspense/control account (A/P, Undeposited Funds, equity, "Figgy Clearing").
5. **Payee always set.** Resolve to a real QBO Vendor Id (`EntityRef`/`VendorRef`). No
   match → **flag, don't post**. Blank payee breaks A/P aging, vendor reporting, and
   history coding — one of the four documented defects of the old poster.
6. **Per-client isolation.** Every QBO call is scoped to one realm; never cross-pollinate.
7. **Source document mandatory + verified.** Every posted entry must have its receipt/
   invoice attached **and read back from QBO to confirm** — this is both the audit-trail
   standard and the CRA 6-year recordkeeping requirement. Attach fails → flag, don't mark clean.
8. **No client-book branding.** Memo (`PrivateNote`) = receipt filename + Figgy # (Row ID) ONLY.
9. **Verify every write** by reading it back from live QBO before calling it done.
10. **"Green" ≠ correct.** History-based coding repeats a *consistent* code, which GAAP's
    consistency principle does **not** prove correct — a systematic miscode passes a
    consistency check. The human review gate is the only backstop that catches it; always
    surface confidence + a plain-English rationale.

---

## 1. QBO reconciliation — how it really works, and why "Finish" is browser-only

- **The flow:** Settings ⚙ → Reconcile → pick account → enter the statement's **Ending
  balance** + **Ending date** → tick transactions that appear on the statement (the
  **Cleared balance** updates) → drive the **Difference** to **$0.00** → **Finish now → Done**,
  which saves a reconciliation report. [Intuit reconcile workflow](https://quickbooks.intuit.com/learn-support/en-us/help-article/reconciliation-reports/learn-reconcile-workflow-quickbooks/L8ZibUuVE_US_en_US)
- **Beginning balance chains** from the prior reconciliation's ending balance and is **not
  edited in the normal flow**. [Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/reconcile-account-quickbooks-online/L3XzsllsK_US_en_US)
- **Cleared (C) vs Reconciled (R):** C = matched/checked-off but not reconciled (bank-feed
  matches auto-mark C); R = part of a completed reconciliation and **disappears from the
  next reconcile screen** — that is the practical lock. [Intuit Community](https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/c-and-r-in-checking-accounts-plus-the-green-boxes-and-double/00/570158)
- **NO reconcile API.** The QBO Accounting API exposes cleared status as read/filter only
  (separate Reconciled/Cleared/Uncleared queries, not in bulk); there is **no endpoint to
  set the statement ending balance/date or perform/lock a reconciliation**. The established
  industry workaround is **browser automation of the QBO UI**. [Satva: reconciliation dates](https://satvasolutions.com/blog/how-to-reconcilie-in-quickbooks-online) · [Satva: reconciled txns API](https://satvasolutions.com/blog/reconciled-transactions-quickbooks-online-api)
  → **Figs can fully PREPARE a reconcile from the API (compute which posted txns clear,
  expected ending balance, missing/duplicate items, expected Difference) but the $0.00
  verification and Finish are UI-only — driven by a human or sanctioned UI automation.**
- **Prereq:** transactions must already be in the register (posted/bank-feed-matched).
  **Empty register = nothing to reconcile** — the poster/feed must populate it first.
  Match (links to existing record, no dup) vs Add (creates new); QBO matches on amount+date
  within 90 days before / 20 after. [Intuit: match](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-feeds/match-online-bank-transactions-quickbooks-online/L6qyw0PvP_US_en_US)
- **Beginning-balance breaks** when a prior reconciled (R) transaction is edited/deleted/
  un-reconciled, or the opening balance was wrong; the discrepancy report surfaces the
  offending edit. **Opening Balance Equity** is the offset for genuine opening-balance
  fixes — but an auto-generated OBE/"force adjustment" to make it balance is the forbidden
  plug. [Intuit: fix beginning balance](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/fix-issues-accounts-reconciled-past-quickbooks/L8lx6PQQ5_US_en_US) · [Intuit: adjusting entry](https://quickbooks.intuit.com/learn-support/en-us/help-article/statement-reconciliation/enter-adjusting-entry-reconciliation-quickbooks/L2m1jHhBS_US_en_US)

## 2. QBO posting — the entities, refs, and API hazards

- **Decision = timing of payment.** Unpaid obligation → **Bill** (posts to **Accounts
  Payable**, requires `VendorRef`, no PaymentType). Paid at purchase → **Expense/Check**,
  backed by the API **`Purchase`** entity. Pay a Bill later → separate **`BillPayment`**
  that clears A/P. **Intuit: pick ONE of {Bills+Payments} or {Expenses/Checks}; mixing
  double-counts the expense.** [Intuit: bills vs checks vs expenses](https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-payable/learn-difference-bills-checks-expenses-quickbooks/L0ZtL2TYI_US_en_US)
- **`Purchase` fields:** `PaymentType` ∈ {`Cash`,`Check`,`CreditCard`} (required); top-level
  **`AccountRef` = the real paying bank/CC account** (NEVER clearing); **`EntityRef`** =
  payee `{type:"Vendor", value}`; line `DetailType:"AccountBasedExpenseLineDetail"` →
  `AccountBasedExpenseLineDetail.AccountRef` = **expense/category** account (+ `TaxCodeRef`).
  **Two different AccountRefs — who paid vs what for — confusing them is a classic miscode.**
  [Intuit dev: Purchase](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/purchase)
- **`Bill` fields:** `VendorRef` (required); line `AccountBasedExpenseLineDetail.AccountRef`
  (required — omitting errors *"Required parameter Line.AccountBasedExpenseLineDetail.AccountRef
  is missing"*) + `TaxCodeRef`; `APAccountRef` defaults to A/P. [Intuit dev: Bill](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/bill) · [Ramp: required AccountRef error](https://support.ramp.com/hc/en-us/articles/37609739614355)
- **Attach (`Attachable`):** `POST /v3/company/<realmId>/upload`, `multipart/form-data` with
  `file_metadata_01` (JSON: `FileName`, `ContentType`, `AttachableRef.EntityRef` {type:
  `"Bill"`/`"Purchase"`, value: txn Id}) + `file_content_01` (binary). **Read back** by
  querying `Attachable` filtered on `AttachableRef.EntityRef` to confirm presence. [Intuit dev: Attachable](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/attachable)
- **`minorversion` ≥ 75 in production** (v1–74 retired 2025-08-01); pin it explicitly. [Satva: API guide](https://satvasolutions.com/blog/quickbooks-online-api-guide)
- **Idempotency / dedup:** without a unique **`requestid`**, a retried create makes a
  duplicate with a new Id; `DocNumber` collisions raise **Error 6140**. Query-before-create
  on normalized invoice#/RowID. [Intuit blog: API best practices](https://blogs.intuit.com/2018/09/10/quickbooks-online-api-best-practices/)
- **Updates are full-replace by default** (omitted fields are wiped); partial change needs
  `sparse:true` + `Id` + current **`SyncToken`** (optimistic locking). [Intuit dev: REST features](https://developer.intuit.com/app/developer/qbo/docs/learn/rest-api-features)
- **Undeposited Funds** is a built-in clearing account for *customer payments* that must net
  to zero; leaving balances in any clearing/suspense account causes duplication + a
  bank-balance mismatch (the incident's symptom). [Intuit: Undeposited Funds](https://quickbooks.intuit.com/learn-support/en-us/banking/undeposited-funds-account/00/1355886)

## 3. Senior-bookkeeper practice

- **Month-end close is a fixed-order checklist:** capture all source data → reconcile
  bank/CC/AP/AR → **clear suspense/clearing accounts to ZERO** → post accruals/adjustments →
  review GL for anomalies → approvals → **lock the period**. Same order every month so late
  changes don't force rework. [CPACharge close checklist](https://www.cpacharge.com/resources/templates/accounting-month-end-close-checklist-template/) · [Ramp: month-end close](https://ramp.com/blog/month-end-close-process)
- **Reconcile to the penny; never plug.** Legitimate adjusting entries have a *real,
  identified* cause (deposits in transit, outstanding cheques, bank charges/interest, NSF,
  a found posting error). A plug exists *only* to force a balance and is malpractice; the
  rare defensible "plug" is a write-off of a known **immaterial** difference, not a
  fabricated figure. [Plug (accounting)](https://en.wikipedia.org/wiki/Plug_(accounting)) · [Universal CPA: bank-rec adjustments](https://www.universalcpareview.com/ask-joey/what-are-the-types-of-adjustments-that-should-be-included-in-a-bank-reconciliation/)
- **Audit trail + source docs:** every entry must trace to a real receipt/invoice/statement,
  time-stamped and user-attributed. [Ramp: audit trails](https://ramp.com/blog/what-are-audit-trails) · [Artsyl](https://www.artsyltech.com/Audit-Trails-in-AP-AR)
- **Code by vendor history/consistency** (mainstream practice) — but GAAP **consistency**
  guarantees the *same* method, NOT a *correct* one; catching systematic miscoding needs
  additional review beyond the consistency check. Locked CoA is itself a control. [GAAP/eCapital](https://ecapital.com/financial-term/generally-accepted-accounting-principles-gaap/) · [PCAOB AU 420](https://pcaobus.org/oversight/standards/archived-standards/details/AU420B)
- **Flag, don't guess:** missing/unreadable receipt, uncategorized/incomplete, new/atypical
  vendor, or amount deviating from learned patterns → route to the approver. [Ramp: invoice discrepancies](https://ramp.com/blog/accounts-payable/invoice-discrepancies)
- **Dedup before posting:** verify invoice# isn't already present (compare invoice#, vendor,
  amount; normalize reformatted numbers). [Ramp: duplicate invoices](https://ramp.com/blog/accounts-payable/duplicate-invoices)
- **Segregation of duties substitute:** a one-person book can't separate authorize/receive/
  pay, so the **review gate + read-only suggestion engine + locked CoA + attached docs** are
  the compensating controls. [PLANERGY: SoD in AP](https://planergy.com/blog/segregation-of-duties-accounts-payable/)

## 4. Canadian (Ontario) accounting & tax

- **HST 13%** in Ontario (5% federal + 8% provincial). Registration mandatory once taxable
  revenue exceeds **$30,000** (one quarter or four consecutive). [CRA: which rate](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html) · [CRA: when to register](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html)
- **Collected vs ITCs are opposite sides:** Net tax = HST **collected (Line 105)** − **ITCs
  (Line 108)**. Split HST out of each purchase to the GST/HST-payable/ITC control account,
  not into the expense — the bookkeeping reason the capture tracks Subtotal/HST/Total. [CRA: ITCs](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html)
- **⚠ ITC documentary thresholds were RAISED to $100 / $500 effective 2021-04-20** (was
  $30/$150 — that old number is obsolete and must be corrected everywhere):
  - **< $100:** supplier name, date, total.
  - **$100–<$500:** + supplier **GST/HST registration # (BN)** + HST amount (or rate).
  - **≥ $500:** + **recipient's name** + description of supply + terms of payment.
  No BN on a ≥$100 receipt → ITC disallowable on audit; flag, don't claim blind. [CRA Memorandum 8-4](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/8-4/documentary-requirements-claiming-input-tax-credits.html) · [Tax & Trade Blog: threshold change](https://www.taxandtradelaw.com/Tax-Trade-Blog/changes-to-itc-information-requirements.html)
- **Meals & Entertainment = double 50%:** income-tax deduction limited to 50% (ITA s.67.1,
  Line 8523) **AND the HST ITC is also limited to 50%** (recaptured via ETA s.236(1)). Book
  the expense at 100% with an M&E tax code that recovers only half the HST. M&E lines must
  **not** use the ordinary HST code. [CRA: Line 8523](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/line-8523-meals-entertainment-allowable-part-only.html) · [CRA: calculate ITCs/methods](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit/calculate-methods.html)
- **Capital vs current:** enduring benefit / betterment / separate asset → **capital**
  (deducted over years via **CCA**, declining-balance, class-specific rates); operate/
  maintain/restore-to-original → **current** (full-year deduction). Miscoding a capital buy
  as current overstates the deduction — a common reassessment; flag equipment-purchase vs
  -rental. (HST ITC on a capital buy is still generally claimable in full up front.) [CRA: current vs capital](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/current-capital-expenses.html)
- **Accrual only:** corporations must use the accrual method (cash method unavailable);
  **ASPE** (CPA Handbook Part II) is the accrual-based default GAAP. The capture's
  **Bill-vs-Expense = paid-vs-unpaid** is precisely the accrual A/P decision. [Xero: cash vs accrual CA](https://www.xero.com/ca/guides/cash-vs-accrual-accounting/)
- **Tax-code buckets (pick the right one — they diverge on ITCs):** **taxable** (13%, ITCs
  yes) · **zero-rated** (0%, ITCs **yes**) · **exempt** (no tax, ITCs **no**) · **out-of-scope**
  (wages/dividends/owner transfers — **never on the GST/HST return**). Zero-rated and exempt
  both show "no tax" but are opposite for ITC recovery. [CRA RC4022](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022/general-information-gst-hst-registrants.html) · [PurposeCPA](https://www.purposecpa.ca/gst-hst-basics-out-of-scope-vs-exempt-vs-zero-rated/)
- **Recordkeeping: keep books + source documents 6 years** from the end of the last related
  tax year (longer if filed late or under objection/appeal); early destruction needs written
  CRA permission. This is the legal basis for mandatory, verified receipt attachment. [CRA: keeping records](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc188/keeping-records)

## 5. Automation safety — what the failures teach

- **Common auto-tool errors:** miscategorization of novel/mixed transactions, **duplicate
  entries** (receipt-app + bank-feed not matched), wrong tax code/payee, OCR misreads, and
  posting before review. Large-scale duplicates → stop the automation, professional cleanup. [booksla: AI pitfalls](https://www.booksla.com/the-5-biggest-pitfalls-of-ai-bookkeeping-and-how-to-avoid-them-real-case-studies/) · [dollarsandsense](https://dollarsandsense.net.au/ai-in-bookkeeping/)
- **Never auto-commit** tax treatment, audit-relevant classification, ambiguous/novel
  transactions, or final posting. Consensus model: AI does ~80–90% routine work; humans
  approve. [mbcconsultant](https://www.mbcconsultant.com/blog/bookkeeping-automation-2026-guide-to-ai-tools-benefits-cost) · [tfdtaxlawyer](https://www.tfdtaxlawyer.com/post/ai-in-tax-compliance-2026-how-automation-is-transforming-tax-strategy-risk-management)
- **How the pros gate review:** Dext/Hubdoc = capture → suggest coding from your history +
  per-supplier rules → **human publishes**; unattended auto-publish is opt-in per trusted
  supplier. Uncat = route the *question* to the client via magic link, write facts/receipt
  back, **bookkeeper still codes**. Keeper = ask client questions from the bank feed, sync
  edits back, uncategorized/file reviews before close. [Dext rules](https://help.dext.com/en/articles/416713-rules-and-automation-in-dext) · [Uncat/QBO](https://www.uncat.com/quickbooks) · [Keeper](https://docs.keeper.app/transaction-review-reports)
- **Reconciliation:** forcing incorrect matches is the headline danger; flag unmatched/
  timing items for investigation, never force-clear. Separate confident auto-matches from
  ambiguous ones; route ambiguous to a human **with suggested match + confidence score +
  the reason it didn't auto-clear**. [Ramp: auto bank rec](https://ramp.com/blog/automated-bank-reconciliation) · [Numeric](https://www.numeric.io/blog/bank-reconciliation-automation)
- **"Confident but wrong":** a tool that presents every output with equal confidence
  green-lights a consistent miscode; tools must flag low confidence and be traceable
  source-to-output (explainability ~2x audit productivity). [Trullion: AI accuracy](https://trullion.com/blog/ai-accuracy-for-accounting/)
- **Cautionary cases:** **Botkeeper** (auto-posting, ~$90M, 11 yrs) shut down Feb 2026 with
  reviews citing recurring GL errors needing accountant review; industry lesson = "amplify
  humans, not supplant them." **Booke.ai** = no confidence/exception transparency, all txns
  in one view needing one-by-one cleanup — the opposite of flag-and-triage. [CPA Practice Advisor: Botkeeper](https://www.cpapracticeadvisor.com/2026/02/09/botkeeper-is-closing-its-doors/177677/) · [Tabby: Botkeeper shutdown](https://www.usetabby.com/blog/botkeeper-shutdown-what-it-means-for-accounting-automation/)

---

## 6. Corrections to prior assumptions (carried over from the old Figgy model)

- **ITC thresholds are $100 / $500, not $30 / $150** (changed 2021-04-20). Any "needs
  supplier BN above $X" logic must use the new numbers.
- **canada.ca and developer.intuit.com return HTTP 403 to automated fetch.** Any "verify
  against the source" automation must use a browser-like client or cached/secondary CPA
  sources — a plain server fetch will fail.
- **Before wiring the live poster, confirm against the primary Intuit docs from an
  authenticated/browser context:** (a) exact `/upload` multipart part-naming, and (b) that
  `requestid` (query param) is the idempotency mechanism for the chosen minorversion.

## 7. What this means for the build (expertise → architecture)

- **Reconcile = deterministic prep (API) + browser Finish.** No model needed for matching;
  the matcher computes which posted txns clear and the expected Difference, STOPs+flags if
  it can't tie to the verified ending balance to the penny, and the Finish is human/UI-driven.
- **Post = API, decided by paid-vs-unpaid**, payee resolved, real paying account by last-4,
  correct tax code (incl. M&E double-50%), `minorversion≥75`, `requestid` idempotency,
  receipt attached + read back. Stays OFF / review-gated until proven on one entry.
- **Coding brain** suggests from vendor history with a **confidence + traffic-light + plain
  "why"**; new/ambiguous → low-confidence flag, never auto-post; "green" means *matches
  history*, not *proven correct*.
- **Every commit is human-gated, isolated per realm, and leaves an attached, read-back-
  verified audit trail** — the compensating controls a one-person book legally needs.
