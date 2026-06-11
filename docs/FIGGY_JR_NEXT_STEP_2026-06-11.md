# FIGGY JR — NEXT-STEP RECOMMENDATION (2026-06-11)

Owner: Markie Antle (markie@gofig.ca). Author: Code (design/IT lead).
Companion to: handoff doc `1OFpQ7zZaQm-HWczEqWyreSXaYNlv6SQUtEaCYOlLG_o` and
architecture review `1JPJ62gO5ZVeCMmOUiTqLsWvk0HuTW_GI_o0oWhvdtFU`.

Mandate this is judged against: **work smarter not harder — less of Markie's
time, less money, accurate books on cheap autopilot, an AI that learns & grows
per client. Build ONCE on consolidated rails — never per-client clones.**

---

## THE RECOMMENDATION (one line)

**Build the Account-Selection Brain next** — one reusable, *read-only* enrich
step (vendor-history coding + integral dedup), validated live, surfaced in the
CRM review. **Not** webhooks, **not** config-drive, **not** the poster rebuild
yet. Nothing posts; all posters stay OFF.

---

## WHY THIS, WHY NOW (the expert reasoning)

**1. It is the keystone — everything else is built *around* it.**
You must nail the ONE correct coding + dedup logic *before* you parameterize it
(config-drive, Phase 4) or rebuild the poster (Phase 3). Build the pipeline
scaffolding first and you wrap it around logic you're about to replace — that's
building it twice, the exact "chunky, breaks, fix it 6×" pain we're escaping.
The architecture review already ordered brain (P2) **before** config-drive (P4)
for this reason.

**2. It fixes the #1 and #2 symptoms Markie named** — "picks chart of accounts
out of its ass" and "posts duplicates." Those cause *errors → rework → Markie's
time*. This step is literally the "enters the data and learns as it goes"
asset. Highest value-per-build of anything queued.

**3. Risk is zero.** It is a READ/enrich step. Nothing posts. All posters stay
OFF, Sanity Guard stays on. Safe to build and test against live QBO today.

**4. Cost is not ripe — don't rebuild on a guess.** The handoff says watch the
ops counter 24h for the *true steady-state* after this session's testing +
email-backlog spike. Interval-widening already removed ~10k idle ops/mo. The
durable cost fix (webhook/instant triggers) belongs to Phase 4, where we retire
the clones anyway — fold the trigger change into that ONE rebuild so we never
touch triggers twice. Deciding webhooks now, before steady-state data, risks
throwaway work.

### Live proof of the thesis (read-only, Clark OS QBO, 2026-06-11)
- Vendor resolve works live: `Walker Aggregates` → QBO Vendor **Id 653**.
- Miscode account is real: **`1150040016` = "Parts/Goods COGS"** (a spa/pool
  *parts* COGS account). An **aggregates** supplier's bill was coded there by
  the generic category→account map. The brain reads vendor 653's *own history*
  and codes to the account it actually uses — instead of guessing.

---

## THE FIRST BUILD — Account-Selection Brain v1

Build it as ONE Make sub-scenario "tool" (mirrors the existing per-realm QBO API
tools, e.g. Clark OS `5347484`). Reusable across all clients from day one.

**Input:** client (realm/QBO tool), vendorNameRaw, invoice#, total, txnDate,
last4 (payment account, if captured).

**Logic:**
1. **Resolve vendor** → exact QBO Vendor (normalized name / `LIKE`). 0 matches
   or ambiguous → **FLAG** (never guess; card feeds mislabel vendors).
2. **Pull that vendor's prior transactions** in *that client's* QBO → distinct
   `AccountRef` + `TaxCodeRef`.
   - 1 account in history → suggest it + its tax rate.
   - 0 history → **FLAG** (Markie types the acct #, or approves a suggested new
     EXPENSE/COGS account before creation).
   - 2+ accounts → **ALWAYS FLAG** with a ranked breakdown (frequency +
     most-recent + amounts) for one-click pick.
3. **Dedup = the same lookup** (rule #9): invoice# + vendor + total + date vs
   QBO (search the last-4 payment account first) AND the Review Queue → dup →
   **HOLD, don't post**.

**Output:** `{ vendorId, suggestedAccountId, suggestedTaxCode, flagReason,
dedupVerdict, history[] }` → written to Review Queue + projected into the CRM
Triage finding so Markie clears it in one action. CoA is LOCKED — never invent.

**Learn (write-back — Markie's explicit requirement):** on a confirmed
resolution, **update the QBO Vendor card itself** — preferred
account/category/tax + name / address / email / phone — so Figgy learns once and
**stops re-asking**. Two tiers of memory:
1. **QBO Vendor card** = source of truth, updated on confirmation (write-back).
2. **Vendor Memory** (Sheet) = fast cache of resolved vendor → account/tax,
   always re-validated against live QBO.

Write-back is gated like everything else: the card is written only **after**
Markie clears/confirms the resolution in review — consistent with "nothing to
QBO without my review." Every cleared flag teaches both tiers; next time is
automatic.

---

## SEQUENCE AFTER (do not start until the brain is proven)

- **P3 Robust poster:** ONE parameterized poster, QBO body built *structurally*
  (no hand-typed JSON strings — that's the current parse-crash root), pre-flight
  validate body + account ids live. Bill (A/P) vs Purchase (paid) vs specific
  card/bank paths. Migrate clients one at a time, Alderson first as control.
- **P4 Config-drive + retire clones + webhooks:** collapse per-client scenarios
  to one pipeline + per-client config rows; switch intakes to instant triggers
  here (the cost fix), in the same rebuild.
- **P5 Onboard next client on new rails; re-code the 16 OS posts from history.**

---

## NOT THE NEXT STEP, but tracked (blocked on inputs / would be throwaway)

- **QBO #970 (Latham freight) + #983 (Walker split)** — need the source
  invoices. Ready to correct the moment Markie drops them; blocked on inputs.
- **Other client Drive intakes (Universal / Alderson / Ovita)** — OFF, still on
  the OLD prepend-bug write. **Do NOT patch the 3 clones individually** — they
  get replaced by the ONE pipeline in P4. Leave OFF; don't do throwaway work.

---

## GOLDEN RULES (carried forward)
Nothing posts to QBO without Markie's review. CoA is locked — never invent an
account. Owen Sound (Clark OS) and Collingwood (Clark CW) are permanently
separate. Verify every change against live QBO. Sanity Guard stays on. Build
once on consolidated rails — no per-client clones.
