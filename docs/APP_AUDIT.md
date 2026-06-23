# Figgy / gfb-crm — App Audit & Process Improvements (2026-06-23)

Honest review of the whole app: what works, what's dead, what's risky, what adds
day-to-day value, and how to make the AI + the product better. Grounded in a
codebase scan + 2026 agent best-practice research.

## TL;DR — top priorities (in order)
1. **Security: lock down the token-gated public endpoints** (migrate, voice, bulk-import, restore) — weak hardcoded tokens, publicly callable. HIGH.
2. **Remove/àwire the dead routers & pages** so the app is honest about what exists.
3. **Make half-wired features honest in the UI** (Microsoft email send, anything QBO-gated) — don't show buttons that throw.
4. **Surface the north-star cockpit** — per-client month-end status + a "who's behind" portfolio board. This is the daily-value win once QBO is connected.
5. **Add router-level tests** for the money paths (payroll, qbo, task).

---

## What's working well (keep)
- Clean, specialized agent stack: routing front desk + per-agent skill packs + scorecard + learning loop + governed-autonomy audit. Matches Anthropic's "effective agents" guidance.
- Pure business logic is well-tested (payroll math, email parsing, dividends, month-end, governance, scorecard, learning).
- Per-client isolation is enforced at the data boundary.
- 45+ routers are actively used by the frontend — the core CRM is real, not a shell.

## 1. Dead / unused (remove or wire)
- **makeIntakeRouter** — defined but NOT registered in `router.ts`; 0 usage. Orphaned → delete or register.
- **Orphaned pages**: `src/pages/Home.tsx`, `src/pages/MorningBriefing.tsx` — imported but not routed. Route them or delete.
- **Zero-frontend routers**: `migrate`, `voice`, `restore`, `sheetExport`, `bulkImport`, `googleTasks`. Some are intentional admin/one-shot utilities — keep but mark clearly; others (googleTasks, sheetExport) should be wired or removed.
  - Note: `learning` is used server-side (the `remember` tool) even though no direct `trpc.learning` call — that's fine; consider a small "Knowledge" UI to view/edit it.

## 2. Broken / half-wired (make honest)
- **Microsoft/Outlook email send** throws "not wired" — Gmail works. Either wire Graph send or hide the send/reply affordance for Microsoft-connected accounts so it never errors in your face.
- **AI features gated on `ANTHROPIC_API_KEY`** (assistant, email drafts, PDF splitter, web classify) — fine, but the UI should show a clear "AI not configured" state instead of a raw error if the key is ever missing.
- **QBO-gated doing** (Fig posting, Sage HST, Wren tie-outs, Tess returns, Jade analysis) — correct to gate; keep the honest "connect QuickBooks" messaging.

## 3. Security / risk (HIGH)
- `migrate`, `voice`, `bulk-import`, `restore` use **publicQuery** with **weak hardcoded token defaults** (`gfb-*-2026`). Anyone who guesses the token can run migrations/imports. Fix: require a strong secret from env (no default), or move behind admin auth, or remove if unused.
- `migrate-router` runs SQL from files via a public endpoint — highest risk; restrict hard.
- Several `select()` calls without explicit columns rely on Drizzle inference — a missing column on the live DB throws. The schema guards mitigate this, but explicit columns on the money tables would be safer.

## 4. Duplication / bloat (consolidate)
- **Two Dockerfiles** (`Dockerfile` prebuilt vs `Dockerfile.cheap` build-in-container) + two compose files — pick ONE deploy path; archive the rest.
- **Seed/restore client data duplicated** across `restore-router.ts`, `bulk-import-router.ts`, payroll seed — make one source of truth.
- **Sync infrastructure scattered** across 6 files (`sync-scheduler`, `all-sync-scheduler`, `sync-hooks`, `google-sync`, `sheet-inbound-sync`, `master-sheet-sync`) — consolidate to one scheduler with named jobs.

## 5. Tests
- Pure cores: good coverage. **Routers: only `interco` has tests.** Add integration tests for `payroll`, `qbo`, `task` (the money paths) — refactoring them is currently risky.

## 6. Day-to-day value (the product north star)
Per CLAUDE.md, the CRM is Markie's **month-end-close cockpit**: per-client status + a portfolio "who's behind" board, fed by the live QBO snapshot. The pieces exist (monthEnd, monthlyClose, dashboard, clientDashboard) — the win is making that the **home screen**: at a glance, who's behind on posting/HST/year-end/recon. Prioritize this once QBO is connected; it's the thing that saves Markie time every day.

## 7. AI-specific improvements (best practice)
- **Workflows for deterministic tasks**: recurring known bills + the monthly sales receipt should run as fixed coded paths, not free agent reasoning (cheaper, reliable).
- **Evaluator loop**: wire the Fig→Sage→Wren review as an actual evaluator-optimizer once QBO posting exists (Sage scores Fig's batch, returns exceptions).
- **Governed autonomy UI**: a settings screen to set the dollar/confidence thresholds per agent (engine is built; no UI yet).
- **Knowledge UI**: let Markie view/curate each agent's learned knowledge base (the `agent_learnings` rows).
