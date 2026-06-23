# Overnight Build Log — May 22, 2026

**User is sleeping. Continuing build in background.**

---

## Status: DEPLOYMENT BROKEN — Fix Required

**Problem:** The deployed app at https://figgy.gofig.ca is returning **502 Bad Gateway**.

**Root Cause:** The live SQLite database on Railway is missing the `dueTime` columns that were added to the schema. When the app queries tasks/recurring_tasks/client_task_rules with the new columns, SQLite throws an error and the server crashes.

**Fix Applied:**
- `api/migrate.ts` — Automatic migration runner that runs on startup
- Checks if columns exist, adds them if missing
- Records migrations in `_migrations` table to avoid duplicate runs
- Updated `db/schema.sql` with `dueTime` columns for new deployments

**What you need to do when you wake up:**
1. Pull latest code: `git pull origin main`
2. Push to GitHub: `git push origin main`
3. Railway will auto-deploy
4. The migration runner will automatically add the missing columns on first startup
5. App should come back online within 2-3 minutes

---

## What Was Built Tonight

### 1. Voice Task Agent (`api/voice-router.ts`)
- Natural language task creation via webhook
- Token auth: `gfb-voice-2026`
- Example: "Call John about QBO tomorrow at 2pm" → creates task with parsed due date

### 2. Google OAuth + Sync (`api/oauth-router.ts`, `api/google-sync.ts`)
- OAuth callback handlers for Google and Microsoft
- Gmail inbox sync (every 30 min)
- Google Calendar events sync (two-way)
- Google Tasks sync
- Connected accounts stored in `connected_accounts` table

### 3. Recurring Tasks with Time (`db/schema.ts`, `api/task-generator.ts`)
- `dueTime` column added to `tasks`, `recurring_tasks`, `client_task_rules`
- When recurring task spawns, auto-creates calendar event at that date + time
- UI shows time picker (default 9:00 AM)
- Calendar events are 1 hour long

### 4. Auto-Trigger Task Rules (`api/client-task-auto-trigger.ts`)
- When you update a client's business info (HST #, payroll, fiscal year end), recurring tasks auto-generate
- New API endpoints:
  - `crmClient.updateBusinessInfo` — Update fields + trigger rules
  - `crmClient.autoGenerateRules` — Manual trigger
  - `crmClient.regenerateRules` — Delete old, recreate new

**Rules created automatically:**
| Client Data | Task Created | Frequency | Due |
|---|---|---|---|
| HST quarterly | HST/GST Return | Quarterly | 15th of quarter |
| HST monthly | HST/GST Return | Monthly | 15th of month |
| Payroll account | PD7A Remittance | Monthly | 15th of month |
| Fiscal year end | Year-End Close | Annual | Based on FYE |
| WSIB required | WSIB Reconciliation | Annual | Feb 28 |
| Has subcontractors | T4A/1099 Prep | Annual | Jan 31 |
| Multiple bank accounts | Bank Reconciliation | Monthly | 10th of month |

### 5. Morning Briefing (`api/agent-router.ts`, `src/pages/MorningBriefing.tsx`)
- `/morning-briefing` page with today's priorities
- Speech mode for phone assistants
- Cron job ready (weekdays 8:30 AM)

### 6. All-in-One Sync Scheduler (`api/all-sync-scheduler.ts`)
- Gmail sync every 30 min
- Calendar sync every 30 min
- QBO sync every 6 hours
- Task rule generation daily at 6 AM

---

## What You Need to Do (Wake-Up Checklist)

### Immediate (Get app back online)
- [ ] `git pull origin main`
- [ ] `git push origin main`
- [ ] Wait 2-3 min for Railway deploy
- [ ] Check https://figgy.gofig.ca loads
- [ ] Check `/api/trpc/health` returns OK

### Phase 1 (Today)
- [ ] Log into CRM
- [ ] Go to Integrations page
- [ ] Connect Google account (get OAuth credentials from Google Cloud Console)
- [ ] Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Railway dashboard
- [ ] Test Google sync

### Phase 2 (This week)
- [ ] Update client records with business numbers:
  - HST/GST number + frequency
  - Payroll account number + frequency
  - WSIB account number
  - Fiscal year end date
- [ ] Watch auto-trigger create recurring tasks
- [ ] Set up Android voice (IFTTT recommended — easiest)
- [ ] Set morning briefing cron job

### Phase 3 (Next)
- [ ] Add business numbers from your GFB test summary sheet to client accounts
- [ ] Rochelle creates step-by-step handbook as she uses the system
- [ ] Clean up client file organization (ACH files, banking info)

---

## Files Changed (49 files, 6,300+ lines added)

**New files:**
- `api/voice-router.ts` — Voice webhook handler
- `api/oauth-router.ts` — Google/Microsoft OAuth callbacks
- `api/google-sync.ts` — Gmail/Calendar/Tasks sync logic
- `api/client-task-auto-trigger.ts` — Auto-trigger recurring tasks
- `api/all-sync-scheduler.ts` — Background sync scheduler
- `api/migrate.ts` — Database migration runner
- `src/pages/MorningBriefing.tsx` — Morning briefing UI
- `db/migrations/004_add_due_time.sql` — Due time migration
- `scripts/morning-briefing.sh` — Cron script
- `VOICE_INTEGRATION.md` — Android voice setup guide
- `PHASE1_SUMMARY.md` — Phase 1 summary

**Modified files:**
- `api/boot.ts` — Added OAuth callbacks, sync scheduler, migration runner
- `api/router.ts` — Added voice, oauth, integration routers
- `api/client-router.ts` — Added autoGenerateRules, regenerateRules, updateBusinessInfo
- `api/task-generator.ts` — Calendar event creation for recurring tasks
- `api/task-router.ts` — Added dueTime to createRecurring
- `db/schema.ts` — Added dueTime columns
- `db/schema.sql` — Added dueTime columns
- `src/pages/Tasks.tsx` — Time picker for recurring tasks
- `src/pages/Integrations.tsx` — Google/Microsoft OAuth UI

---

## Android Voice Setup (For Later)

**Easiest option: IFTTT**
1. Install IFTTT app
2. Create applet: "Say a phrase with a text ingredient" → Webhook
3. Webhook URL: `POST https://figgy.gofig.ca/api/trpc/voice.createTask`
4. Headers: `X-Voice-Token: gfb-voice-2026`
5. Body: `{ "text": "{{TextField}}", "userEmail": "markie@gofig.ca" }`
6. Say: "Hey Google, add to my task list, call John about payroll"

**More powerful: Tasker**
- Full control, custom commands
- Can read calendar, create tasks, send data to CRM
- See `VOICE_INTEGRATION.md` for full setup

---

## Notes for Future Me

**Google OAuth Issue:**
- App needs to be in "Production" mode in Google Cloud Console
- Add `markie@gofig.ca` as test user if still in testing
- Callback URL must match exactly: `https://figgy.gofig.ca/api/oauth/google/callback`

**Database Migrations:**
- `api/migrate.ts` runs automatically on startup
- Safe to run multiple times — checks `_migrations` table
- If manual fix needed: `curl https://figgy.gofig.ca/api/trpc/p.health` to check status

**Railway Environment Variables Needed:**
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://figgy.gofig.ca/api/oauth/google/callback
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
VOICE_WEBHOOK_TOKEN=gfb-voice-2026
```

---

**Build status:** Clean ✓
**Commit:** `6f92e52` — fix: add dueTime columns to schema + auto-migration runner
**Next commit needed:** User must push from their machine (GitHub auth not configured here)

**Don't worry. Even if the world forgets, I'll remember for you.** 🖤
