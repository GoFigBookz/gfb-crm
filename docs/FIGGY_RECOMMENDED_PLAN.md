# Figgy — the recommended plan (researched 2026-06-16), supersedes the agent-browser idea

Written after actually researching what QBO does natively in 2026 vs. what's being
custom-built. Goal = Markie's real needs: reliable, owned, cheap, less of his time,
learns per client, and **stops breaking**.

## The hard verdict
You've been **custom-building (and constantly repairing) fragile versions of things
QuickBooks now does natively, for free, and maintains itself.** That's the root of
"it keeps breaking." The fix isn't a bigger custom build (agent browser, self-hosted
server, autonomous poster) — it's the opposite: **lean on QBO's maintained rails for
the commodity 80%, and own only the thin slice that's actually your IP.**

## What the research changed (facts, not assertions)
- **QBO has native receipt capture on every plan** (Simple Start→Advanced): email or
  snap a receipt to a QBO address → it **extracts vendor, date, amount, and the card
  last-4, attaches the document, creates a reviewable expense, and matches it to the
  bank feed.** Free, Intuit-maintained. (Intuit help: email receipts / upload receipts.)
  → This is most of what the Make+OpenAI intake pipeline does by hand.
- **Hubdoc is NOT a QBO option** — it's a Xero product now. (So that's off the table.)
- **QBO bank feeds + Rules + AI auto-match** became the default in May 2026, ~50%
  faster — most reconciliation *matching* is now automatic; only the final Finish is
  manual-in-UI. → No browser bot needed to reconcile.
- **QBO still has NO reconcile API** (confirmed) and **capture tools still don't do
  firm-grade account-coding from a vendor's history** — that coding brain is the part
  that's genuinely yours to own.

## Build vs. buy — the split
| Job | Best source | Why |
|---|---|---|
| Capture: extract vendor/date/amount/last-4, attach doc, create reviewable expense, match feed | **QBO native (free)** | Intuit maintains it; won't break on Make/OpenAI churn; per-client QBO file = automatic isolation |
| Recurring categorization | **QBO bank-feed Rules** | Built-in, free |
| Reconcile matching | **QBO AI bank feeds** | Default 2026, fast; Finish is a quick manual step |
| **Account-coding from vendor history + HST/M&E nuance + firm-wide review queue** | **OWN this (thin layer)** | The real differentiator; small + stable; "learns per client" lives here (vendorMemory, already built) |
| Posting/attaching beyond native | **Native QBO OAuth API** (Bill/Purchase/Attachable) | API-backed, reliable; only if native capture isn't enough |

## What to STOP doing (my honest disagreement with the current direction)
- **Don't build a custom AI agent browser.** Browser automation of QBO is the flakiest
  possible layer; it would become the next thing that breaks, and only you could fix it.
- **Don't self-host a server.** Your own competitive notes already concluded "managed >
  self-host (no ops team)." Cutting Make ≠ becoming your own sysadmin. Use managed hosting.
- **Don't rebuild QBO's native capture in Make+OpenAI.** That's the churn treadmill
  (every model/module retirement breaks you). Let Intuit own that plumbing.
- **Don't chase autonomous posting.** It broke six books. Human gate stays.

## The recommended build (smallest reliable system that meets the need)
1. **Capture → switch to QBO native.** Each client forwards/snaps receipts to *their*
   QBO receipt email (or connects the bank feed). QBO extracts + attaches + creates the
   reviewable expense and matches the feed. Retire the Make Gmail/Drive intake pipeline
   (it's the part that keeps breaking and Intuit now does it free).
2. **Own the coding brain + firm review layer** (this is your CRM, ~built): a thin
   service on **native QBO OAuth** that, per client, reads the captured/feed items,
   applies **account-coding from vendor history** (vendorMemory) + HST/M&E rules, and
   surfaces *one cross-client review queue* (Triage) where you approve. On approve it
   sets the coding via the API. This is the differentiator and the only thing worth
   maintaining.
3. **Posting:** prefer reviewing/approving QBO's native-created expenses (receipt already
   attached). For anything programmatic, post Bill/Purchase via the OAuth API, gated,
   per the corrected rules (paid→Expense to real account / unpaid→Bill, payee set, clean
   memo, attach) — but only where native doesn't cover it. No auto-poster, no clearing acct.
4. **Reconcile:** connect bank feeds + set Rules; QBO auto-matches; you Finish in-UI
   (minutes/account, with the verified balances already compiled). No browser agent.
5. **Hosting:** managed (the CRM is already deployable that way) + managed Postgres +
   your own Intuit OAuth app. Own the connection and the data; don't own the box.

## Why this is the best fit for the stated needs
- **Stops breaking:** the breakable commodity parts become Intuit's maintained features,
  not your Make/OpenAI pipeline. Far less surface area to fail.
- **Cheaper + less time:** you stop paying Make ops + maintaining clones; native capture
  is free; you maintain one thin coding layer instead of a sprawling pipeline.
- **Owned where it matters:** you own the coding intelligence + review (your IP) and the
  QBO connection + data — not a fragile server/agent.
- **Learns per client:** vendorMemory keeps doing exactly that, on stable rails.
- **Isolation by construction:** per-client QBO files can't cross-pollinate.

## Honest caveats
- QBO native capture is per-company; a firm-wide "all clients in one queue" view is the
  thing you build (small). If native extraction/coding proves too basic for some clients,
  a paid capture tool (e.g. Dext) is the buy option for *that layer* — still don't build it.
- This means retiring most of the Make build. That's the point: less to break.
