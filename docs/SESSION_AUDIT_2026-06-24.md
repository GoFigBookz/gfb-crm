# Session Audit — 2026-06-23 → 24 (overnight)

Cross-check of **every change Markie requested this session** against what was delivered.
Status: ✅ done & live · 🔨 building tonight · ⏳ backlogged (tracked task #) · ❓ needs Markie

## Delivered & live (verified: typecheck clean, 194 tests pass)
1. ✅ **TouchBistro timesheet import** — Upload file + Import-from-Drive (searches the client's `Payroll` subfolder via folder-tree BFS), CSV parsed deterministically (no AI dep), **>10h single-shift flag**. (builds .56–.58)
2. ✅ **Google fully connected** — Drive/Gmail/Calendar/Tasks all 200. Root causes fixed: redirect-uri canonicalization, OAuth consent test-users, **Tasks API enabled**, NOT-NULL `providerAccountId`, identity scopes, firm-wide account lookup.
3. ✅ **Build badge in header** — shows live build tag + server start time, every page. (.66)
4. ✅ **Favorites sidebar** — right-click / star to pin, grouped sections, Dashboard under Work. (.68)
5. ✅ **Calendar populated + correct dates** — fixed `startTime/endTime`→`startDate/endDate` insert bug, missing-column schema guard (`ensure-calendar-schema`), all-day **local-noon** parse (no day drift), list caps 50→500/1000.
6. ✅ **One calendar** — removed the second, broken Tasks-page calendar (no week padding → shifted dates); its button now opens `/calendar`.
7. ✅ **Two-way Google sync** — inbound scheduler (every 30 min + boot) was never started → now wired; outbound push (CRM→Google) for task/event create/edit/delete, loop-safe.
8. ✅ **Richer Add Event** — all-day, location, meeting link, guests, client, color, description; mirrors to Google.
9. ✅ **Mic stays on** — continuous recognition, accumulates speech, auto-restarts through silence, stops only when tapped off; hands-free auto-sends on pause.
10. ✅ **Drag events on calendar** (tasks already dragged) — drop to move, preserves time/duration, pushes to Google.
11. ✅ **Tasks now show** — `task.list` was capped at 50 by due-date-desc → only farthest-future returned. Bumped to 500.
12. ✅ **Inactive clients show no tasks** — Thames Valley, MRM, Lemaestra, Demeva, Culverts Bakery, Brookville filtered out of list/upcoming/overdue.
13. ✅ **Client merge tool** — "Merge duplicate" on the client page (moves all related data, fills blanks, deletes dupe).
14. ✅ **Wholesale ≠ payroll** — Dock King and any wholesale client can never be a payroll client (enforced 4 layers incl. sheet sync that was re-flagging it).
15. ✅ **Payroll filter split** — Manual entry vs QuickBooks autopay on Clients page.
16. ✅ **QBO connect readiness** — `/api/qbo/debug` confirms creds + redirect + shows each connection's linked client name & mapping-OK flag.

## Building tonight 🔨 / pending
- 🔨 **#12 Re-date rules** — Year-end → 30th of month AFTER year-end; HST → 15th of month after quarter; T4 → Jan 20. (building)
- 🔨 **#13 Payroll cadences** — West York Paving = Wednesday weekly; Align by Design = QBO autopay (no task). (building)
- 🔨 **#11 Statuses** — Cat Bay → onboarding; Columbus → prospect. (building)
- 🔨 **#17 QBO → CRM data sync** — scheduled pull → snapshot → dashboard/Insights (the "why isn't it syncing" gap). (building)
- ⏳ **#14 Go Fig Bookz → Insights** — treat the firm as the self-client feeding Practice Health.
- ⏳ **#7 Timezone switcher** — all-day already tz-proof; timed-event pin-to-zone pending.

## Needs Markie ❓ / tomorrow
- ❓ **#3 Merge the 2 Sams** — tool is built; Markie deleted the sheet row (won't remove from CRM). Delete/merge the dupe IN the CRM.
- ❓ **T4 vs T2** — confirm "Jan 20" applies to T4 slips or the T2 return.
- 📅 **#15 Connect QBO (native read-write) for the 5 manual-payroll companies** — Clark OS, Clark CW, Auld Spot, Sher-E-Punjab, Originality. Readiness GREEN. Retire Clark read-only bridges to avoid "ambiguous".
- 📅 **#16 SMS + Wise + PayPal + Stripe** — post-payroll rollout.
- 📅 **#6 TouchBistro import live test** — Old Spot + Sher-E-Punjab.

## Notes
- QBO connections are read-only Make bridges → on-demand only; that's why nothing auto-shows. #17 builds the real sync.
- Connection→client mapping appears correct (binds `clientId=client.id` by name match); `/api/qbo/debug` now proves it per-connection.

## Overnight progress (build 2026-06-24.88)
- ✅ **#12 Re-date rules APPLIED** — `api/reconcile-overnight.ts` (idempotent boot pass):
  year-end → 30th of month after FY end (Sep→Oct 30, Dec→Jan 30); T4 → Jan 20;
  HST quarterly → 15th (keeps fiscal-quarter month). Verified on live data shape:
  32 year-end / 11 T4 / 13 HST re-dated; 2nd pass = 0 changes (idempotent).
- ✅ **#13 Payroll cadences** — Align by Design → QBO autopay (flag + payroll tasks/rules retired);
  West York → weekly. (West York was already weekly.)
- ✅ **#11 Columbus → prospect** (applied). Inactive-task hiding already live.
- ❓ **Cat Bay onboarding** — NO "Cat Bay" client exists in the directory; can't apply. Add the client first.
- ❓ **#14 Go Fig Bookz → Insights** — the firm is NOT in the client directory under any
  spelling ("go fig"/"gofig"/"go figure" all return nothing). Needs the firm added as a
  self-client (flagged) before it can feed Practice Health. Confirm with Markie.
