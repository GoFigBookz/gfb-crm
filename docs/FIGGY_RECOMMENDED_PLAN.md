# Figgy — the recommended plan (researched 2026-06-16, rev. 2)

Researched, not asserted. Corrects an earlier error (Hubdoc DOES work with QBO — it
was wrongly called Xero-only). Goal = Markie's real needs: reliable, owned, cheap,
less of his time, learns per client, and **stops breaking**.

## The architecture (recommended)
**Hubdoc (capture) → QuickBooks Online → your AI agent (review + smart coding + learn → gated post)**

- **Hubdoc = capture.** Snap/email/auto-fetch receipts, bills, statements; extract
  vendor/amount/invoice#/date; attach the source doc; **publish into QBO**. Keep it —
  it's better than QBO native (which is slow/clunky), it's maintained by Xero (so no
  Make/OpenAI model-churn on your side), and it works with QBO (confirmed). Hubdoc has
  **no public API** — you don't need one (see below).
- **QuickBooks Online = the integration point.** Hubdoc lands the coded transaction +
  attachment in QBO, and QBO has a full API. So your agent works *downstream in QBO*,
  never talking to Hubdoc directly. This is why "no Hubdoc API" doesn't matter.
- **Your AI agent = the differentiator (the only thing worth building/owning).** On
  native QBO OAuth, it reads what Hubdoc created, then:
  - re-codes the account from the vendor's **history** (vendorMemory — already built),
  - applies HST/M&E nuance + bill-vs-expense + payment-account-by-last-4,
  - surfaces ONE firm-wide review queue (your CRM Triage) across all client files,
  - **learns from your corrections** ("trains" per client),
  - finalizes/posts via the QBO API **on your approval** (or batch-approve a vendor
    pattern it has earned). Human gate stays — autonomous posting is what broke 6 books.

## Why this fits the needs
- **Stops breaking:** Hubdoc owns the fragile OCR/capture (maintained by Xero, no model
  churn); your agent runs on the stable QBO API. The Make+OpenAI intake pipeline — the
  thing that keeps breaking on every model/module retirement — gets **retired.**
- **Cheaper + less time:** Hubdoc ~$12/mo per business; you stop paying Make ops and
  stop maintaining per-client clones. One agent, one review queue.
- **Owned where it matters:** you own the coding brain + review + learning (your IP) and
  the QBO connection/data. You don't own fragile OCR or a browser bot.
- **Learns per client:** vendorMemory + learning from corrections, on stable rails.
- **Isolation by construction:** per-client QBO files can't cross-pollinate.

## Hubdoc's known gaps (why the agent layer is justified, not redundant)
Reviews report OCR accuracy issues, missing line items, an outdated UI, and bank feeds
that sometimes break + storage limits. "OCR should not be relied upon 100% — review
before publishing." → Your agent's review + history-based coding is exactly that missing
layer. Hubdoc captures; your agent makes it correct.

## Reconciliation
No QBO reconcile API (confirmed). Use QBO **bank feeds + Rules + AI auto-match** (default
2026, ~50% faster) — most matching is automatic; the Finish is a quick manual step (with
the verified balances already compiled). **No browser bot, no agent-browser.**

## Hosting / ownership
Managed hosting (the CRM already deploys that way) + managed Postgres + your own Intuit
OAuth app. Own the connection and data; don't run your own server (your own notes:
"managed > self-host, no ops team").

## What to STOP (honest disagreement with earlier directions)
- No custom **AI agent browser** — flakiest possible layer; would be the next thing to break.
- No **self-hosted server** — cutting Make ≠ becoming your own sysadmin.
- No **rebuilding capture in Make+OpenAI** — that's the churn treadmill; Hubdoc owns it.
- No **autonomous posting** — it broke six books; keep the human gate / earned autonomy.

## Build order
1. **Native QBO OAuth** (your Intuit app; per-realm token rotation persisted). Kills Make.
2. **Agent reads Hubdoc-published QBO transactions** → re-codes from vendorMemory → ONE
   review queue (Triage). Prove the coding/review on one client.
3. **Gated finalize/post** via QBO API (corrected rules: paid→Expense to real account /
   unpaid→Bill, payee set, memo = receipt+Figgy#, attach). Prove on one entry.
4. **Learning loop:** capture your corrections → improve per-client coding → earn batch
   auto-approve on proven vendor patterns.
5. Connect **bank feeds + Rules**; reconcile via QBO with verified balances.
