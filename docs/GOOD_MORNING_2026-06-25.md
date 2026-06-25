# Good morning, Markie — overnight build log (2026-06-25)

Everything below is **merged to `main` and live** on figgy.gofig.ca. Skim, react, and
point me at the next thing. Items needing **you** are at the bottom.

## Shipped tonight (in order)
1. **AI cost model** (`docs/AI_COST_MODEL.md`) — what the agents cost, self-host verdict, the plan. (You already fixed Skye's billing 👍)
2. **Practice Health = real data** — Go Fig Bookz flagged as the firm; live roster, MRR, payroll-processed, A/R aging.
3. **Calendar timezone** — everything pinned to Ontario; a banner + local-time translation only when you're in a different zone.
4. **Jon Gillham Control Book** — recreated from his shared master sheet: entities, cap table, **dividends by person**, family benefit, and an auto **significant-control (ISC ≥25%) register**. Plus a **read-only owner share link** (Groups → Jon → "Share with owner").
5. **Assistant fix** — the "Unable to transform response" error is handled (deadline + safety net).
6. **Team rule** — every agent now owns the work and won't bounce tasks back to you.
7. **Demo mode = safe** — a separate fake database; share it with anyone, zero real data exposed.
8. **Naming sorted** — app = **Figgy**, AI = **Figs**, "Figgy Jr" retired. New **Figgy logo** (cursive + AI bot w/ fig leaf) in the sidebar; your **Go Fig Bookz logo** in the white top bar.
9. **Phoenix Rising** — your private life hub (Liv-hosted): Finance, **Social (synced to your calendar)**, **Milestones** (doing/feeling), Travel, Health, Growth. Phoenix-from-lotus logo, owner-only link at the bottom.
10. **Meet the Team** — character-rich roster on the chat screen (tap a card to talk to her). Art direction for each is in `src/lib/team.ts`.
11. **Phoenix personal import** — pulled your Drive health/finance/travel records in (Dr. Lass, latest labs, supplements, goals, linked docs).

## Standing rules saved to memory (CLAUDE.md)
Build continuously + merge live; move on when blocked on your approval; push back when something doesn't make sense; keep your task list.

## 👉 Needs YOU (your task list — can't proceed without these)
- **Connect QuickBooks** (Intuit creds + redirect) → unlocks Fig auto-posting (#28), Motion Invest revenue-matching (#24), live financials everywhere.
- **Hubdoc walkthrough** — the screen-share we agreed on, so Fig can post each morning.
- **Connect SMS / Wise / PayPal / Stripe / TouchBistro** — credentials, one provider at a time.
- **TouchBistro timesheet test** (Sher-E-Punjab / Auld Spot) — needs a live import run.
- **Eyeball the new logos** — the Figgy fig-leaf-bot + Phoenix lotus are v1 SVGs I built; tell me what to tweak or I'll get a designer pass.
- **Task Summary mining (#26)** — say which trackers matter and I'll pull them in.

## Notes / pushed-back
- Kept the Figgy logo **cheeky-tasteful** (classical fig-leaf) so it's safe if a client ever sees it.
- Didn't restructure your Drive folders (you said "file folder structure" — I read that as Drive, which I won't reorganize without you). Retired "Figgy Jr" in the **app**; internal doc filenames still say it — say the word and I'll sweep them.
