# Figgy Junior — Architecture Review & Target Design

**Date:** 2026-06-11 · **For:** Markie Antle · **Author:** Code (design/IT review)

> Markie asked, as design+IT lead, to judge whether what we've built is the correct
> architecture — and if not, define what we fix and build. This is that judgement,
> grounded in the live system (Make scenarios, QBO tools, the Review Queue sheet).
>
> Companion (canonical) doc lives in the Figgy Junior Drive folder:
> "FIGGY JUNIOR — ARCHITECTURE REVIEW & TARGET DESIGN (2026-06-11)".

## The verdict

What's been built got **one** client (Alderson) posting correctly and proved the QBO
mechanics work. But it is **not** the right architecture to run 28 clients on. Every
symptom Markie named is a predictable consequence of **four structural choices** — not
isolated bugs. Recommendation: fix the foundation now (before onboarding more clients),
don't keep patching six posters.

## Symptoms → root causes

| What Markie feels | Actual root cause |
|---|---|
| "Picks chart of accounts out of its ass" | Account from a generic **category→account map**; vendor history never consulted. |
| "Posting duplicates" | Dedup is a **separate periodic sweep**, not a pre-post gate; no invoice# captured. |
| "No invoice numbers" | Extraction + Review Queue have **no invoice/doc-number field**. |
| "No account it's paid in / bill vs expense" | Everything posts as a **Cash Purchase through one 'Figgy Clearing'** account. |
| "Drops the receipt" | Receipt attach is a **fragile multi-branch** resolved at post time. |
| "Chunky, messy, breaks" | **N cloned scenarios per client** + QBO bodies hand-typed as **JSON strings** → "failed to parse json object". |

## The four structural problems

1. **JSON-by-string-interpolation in Make** — root of the parse crash; build the body structurally + pre-flight validate.
2. **Per-client cloned scenarios** — won't scale; move to **one parameterized pipeline + per-client config record**.
3. **Account by category map, not vendor history** — the coding brain is wrong (Part A).
4. **Thin capture + bolt-on dedup + sheet-as-database** — add structured capture, dedup as a gate, decide system-of-record.

Plus the new requirement: **Figgy must read the email itself** (e-transfer / "paid by…" / which card / instructions) and bank that per client.

## Target architecture (stages)

- **Ingest** — stage receipt to Drive first (single attach source); read the email body for payment method + instructions.
- **Extract** — vendor, **invoice#**, validated date, **subtotal/HST/total split**, payment method + account, **bill vs expense**.
- **Code it (Account-Selection Brain / Part A)** — resolve vendor→QBO record (flag if unsure); pull that vendor's QBO history → same account + tax rate; 0 history → flag; 2+ accounts → **always flag with ranked breakdown**; CoA locked; **live lookup + validated cache**; **same lookup does dedup**; update vendor card.
- **Review** — human gate stays; flags clear in one action; Sanity Guard stays on.
- **Post** — structured body, pre-flight validation, bill/card/cash paths (not one clearing account), locked HST method, attach from staged fileId.
- **Learn** — every cleared flag teaches Vendor Memory + Client Knowledge.

## Confirmed design decisions (Markie, 2026-06-11)

- Vendor matching: **resolve to QBO vendor record; flag if unsure**.
- Learned accounts: **live QBO lookup + validated cache**.
- Multi-account vendor: **always flag + ranked breakdown** (rule #5 confirmed).

## Phased plan (do not start until direction agreed)

0. **Align** (this doc) — agree target + open decisions; rollout stays frozen; no posting during rebuild.
1. **Capture** — invoice#, subtotal/HST/total, payment method+account, bill-vs-expense, email-body triage.
2. **Account brain (Part A)** — vendor-history lookup + flag/approve + integral dedup; category map → fallback hint.
3. **Robust poster** — one parameterized poster, structured body, pre-flight validation, bill/card paths; migrate clients one at a time (Alderson as control).
4. **Config-drive + retire clones** — collapse per-client scenarios to one pipeline + config records.
5. **Onboard next client** (Originality) on new rails; re-code the 16 OS caveat posts from history.

## Open decisions needed from Markie

- **D1 System of record** — keep Sheet as review surface + harden, or move state to a datastore? (Recommend: Sheet as surface, state/dedup keys in a datastore.)
- **D2 Rebuild vs patch** — authorize foundation rebuild, or only fix the OS parse-crash now? (Recommend: rebuild.)
- **D3 First build session** — start Phase 1 (capture + email triage, no posting) or Phase 2 (account brain)? (Recommend: Phase 1.)
- **D4 Payment accounts** — per client, the real cards/banks + their QBO account ids (needed for Part B).

## Golden rules carried forward

Nothing posts to QBO without Markie's review · CoA is locked (never invent an account) ·
Clark CW and Clark OS stay permanently separate · Verify every change against live QBO before
reporting done · Sanity Guard stays on and is never weakened.
