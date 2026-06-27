# Competitive roadmap — practice mgmt + personal OS (2026-06-27)

Synthesized from an overnight web teardown of the category leaders. Goal: make Figgy
the best practice-management cockpit AND personal operating system in one — the moat is
that **no competitor crosses that line** (Karbon/TaxDome/Keeper on one side; Sunsama/
Motion/Reclaim on the other) and none has Figgy's multi-agent review chain.

## Who we studied
- **Practice mgmt / bookkeeping:** Karbon, TaxDome, Canopy, Financial Cents, Jetpack
  Workflow, Keeper/Double, Uncat, Dext.
- **Personal OS / planning:** Sunsama, Motion, Reclaim, Akiflow, Todoist, Things 3,
  Notion (+ Notion Calendar).

## The universal "must-match" mechanics (every leader has these)
1. **Recurring-work engine** — define a template once (ordered checklist + roles), it
   auto-spawns the dated job per client each period with **relative due-date math**
   (e.g. HST due = period-end + 1 month) and **auto-advances** when steps complete.
   *(We have recurring tasks/rules + the month-end board — needs templates + due-date math.)*
2. **Client-request portal, magic-link (no login), auto-chase** — client answers
   uncategorized-txn questions / uploads docs via a one-click email/SMS link; automatic
   reminders until done. Keeper/Uncat/Financial Cents/TaxDome all live on this.
   *(We have the share-link token rails from RevRec/Banked Hours — reuse them.)*
3. **Uncategorized-transaction "Ask Client" loop that carries over closes** —
   Keeper/Double's spine; unanswered questions roll into next month, resolve into coding,
   write back to QBO memo. Maps directly onto Markie's #1 pain (posting + reconciling).
4. **Capacity / workload board (hour-based, turns red)** — set hours/week, see hours per
   person, overload flags red. Financial Cents/Karbon/Canopy/Jetpack.
5. **Email-as-work** — shared inbox, two-way Gmail/Outlook sync, **email→task**, pin to
   the client timeline. Karbon's killer feature (~18 hrs/week saved).
6. **Document mgmt** — AI classify + **auto-rename/match to request** + OCR + audit trail.
   Canopy/Dext/Keeper. Dext's **supplier rules** (pin category+tax+payment per supplier)
   = exactly our vendorMemory idea, productized.
7. **Review/approval gates** as real workflow stages. *(We already have the Fig→Sage→Wren→
   Markie chain — make it a first-class gate, not just chat. Genuine differentiator.)*
8. **Practice Intelligence dashboards** — overdue/stalled/due-soon jobs, realization, WIP,
   per-client profitability, + natural-language Q&A. Karbon/TaxDome/Canopy.
9. **AI that learns the firm's own corrections** — Dext AI Assist & Keeper AI Bank Feeds:
   explainable, human-in-the-loop, per-client. *(This is literally our brain + learning loop.)*

## Personal-OS mechanics worth stealing
- **Guided daily planning + shutdown ritual** (Sunsama/Akiflow) — ✅ shipped v1 (`/plan`).
- **Workload meter** (planned time vs capacity, yellow/red) — ✅ shipped v1.
- **Auto-scheduling / time-blocking into calendar gaps w/ auto-reschedule** (Motion/Reclaim).
- **Quick-capture command bar** (`Cmd/Ctrl+E`, NL parse "call John tomorrow 3pm #client") —
  Akiflow/Todoist. Low cost, high daily use; Liv's add_task already does the hard half.
- **Habits + weekly review ritual** (Reclaim/Sunsama) spanning work + Phoenix Rising.
- **Eisenhower / MIT prioritization** (Notion) — select props + a derived priority score.

## Ranked build order (highest leverage first)
**Attack the #1 time-sink (posting + reconciling + chasing):**
1. Recurring-work engine + job templates + relative due-date math (M)
2. Client-request portal: magic-link + auto-chase reminders (M — reuse share-link rails)
3. Uncategorized-txn "Ask Client" loop that carries over closes (M)
4. Capacity / "who's behind" board, hour-based (M — close-snapshot exists)

**Personal-OS quick wins (small, felt daily):**
5. ✅ Plan My Day + workload meter (shipped) → next: persist server-side + Morning Figgy voice
6. Quick-capture command bar (S–M)
7. Habits + weekly review (M)

**Bigger bets (highest ceiling):**
8. Email-to-task / shared triage inbox, Liv-powered (L)
9. Auto-scheduling / time-blocking with auto-reschedule (L — start with Reclaim's defend-focus version)

**Differentiators to lean into (not just match):**
10. AI-tiered review gates as a workflow primitive (Fig→Sage→Wren→Markie)
11. One app = practice cockpit + walled personal OS — keep widening this gap.

## Already shipped this session toward the above
- Vendor auto-post rules + "suggest from history" (≈ Dext supplier rules / Keeper auto-classify).
- Statement coding (drop a CSV → Fig codes every spend row) — the posting-relief lever.
- Reconcile cleanup: stale cheques + duplicate finder.
- Tasks cleanup (near-dup / undated / stale).
- Plan My Day + workload meter (personal-OS heartbeat).
- Brain-only agent fallback + optional cheap/self-host LLM (Groq Llama / DeepSeek / Ollama).

Sourcing caveat: most vendors 403 direct fetch, so specifics came from search-indexed
copies of their own help/marketing pages — consistent across multiple sources, but a few
vendor-published stats (e.g. TaxDome's "47% faster") are marketing numbers, not independent.
