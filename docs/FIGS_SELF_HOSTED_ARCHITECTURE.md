# Figs — self-hosted reconciliation agent (your server, no apps)

Principle (Markie 2026-06-16): run it on **your own server**, no third-party apps —
**no Make.com, no browser extension, no per-client SaaS.** You own the whole stack.
Aligns with the competitive-research verdict already on file (native OAuth, self-host,
avoid SaaS dependency).

## Key insight: the reconcile bot needs NO AI model
The matching is deterministic math — already built + verified (`api/reconcile-core.ts`,
8/8 on the real West York statements). So the reconcile agent = **deterministic code +
browser automation**. Zero external API/model calls for the reconcile itself. (An LLM
is only relevant to the *other* Figgy job — reading documents / coding — and that's a
separate, optional piece: Claude API or a local model, your call.)

## Stack (all on your server)
1. **QBO data plane — native QuickBooks OAuth 2.0.** Register your own Intuit developer
   app; do per-realm OAuth (token refresh persisted; QBO refresh token rotates ~24h —
   persist the new one every refresh). Use it to read transactions and to write
   bills/expenses/attachments. This fully replaces the Make bridge.
2. **Reconcile plane — Playwright (headless Chromium) on your server.** QBO has **no
   reconcile API** (verified), so the Finish/clear/lock must be driven in the web UI.
   Playwright does that — your code, debuggable, no extension. Persist auth with
   `storageState` (log in + MFA once, reuse the session) so it doesn't re-auth each run.
3. **Logic — the deterministic matcher** (`reconcile-core.ts`): match statement ↔ QBO
   register, drive difference to $0 with real matches only, **stop + flag if it can't
   hit the verified ending balance to the penny** (never plug).
4. **Storage — Postgres** on your server (move off SQLite for prod).
5. **Orchestrator — one Node service** that per run: pulls the month's statement → reads
   the QBO register (OAuth) → runs the matcher → if it ties, drives Playwright to enter
   ending date/balance, clear the matched txns, attach the PDF, Finish → logs the result.

## Per-month flow (oldest first, one at a time)
Prereq check (transactions actually posted in QBO?) → confirm beginning balance chains →
match → tie to $0 with real matches → attach statement PDF → Finish. Any discrepancy or
UI failure (after retries) → STOP and flag, never force.

## Guardrails (non-negotiable)
- Never plug/force; statement is authoritative; QBO corrected to it.
- One account, one month at a time; read the screen back after every Playwright action
  (the prior extension attempt *timed out* — robust waits + retries + verify is the fix).
- Stop + report on any uncertainty; don't improvise on live books.

## Reliability notes (why this beats the extension)
- Playwright on your box = deterministic, scriptable, retryable, logged — vs a flaky
  extension you can't control. Add explicit waits for QBO's slow render; retry on timeout.
- OAuth for data = no scraping for the API-able parts; only the reconcile *Finish* needs
  the browser.

## Tradeoff (honest)
More upfront setup — you stand up the server, the Intuit app, Postgres, the service. In
return you kill every fragile dependency that's failed so far and own it end to end, with
no SaaS cost or ops cap. Prove it on ONE West York month before trusting it unattended.
