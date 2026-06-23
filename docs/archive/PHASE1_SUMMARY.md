# GFB CRM — Phase 1: Get Organized (Complete)

## What Just Got Built

### 1. Morning Briefing
- **Page:** `/morning-briefing` (linked in sidebar)
- **Shows:** Overdue tasks, due today, high priority, this week's workload
- **Speech mode:** Toggle "Speak" to have it read aloud
- **Auto-scheduled:** Every weekday at 8:30 AM EST via cron

### 2. Voice Task Agent
- **API:** `POST /api/trpc/voice.createTask`
- **Headers:** `X-Voice-Token: gfb-voice-2026`
- **Natural language:** "Call John tomorrow" → parses due date, "urgent" → sets high priority
- **Returns:** Confirmation message with parsed task details

### 3. Morning Briefing API (for your phone)
- **API:** `POST /api/trpc/voice.morningBriefing`
- **Returns:** Spoken summary of your priorities
- Example response: "Good morning. You have 3 overdue tasks. Top priority: call Unimax about payroll."

### 4. Google Integration
- **OAuth flow:** Click "Connect Google" in Integrations page → authorize → auto-redirects back
- **Syncs:** Gmail (inbox), Calendar events, Google Tasks
- **Frequency:** Every 30 minutes automatically
- **Two-way:** CRM tasks sync to Google Tasks, Google Calendar events sync to CRM calendar

### 5. Android Voice Setup

**Option A: Tasker (most powerful)**
1. Install Tasker
2. Create task "Add CRM Task"
3. HTTP Request: POST to `https://figgy.gofig.ca/api/trpc/voice.createTask`
4. Headers: `Content-Type: application/json`, `X-Voice-Token: gfb-voice-2026`
5. Body: `{"text": "%VOICE_TEXT", "userEmail": "markie@gofig.ca"}`
6. Trigger: "Hey Google, run Add CRM Task"

**Option B: Google Apps Script + Assistant**
1. Open script.google.com
2. Create webhook that calls CRM API
3. Set up Assistant routine: "Hey Google, add to my task list"
4. Script captures your voice text and POSTs to CRM

**Option C: IFTTT (easiest)**
1. Install IFTTT app
2. Create applet: Google Assistant → Webhooks
3. Webhook URL: `https://figgy.gofig.ca/api/trpc/voice.createTask`
4. Method: POST, Content-Type: application/json
5. Body: `{"text": "{{TextField}}", "userEmail": "markie@gofig.ca"}`
6. Add header: `X-Voice-Token: gfb-voice-2026`

### 6. Emails in CRM
- **Recommendation:** Keep emails in CRM for visibility but don't try to replace Gmail
- The CRM pulls your Gmail inbox every 30 minutes
- You read and manage emails in Gmail, but see them in CRM for client context
- **Why:** Gmail on Android is better for reading/writing. CRM is for organizing by client.

## What You Need to Do Now

### 1. Deploy
```bash
git add .
git commit -m "Phase 1: morning briefing, voice agent, google sync"
git push origin main
```
Railway auto-deploys.

### 2. Set Google OAuth Credentials (in Railway dashboard)
- `GOOGLE_CLIENT_ID` — get from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — get from Google Cloud Console
- `VITE_APP_URL` — your Railway URL (e.g., `https://figgy.gofig.ca`)

**How to get Google credentials:**
1. Go to https://console.cloud.google.com
2. Create project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID (Web application)
4. Authorized redirect URI: `https://figgy.gofig.ca/api/oauth/google/callback`
5. Enable APIs: Gmail API, Calendar API, Tasks API
6. Copy Client ID and Secret to Railway env vars

### 3. Connect Your Google Account
1. Log into CRM
2. Go to Integrations
3. Click "Connect Google"
4. Label it "Personal Gmail"
5. Authorize
6. Done — sync starts automatically

### 4. Set Up Android Voice
Pick one of the 3 options above (IFTTT is easiest). Test with "Hey Google, add to my task list: call John tomorrow."

## What You'll See After Connect

**Dashboard:**
- Task counts by status
- Overdue + due today highlighted
- Morning Briefing card with quick link

**Morning Briefing Page:**
- Summary cards with counts
- Priority list with task names
- Today/overdue task lists
- Speak toggle for audio

**Calendar:**
- Google Calendar events appear automatically
- CRM tasks with due dates show as calendar events
- Monthly/weekly views

**Emails:**
- Gmail inbox synced every 30 min
- Filter by folder (inbox, sent, starred)
- Search by client or subject
- Read-only (manage in Gmail, view in CRM)

**Tasks:**
- All tasks from Google Tasks + CRM-created tasks
- Voice-created tasks appear immediately
- Priority + category filtering
- Recurring task support

## Next Phase Ideas

When you're ready:
- **QBO deeper sync:** Auto-import invoices, bills, payments
- **Client portal:** Let clients log in and see their files
- **Pipeline automation:** Lead → Discovery → Quote → Onboard
- **E-signature:** PDF engagement letters with signature
- **AI assistant:** Chat with Figgy about your clients

## Files Added/Changed

- `api/agent-router.ts` — morning briefing endpoint
- `api/voice-router.ts` — voice task creation + briefing
- `api/oauth-router.ts` — Google/Microsoft OAuth callbacks
- `api/google-sync.ts` — Gmail/Calendar/Tasks sync service
- `api/all-sync-scheduler.ts` — auto-sync every 30 min
- `api/boot.ts` — server routes + callback handlers
- `api/router.ts` — wired new routers
- `src/pages/MorningBriefing.tsx` — briefing page
- `src/components/Sidebar.tsx` — added briefing link
- `scripts/morning-briefing.sh` — cron script
- `VOICE_INTEGRATION.md` — Android setup guide

## Support

If something doesn't work:
1. Check Railway logs for errors
2. Verify env vars are set
3. Check that Google APIs are enabled
4. Try the APIs directly with curl (see VOICE_INTEGRATION.md)

You've got this. The foundation is solid now.
