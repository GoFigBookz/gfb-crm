# FIGGY JR — GO-LIVE RUNBOOK (Clark OS + Clark CW, read-only)

How to turn on the live Account Brain so real coding suggestions land in the
Triage review queue. **Nothing here posts to QuickBooks** — every poster stays
OFF; the brain only READS vendor history and WRITES review cards you approve.

Do this on the **deployed CRM** (the box that serves the app + `data/crm.db`),
not in a dev session.

---

## 0. What you're turning on
- The brain reads Clark OS / Clark CW books live through your existing Make QBO
  tools (no new credentials, no OAuth yet).
- Each finding shows a 🟢/🟡/🔴 traffic light, a confidence %, and a plain
  "Why" line. Unknown vendors get a name/web-lookup hint (still review-gated).
- Isolation is guaranteed: each company has its own realm + scenario +
  connection; one can never read the other's books.

---

## 1. The bridge — ZERO setup (nothing to do)
The live QBO bridge now self-configures on startup (`api/bridge-bootstrap.ts`):
it adds the 3 bridge columns and binds Clark OS (realm 9341456017349963) and
Clark CW (realm 13633946244024404) to your EXISTING CRM clients (matched by city)
through **read-only Make webhook proxies** (scenarios 5359685 / 5359734, GET-only).
No Make token, no env vars, no commands. On the next deploy it's live. (Opt out
with `FIGGY_BRIDGE_DISABLE=on`.) Native per-realm OAuth replaces this later.

| Optional variable | Value | Why |
|---|---|---|
| `ANTHROPIC_API_KEY` | an Anthropic key | only powers the web lookup for unfamiliar vendors; everything else works without it |
| `FIGGY_WEB_CLASSIFY` | *(leave unset)* | web lookup is ON once a key is present; set `off` to disable |
| `AGENT_WEBHOOK_TOKEN` | finding-post token (default `figgy-webhook-2026`) | auth for writing findings |

---

## 2. Generate suggestions into Triage (read-only)
Make a small candidates file (one row per document you want coded), e.g.
`clarkos.json`:
```json
[
  { "vendorName": "Walker Aggregates", "invoiceNumber": "17890", "total": 1200.00, "txnDate": "2026-06-10", "rowId": "RQ-001" },
  { "vendorName": "Esso", "total": 88.40, "txnDate": "2026-06-09", "rowId": "RQ-002" }
]
```
Then run the brain over it (use the client id printed in step 3):
```sh
node --experimental-strip-types scripts/figgy-suggest-backlog.ts <clientId> clarkos.json
```
It prints each verdict (🟢/🟡/🔴) and writes a finding. **No QBO writes.**

---

## 5. Review in the app
Open **Figgy Jr → Triage → New**. Each card shows the traffic light, confidence,
and the "Why". Edit anything wrong, add a note to teach Figgy, then Approve,
Dismiss, or Ask the client. Approving a clean suggestion is how Figgy learns the
vendor for next time.

---

## Turn it off / roll back
- **Disable web lookup:** set `FIGGY_WEB_CLASSIFY=off` (name-based hints still work).
- **Disable a client's live reads:** set its `qbo_connections.isActive = 0`
  (the brain then reports "not connected" rather than guessing).
- **Nothing to undo in QBO** — the brain never wrote to it.

## Guardrails (unchanged)
- All Make posters/auto-approve clones stay OFF.
- Chart of accounts is locked; Figgy never invents an account.
- Clark OS and Clark CW remain permanently separate.
- 🟢 green = "matches this vendor's history", not "provably correct" — the human
  review gate is the backstop and stays on.
