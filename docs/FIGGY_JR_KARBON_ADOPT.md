# FIGGY JR / gfb-crm — KARBON TEARDOWN & "WHAT TO ADOPT" PLAN (2026-06-20)

Focused teardown of **Karbon** (karbonhq.com), the leading accounting/bookkeeping
practice-management platform, mapped against what gfb-crm/Figgy Jr **already
has**, so we only build the gaps. Judged against the mandate: less of Markie's
time, build once on consolidated rails, accurate books on cheap autopilot.

> Method note: Karbon's own marketing domain (karbonhq.com) blocks automated
> fetch (HTTP 403). Feature behavior below is sourced from Karbon's **help
> center** (help.karbonhq.com), Karbon **community/release notes**, and
> independent 2026 reviews (getuku.com, futurefirm.co, financial-cents.com).
> URLs cited per feature.

---

## 0. PRICING / POSITIONING (context)
- Team plan **$59/user/mo** (annual) / $79 monthly; Business **$89/user/mo**
  (annual) / $99 monthly; Enterprise custom. Per-user pricing is exactly the
  SaaS-dependency trap the mandate says to avoid — we own the stack instead.
  Sources: [Financial Cents — Karbon pricing 2026](https://financial-cents.com/resources/articles/karbon-pricing/),
  [getuku — Karbon review 2026](https://getuku.com/articles/karbon-review/).

---

## 1. KARBON STANDOUT FEATURES (how each actually works)

### A. Triage — email → work (collaborative inbox)
Karbon's signature feature. Every email flows into a central **Triage** inbox.
From an email you can: convert it **into a Work item or a Task**, **assign** it
to a colleague, **link** it to the relevant client/work, add an internal
**comment**, or **@mention** a teammate to loop them in before replying.
**Shared Triage** (2024+) lets multiple people collaborate on a shared inbox and
compose/reply/forward "as yourself or as the team." The philosophy: client
communication is a **first-class object** living in shared client/work views,
not scattered in personal inboxes. 2026 adds delegated Triage inboxes + meeting
transcripts with AI summaries.
Sources: [Karbon — improve workflow with Triage](https://karbonhq.com/resources/improve-workflow-karbon-triage/) (via search snippet),
[Karbon — email management](https://karbonhq.com/solution/email-management/),
[Karbon release notes — Shared Triage](https://karbonhq.com/release-notes/apr-16-2024/).

### B. Work items + Work Templates (the workflow engine)
- **Work items** = a job (e.g., "Jan month-end – Clark OS") with a **status
  pipeline / Kanban** (Planned → Ready to start → In progress → … → Done).
- **Work Templates** = reusable job blueprints with **sections** (grouped task
  lists) and **Client Task** sections. Karbon ships a library of pre-built
  templates.
- **Tasklist Automators** = "if this, then that" rules attached **at the section
  level**: on completion of a section, auto-change the next section's status,
  due date, or **assignee** (hand-offs), and auto-move the Kanban card into the
  new owner's dashboard. **Global automators** detect when **recurring work**
  hits its start date and flip it from "Planned" → "Ready to start"
  automatically.
Sources: [Karbon Help — use automators](https://help.karbonhq.com/en/s/articles/6117930-use-automators),
[Karbon — automation saves hours](https://karbonhq.com/resources/how-karbon-uses-automation-to-save-you-hours-each-week/),
[Karbon — 6 essential automation recipes](https://karbonhq.com/resources/6-essential-recipes-to-automate-your-workflows-in-karbon/).

### C. Client Tasks / Client Requests (the client-side loop) — STANDOUT
The benchmark client-request loop. A **Client Request** is a **checklist** of
items (documents/info) sent to a client. The client gets an email with a secure
**magic link** (unique URL per request) → a **Client Portal** scoped to that
work, listing all outstanding items. Client can **check off** items, **upload
documents**, and **comment** for clarification. Key behaviors:
- **Auto-reminders**: scheduled, with tone presets (**gentle / urgent /
  custom**); a **hard cap of 5 reminders** per request then it stops.
- **Round-trip to work**: when the client completes an item/uploads a doc, the
  firm gets a **Triage notification**, the item is marked complete **inside the
  work**, and the **uploaded document is attached to the work item** (and the
  client request).
- **Status automation**: pairing a Tasklist Automator with the request section
  can auto-set the work to **"Waiting for client"** and flip it back when they
  respond.
Sources: [Karbon Help — send client requests](https://help.karbonhq.com/en/articles/1524688-send-client-requests),
[Karbon Help — client's experience of Client Requests](https://help.karbonhq.com/en/articles/1524691-see-your-client-s-experience-of-client-requests),
[Karbon Help — where uploaded docs go](https://help.karbonhq.com/en/articles/1543082-where-do-documents-uploaded-in-client-requests-go),
[Karbon — client portal](https://karbonhq.com/feature/client-portal/).

### D. Activity timeline & collaboration
Each **client and each work item** has a chronological **Activity Timeline** — a
shared history of **emails, notes, tasks, and comments** = "single source of
truth." **Notes** are discussable objects (comment + collaborate). **@mentions**
loop in a person/group/whole team with notifications; internal comments on an
email/work are **invisible to the client**. Emails between any teammate and the
client live in one place, attached to the client/work.
Sources: [Karbon — team collaboration](https://karbonhq.com/en-GB/solution/team-collaboration/),
[Karbon Help — comment & collaborate on a task](https://help.karbonhq.com/en/s/articles/2111192-comment-and-collaborate-on-a-task),
[Karbon Help — use Notes](https://help.karbonhq.com/en/articles/5919746-use-notes).

### E. My Week / capacity & workload planning
**My Week** = each person's planned workload for the week, integrated with
Google/Outlook calendars. The **Resource Planning Dashboard** combines **planned
work (in My Week)** + **unplanned work (not yet scheduled)** against each
person's **capacity** to show who's over/under for the week/month/quarter.
Drives "should we take on more work / when to start this job."
Sources: [Karbon — resource planning template](https://karbonhq.com/templates/resource-planning/),
[futurefirm — Karbon in-depth review](https://futurefirm.co/karbon-practice-management/).

### F. Time & billing + budgets vs actuals
Multiple time-entry methods (timers, manual, bulk), **time/budget estimates per
work item**, and **real-time budget-vs-actual + utilization** reporting (Project
Health, Planned vs. Actual). Integrated **invoicing** turns tracked time / fixed
fee into branded invoices; recurring billing + payments sync to QBO/Xero.
Sources: [Karbon — time & billing software](https://karbonhq.com/resources/time-billing-software-accountants/),
[financial-cents — Karbon pricing](https://financial-cents.com/resources/articles/karbon-pricing/).

### G. Automated client reminders
Covered in (C): scheduled, tone-graded, capped at 5. The reminder engine is a
separate, reusable primitive worth noting.
Source: [Karbon Help — send client requests](https://help.karbonhq.com/en/articles/1524688-send-client-requests).

### H. Karbon AI ("Kai", Practice Intelligence, Aider)
- **Kai** — an "AI coworker that knows your firm": drafts emails, summarizes work
  conversations/threads, answers questions about the firm's data.
- **Practice Intelligence / AI Analytics** — natural-language Q&A over firm
  performance, instant insights, auto-generated dashboards.
- **Aider acquisition (Sep 2025)** — AI advisory/reporting that automates
  reconciliations & period close + predictive client insights.
- **AI work-conversation summaries** + **meeting transcripts with AI summaries**.
Sources: [CPA Practice Advisor — Karbon introduces Kai](https://www.cpapracticeadvisor.com/2026/06/03/karbon-introduces-ai-coworker-kai/184484/),
[Karbon — launches Kai](https://karbonhq.com/resources/karbon-launches-kai/) (via search snippet),
[Karbon — tax workflows + Practice Intelligence](https://karbonhq.com/resources/karbon-launches-tax-workflow-and-practice-intelligence/),
[GlobeNewswire — Karbon acquires Aider](https://markets.financialcontent.com/ridgwayrecord/article/gnwcq-2025-9-30-karbon-acquires-aider).

### I. Reporting / practice analytics
~10 live dashboards: billing, budgets, client communication, **email response
times**, work-in-progress, plus the AI analytics layer above.
Source: [getuku — Karbon review 2026](https://getuku.com/articles/karbon-review/).

---

## 2. MAP TO OUR CRM — what we already have (don't rebuild)

Grounded in `src/pages/` + `api/` + `db/schema.ts`:

| Karbon feature | Figgy Jr status today | Verdict |
|---|---|---|
| Work items + status Kanban | `Tasks.tsx` board view (To Do/In Progress/Review/Done), `task-router.ts` `setStage` | **Have** (task-level, not "job/work-item" grouping) |
| Work Templates | `api/workflow-templates.ts`, `workflow-router.ts`, recurring (`task.createRecurring`) | **Have** (no section-level automators) |
| My Week / capacity | `StaffWorkload.tsx` + `workload-router.ts` (open/overdue/week-hours/clients per staff) | **Have, weaker** (no planned-vs-capacity, no per-week assignment) |
| Time tracking + utilization | `time-router.ts` (staff utilization) | **Have, partial** (no per-work budget-vs-actual) |
| Client portal + magic link | `ClientPortal.tsx`, `portal-router.ts`, e-sign (`Signatures.tsx`) | **Have** |
| Client doc requests | `missingItems` (bookkeeper pushes items; client uploads via portal) | **Have, weaker** (no checklist grouping, no auto-reminders) |
| Email hub | `Emails.tsx` + `email-router.ts` (thread view, client link) | **Have, weaker** (no email→task/work, no internal comments) |
| Triage (AI findings) | `Triage.tsx` (Figgy Jr coding findings) | **Have** (different meaning than Karbon's email Triage) |
| Reporting/analytics | `PracticeHealth.tsx`, `SatisfactionScores.tsx`, `Dashboard.tsx`, `MorningBriefing.tsx` | **Have** |
| Month-end close | `MonthEndClose.tsx` + cockpit | **Have — ahead of Karbon** |
| Payroll | full `Payroll` module | **Have — Karbon has none** |
| AI coding from history | vendor brain + cold-start classifier | **Have — ahead** |
| Activity timeline (work-item) | `interactions` table is **client-level only** (call/email/note); no work-item thread, no @mention, no comments | **GAP** |
| Section Tasklist Automators | none | **GAP** |
| Email → task/work | none | **GAP** |

**Net:** the workflow board, templates, recurring, portal, e-sign, calendar,
month-end, payroll, and AI coding are all present — several **ahead** of Karbon
(Karbon has no payroll and bolt-on AI; our close cockpit + per-client isolated
brain are stronger). The real gaps are the **client-request loop polish**, the
**work-item activity/collaboration layer**, **email→work**, **section
automators**, and **budget-vs-actual + planned-capacity**.

---

## 3. RANKED — ADOPT THESE (gaps / weaker-than-Karbon), with build plan

### #1 (BEST QUICK WIN) — Client Request checklists + auto-reminders (Uncat/Karbon-grade)
**What it is.** Upgrade our portal `missingItems` from loose items into a
**grouped Client Request** = a named checklist sent in ONE magic-link email, with
**scheduled auto-reminders** (gentle/urgent, capped at ~5), client checks
off/uploads per item, and on completion it pings Triage + marks the source work
done. Closes the loop already half-built (`awaiting_client` + `missingItems` +
magic-link portal all exist).

**Why it fits Markie.** Document-chasing is the #1 time sink for a solo
bookkeeper; this directly removes manual follow-up emails. We already have the
portal, tokens, and `submitMissingItem` — this is mostly grouping + a reminder
cron. Aligns with the existing competitive-research P1 (Uncat-grade loop) and
month-end close ("what's outstanding from each client").

**Build difficulty: LOW–MEDIUM.** Reuses portal auth, `missingItems`, email
sending. New: a `clientRequests` parent + a reminder scheduler (we already run
boot/daily jobs, e.g. keep-alive, `all-sync-scheduler.ts`).

**Data model (Drizzle/SQLite):**
```
clientRequests        id, clientId, title, dueDate, status(open|partial|complete|cancelled),
                      magicTokenId, reminderTone(gentle|urgent), remindersSent,
                      maxReminders(default 5), lastReminderAt, sourceTaskId?, createdAt
// reuse missingItems, add: requestId (FK), completedAt, uploadedFileId
```
**UI:** "New Request" on the client page → pick items from common presets (bank
statements, receipts, HST docs, payroll hours). Portal shows a single checklist
with progress bar (the portal already renders missingItems + Progress). Add a
"Reminders: gentle, 2/5 sent" status chip. Daily job sends the next reminder
until cap or complete.

---

### #2 — Work-item Activity Timeline + comments + @mentions
**What it is.** A threaded **activity/comment timeline on each task (work item)
and client**: internal comments, @mentions (Markie/Rachelle), and auto-logged
events (status change, client reply, doc upload). Today `interactions` is
client-level only and not threaded; tasks have no discussion.

**Why it fits.** Even a 2-person firm loses context ("why is this on hold?").
Karbon's single-source-of-truth timeline is its stickiest collaboration feature.
Pairs perfectly with #1 (client reply → timeline entry) and Triage.

**Build difficulty: MEDIUM.** New table + tRPC CRUD + a timeline component
embedded in `TaskDetailDialog` and the client page; @mention = simple user
picker against the 2-staff list with a notification row.

**Data model:**
```
activityEvents  id, entityType(task|client|request), entityId, authorUserId,
                kind(comment|status_change|client_reply|upload|email_linked),
                body(text), mentions(json userIds), meta(json), createdAt
```
**UI:** reverse-chron feed in the task drawer; comment box with `@`; mention
creates a `notifications` row (table already exists).

---

### #3 — Email → Task/Work + internal comments on email (Karbon Triage)
**What it is.** From the `Emails.tsx` reader, a **"Convert to task"** /
**"Attach to client/work"** action, plus internal comments on a thread. Turns
the existing email hub into Karbon-style Triage (email is already client-linked).

**Why it fits.** Markie lives in email; one click email→task removes
copy-paste. Leverages existing `email-router` (thread, client link) and
`task.create`.

**Build difficulty: LOW–MEDIUM.** Add a button that prefills `task.create` from
the email (title=subject, clientId from link, description=snippet, link back via
`emailId`). Internal comments reuse #2's `activityEvents` (entityType=email).
**Sequencing:** do #2 first; this rides on it.

---

### #4 — Per-work Budget vs Actual + planned capacity in My Week
**What it is.** Add **budgeted hours per task/work** and surface
**budget-vs-actual** + a **My-Week planned view** (assign work to a week, sum
planned hours vs each person's weekly capacity). We have raw time + utilization
but no estimate baseline and no forward planning.

**Why it fits.** Tells Markie if a client is unprofitable (actual ≫ budget) and
whether the week is over capacity before committing — protects a solo operator's
time/pricing. Feeds the pricing calculator we already have.

**Build difficulty: MEDIUM.** Add `budgetHours` + `plannedWeek` to tasks;
`workload-router` already aggregates hours — extend with capacity + planned vs
actual. UI: a column/badge on tasks + a "My Week" grouping in StaffWorkload.

**Data model:** `tasks.budgetHours real`, `tasks.plannedWeek text(ISO week)`;
`staffCapacity (userId, weeklyHours)`.

---

### #5 — Section-level Tasklist Automators on workflow templates
**What it is.** "If section X complete → set next section Ready / reassign / set
due date / set work 'Waiting for client'." We have templates + recurring but no
conditional hand-off automation.

**Why it fits.** Automates month-end hand-offs (e.g., "reconcile done → HST
review ready, assign Markie") = less manual status babysitting. Most valuable
once #1 exists (auto "Waiting for client" when a request is sent).

**Build difficulty: MEDIUM–HIGH.** Needs a small rules layer evaluated on task
status change; risk of over-engineering for a 2-person team — keep the rule set
tiny (3–4 recipes). Lower priority precisely because the team is small.

---

## 4. EXPLICITLY DO NOT BUILD (we already have it / mandate says avoid)
- Workflow board/Kanban, reusable templates, recurring tasks, calendar — **have**.
- Client portal + magic link + e-signatures — **have**.
- Month-end close cockpit, payroll, AI history-coding, practice health — **have / ahead**.
- Per-user SaaS pricing model & bolt-on AI add-ons — **avoid** (own the stack).
- Karbon "Kai"/Aider-style auto-posting reconciliations — **avoid** (golden rule:
  nothing posts without Markie's review; auto-posting is the thing the market is
  failing at — see competitive research).

## 5. SUGGESTED SEQUENCE
1. **Client Request checklists + auto-reminders** (quick win, closes the loop). 
2. **Activity timeline + comments/@mentions** (foundation for #3). 
3. **Email → task** (rides on #2). 
4. **Budget-vs-actual + My-Week capacity**. 
5. **Section automators** (smallest payoff for a 2-person firm; do last).
