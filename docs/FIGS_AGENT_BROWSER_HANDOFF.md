# HANDOFF — Build "Figs", Markie's own AI agent browser

For a fresh build session. Goal: **Markie's own** AI agent browser — he types a prompt
("reconcile West York BMO for January", "post this receipt", "attach these docs") and it
does **reconciliations, postings, and document attachment** in QuickBooks Online. He
**owns it** — no third-party SaaS (no Make.com, no Claude-in-Chrome extension, no
per-client app). Self-hosted, on his infrastructure.

This doc is the source of truth. Read the referenced repo files; don't re-derive.

---

## 1. NON-NEGOTIABLE RULES (learned the hard way — a 2026-06-16 incident broke 6 client books)
These are *why*, not preferences. Violate them and you corrupt real books.
- **Human gate until earned.** Nothing posts or finishes a reconcile autonomously until
  that exact pattern is proven and trusted. Prove on ONE entry/month, watched, first.
- **NEVER guess or plug a number.** No fabricated amounts/balances/adjustments to force a
  match. The bank statement is authoritative; QBO is corrected to it, never the reverse.
  If it won't tie to the penny with real data → STOP and flag.
- **Chart of accounts is locked.** Never invent/guess an account id. Match the **real**
  account (e.g. card last-4 → the QBO account whose name carries that last-4). Never a
  clearing account.
- **Per-client isolation.** Every QBO call is scoped to one realm; never cross-pollinate.
- **No Figgy branding in client books.** Memo = receipt filename + Figgy # (Row ID) ONLY.
- **Verify every write** by reading it back from live QBO before calling it done.

## 2. THE THREE JOBS + exact rules
### A. Reconcile  (browser-driven — see hard truth #1)
Per month, oldest→newest, one at a time, never combined:
confirm beginning balance chains → enter the verified ending date + balance → match/clear
the statement's transactions → drive Difference to **$0 with real matches only** → attach
the statement PDF → Finish. Won't tie → STOP + flag the exact gap. Never plug.
(West York BMO 2025: all 12 ending balances already verified — see runbook below.)

### B. Post  (use the QBO API directly; no browser needed)
Decide by payment status:
- **Paid (card / cash / cheque) → Expense** (`Purchase`): `PaymentType` per method,
  `AccountRef` = the **real paying account matched by last-4** (e.g. Visa ·6231), never clearing.
- **Not paid → Bill** to Accounts Payable.
- Both: **payee always set** (`EntityRef`/`VendorRef` from the resolved vendor; no match →
  flag, don't post), `TxnDate`, `DocNumber` (invoice #), line `AccountRef` (coded), correct
  `TaxCodeRef` (HST/M&E), amount, description, **memo = receipt filename + Figgy #**.
- Exact request bodies + the vendor/account lookups: `docs/FIGGY_POSTER_REBUILD_SPEC.md`.

### C. Attach docs  (QBO API: `Attachable` upload)
Upload the receipt/invoice as an `Attachable` linked to the Bill/Purchase, then **read
back** to confirm it's present. Attach is mandatory; failure → flag, don't mark clean.

## 3. ARCHITECTURE — your own agent browser
- **Agent shell (you own it):** recommend a standalone **Playwright-driven Chromium** (or
  Electron app) you run — full automation control, persisted login. A custom MV3 **browser
  extension** is the alternative if you want it inside your normal browser, but extensions
  are sandboxed and harder to automate; the standalone agent-browser is more robust.
- **Prompt brain:** an LLM interprets your natural-language prompt → a plan of actions.
  Claude API or a local model — your call (the reconcile *matching* needs no model; it's
  deterministic code).
- **Data plane — native QBO OAuth 2.0** (your own Intuit developer app): read transactions,
  post Bills/Purchases, upload Attachables. Replaces Make entirely. Persist token refresh
  (QBO refresh token rotates ~24h — save the new one every refresh or you lose the realm).
- **Browser plane — Playwright** drives the QBO UI for the ONE thing with no API: the
  reconcile Finish. Persist auth (`storageState`) so login/MFA is done once and reused.
- **Memory / learning — Postgres** store + a **watch-and-learn loop**: capture your live
  decisions (vendor→account, card→account, which txns you clear, your corrections) into a
  growing **per-client rulebook**. It then proposes, you correct, it learns, and graduates
  to acting only on patterns it's proven. (Extension of the existing `vendorMemory`.)

## 4. BUILD ORDER (each phase independently useful + gated)
0. **QBO OAuth** working (read + write, token rotation persisted). Replaces Make.
1. **Agent shell + posting:** prompt → plan → post ONE entry via API (paid→Expense to the
   real card account, payee set, memo clean, receipt attached, read-back verified). Prove it.
2. **Reconcile:** Playwright drives one West York BMO month to $0 + Finish + attach, using
   the deterministic matcher + the verified balances. Prove it watched.
3. **Watch-and-learn memory:** capture your actions/corrections → per-client rulebook →
   agent proposes → you correct → it earns gated autonomy per pattern.

## 5. WHAT ALREADY EXISTS TO REUSE (don't rebuild)
- `api/reconcile-core.ts` — deterministic statement↔register matcher, **verified 8/8** on
  real West York data (never-plug, self-checks to the penny). `api/reconcile.ts` wraps it.
- `docs/WEST_YORK_RECONCILE_RUNBOOK.md` — all 12 BMO-2025 ending dates/balances (verified,
  chain ties), the per-month procedure, statement folder convention, OCR-CSV warning.
- `docs/FIGGY_POSTER_REBUILD_SPEC.md` — exact Bill/Purchase JSON, vendor + last-4 account
  lookups, tax codes, memo, verified attach, test gate.
- `docs/FIGS_SELF_HOSTED_ARCHITECTURE.md` + `docs/FIGS_RECONCILE_AGENT_SPEC.md`.
- The capture (Review Queue) 34-column map + `vendorMemory` (coding-from-history) — in
  `CLAUDE.md` (poster rebuild + key IDs sections).

## 6. HARD TRUTHS (verified — don't relitigate)
- **QBO has NO reconcile API.** The `cleared` status is read/filter only; there's no
  finish/lock endpoint. The established industry workaround is browser automation logging
  into QBO. So the reconcile Finish MUST be browser-driven. (Intuit dev community + multiple
  vendor writeups confirm; accountants have requested this API for years.)
- **Browser automation of QBO is finicky** — a prior extension attempt *timed out*. Build
  with explicit waits, retries, and **read the screen back after every action**. Persistent
  login avoids re-auth/MFA each run.
- **Posting and attaching DO have APIs** — do those via OAuth, not the browser. Only the
  reconcile Finish needs the browser.
- **Prereq for any reconcile:** the card's transactions must already be posted in QBO
  (bank feed/import). Empty register = nothing to reconcile, by any method.
- **The incident:** an ungated auto-poster on a 15-min timer posted to 6 client books as
  cash-expense-to-clearing, no payee, no attachment, stamped "Figgy Jr auto-post." Root
  cause + full detail in `CLAUDE.md`. The lesson is rule #1: never auto-commit to live
  books without a gate and a proven one-entry test.

## 7. FIRST TASK for the new session
Stand up Phase 0 (QBO OAuth, read+write, token rotation) and Phase 1 (prove ONE posting
end-to-end against Clark OS or West York using the poster spec). Then Phase 2 (one West
York BMO month reconciled + finished in-browser). Everything else builds on those.
