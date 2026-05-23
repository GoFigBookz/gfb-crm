# 🌅 A Day in the Life — Markie Using GFB CRM

_This is YOUR workflow. Every feature built for how you actually work._

---

## ⏰ 7:00 AM — Coffee & Dashboard

You open the CRM. The **Command Center** shows:
- 🔴 **3 clients** with overdue items
- 📧 **12 unread emails** across all client accounts
- 📅 **4 meetings** today (2 client calls, 1 team sync, 1 discovery call)
- ⚡ **AI Daily Brief** is ready: "Aim Construction's HST is due Friday. West York's payroll journal looks off."

**You don't open QuickBooks. You don't open Gmail. You don't open Google Drive.**
Everything is here.

---

## ⏰ 7:15 AM — Master Triage (ONE Inbox for ALL Clients)

You click **Triage**.

**This is ONE inbox.** Not 30 separate client inboxes. Everything lands here first.

### Why One Inbox?
- Vendor emails YOU — they don't know which client it is
- Hubdoc captures — might be mis-tagged initially
- You see EVERYTHING in one place → prioritize across all 30 clients
- One click to assign client + vendor → auto-routes to their folder

### What Shows Up:
- 📎 **Aim Construction** uploaded 7 receipts via Hubdoc → "Review & post?" (confidence: 94%)
- 📊 **Stripe payout** for Clark Pools hit → "$4,247.50 deposited" (auto-matched)
- 🧾 **Jobber invoice** from Selective Painting → "Invoice #2847 paid via Interac" (needs client assignment)
- 📧 **Email from Sher-E-Punjab**: "Here's the missing bank statement" (auto-tagged by sender)
- ⚠️ **AI Flag**: "West York Paving — 3 transactions this week with no receipt attached"
- 🎯 **Unassigned**: "Home Depot $247.50 — 4 possible clients, pick one"

### What You Do:
1. **Click** the Aim Construction receipts → AI already read them, suggests accounts
   - Click ✅ Approve → posted to QBO + filed to `6 - Vendors > [Vendor Name]`
2. **Click** the Stripe payout → auto-matched to invoice, marked paid → ✅ Approve
3. **Click** the Jobber invoice → AI suggests "Selective Painting" but confidence is 72%
   - Click 🎯 Pick Client → "Selective Painting" from dropdown → then ✅ Approve
4. **Click** the missing bank statement → downloaded, filed to `4 - Statements`, reconciled
5. **Click** the AI flag → review the 3 transactions, send client portal request for receipts
6. **Click** the unassigned Home Depot → see mini-cards: "Aim (last purchase May 10), Clark Pools (May 18), West York (April 28), Selective (Feb 3)"
   - Pick "Clark Pools" → AI learns: "Home Depot + $247 + May = likely Clark Pools"

### After You Approve:
- Item LEAVES Master Triage → posted + filed
- You see: "11 items remaining" (not 12 anymore)
- Client dashboard updates: "Aim Construction: Last receipt 2 min ago"

**Time spent: 20 minutes. Zero app-switching.**

---

## ⏰ 7:45 AM — QuickBooks Connectors (The New Stuff!)

You click **Integrations**.

### What You See:

**Connected QBO Companies:**
- ✅ **Aim Construction Inc.** (CA Clients) → synced 2 hours ago
- ✅ **Align Plumbing Inc.** (CA Clients) → synced 1 hour ago  
- ⚠️ **NEW: West York Paving Ltd.** — "Click to assign client"
- ⚠️ **NEW: Kaavio (Fleming)** — "Click to assign client"

### The Assignment Flow:
1. **Click** West York Paving → dropdown shows your client list
2. **Pick** "West York Paving Ltd." from the list
3. **Click Assign** → ALL QBO data for that company now tagged to that client
   - 47 invoices → tagged to West York
   - 12 payments → tagged to West York  
   - 3 customers → tagged to West York
4. **Sync runs automatically** → data appears in West York's client page

### What If You Don't Know Yet?
- **Leave it unassigned** → goes to **QBO Triage** for later review
- **Or** click "I'm not sure" → AI suggests which client based on company name matching

---

## ⏰ 8:00 AM — Client Deep Dive (West York Paving)

You click **Clients → West York Paving Ltd.**

### What You See:

**Client Card:**
- 📊 **P&L Snapshot** (pulled from QBO): Revenue $127K, Expenses $89K, Net $38K
- 📈 **Health Score**: 94/100 (green — books are clean!)
- 💰 **Monthly Fee**: $175/month (you see this at a glance)
- 🧾 **Missing Items**: 2 receipts needed for May
- 📅 **Deadlines**: HST due June 30, Payroll due June 15

**Recent Activity Timeline:**
- Today 6:00 AM → Stripe payout $4,247 → auto-posted
- Yesterday 4:00 PM → Email: "Need updated WCB certificate" → AI drafted reply
- May 20 → AI closed monthly books → you reviewed & approved

**QBO Data (synced live):**
- 📋 Invoices: 23 total, 4 unpaid ($12,400 outstanding)
- 💳 Payments: 19 payments this month
- 👥 Customers: 3 active in QBO

**Files Tab:**
- `1 - Company Documentation`
- `2 - Tax Filings` (HST, Payroll, WSIB, Dividends)
- `3 - Year-End Financials`
- `4 - Statements`
- `5 - Triage` (stuff waiting for you)

---

## ⏰ 8:30 AM — Per-Client Connectors (Wise, Stripe, etc.)

You click **Integrations → Stripe**

### What You See:

**Stripe Connections (per client):**
- ✅ **Clark Pools Collingwood** → last sync: today 6:00 AM
- ✅ **Originality.AI** → last sync: yesterday 11:00 PM
- ⚠️ **Dark Horse Intelligence** → "API key expired — click to refresh"

### Monthly Statement Pull:
1. **Click** "Pull May Statements" for all Stripe clients
2. **System runs:**
   - Connects to Stripe API for each client
   - Pulls balance transactions, payouts, fees
   - Calculates: Revenue, Expenses, Fees, Net
   - Stores in `connector_statements` table
   - Tags everything with the right `clientId`
3. **Results:**
   - Clark Pools: $8,200 revenue, $0 fees, 12 transactions
   - Originality.AI: $12,500 revenue, $375 fees, 23 transactions
   - Dark Horse: ⚠️ failed — API key expired

### What You Do:
- **Review** the statement summaries
- **Click** into any client → see every transaction
- **Match** Stripe payouts to QBO invoices → auto-reconcile
- **Fix** Dark Horse API key → re-enter in Integrations tab → re-sync

---

## ⏰ 9:00 AM — Email Inbox (Unified!)

You click **Emails**.

### What You See:

**Unified Inbox** — all client emails in ONE place:
- 📧 **markie@gofig.ca** → 3 new
- 📧 **marquee.antil@gmail.com** → 5 new
- 📧 **Client: Aim Construction** → 1 new (forwarded to you)
- 📧 **Client: West York** → 2 new

### Sender Rules (Auto-Tagging):
- Email from `accounting@aimconstruction.ca` → auto-tagged "Aim Construction"
- Email from `boss@westyork.com` → auto-tagged "West York Paving"
- Email from CRA → auto-tagged "Government / Tax"

### AI Drafts Waiting:
- **Aim Construction**: "Following up on missing May receipts" → AI drafted, you click Send
- **West York**: "HST filing reminder for June 30" → AI drafted, you review, Send

**You NEVER open Gmail.** You reply from here. The client sees it coming from your email. The reply is auto-filed to that client's email folder.

---

## ⏰ 9:30 AM — Discovery Call (New Lead)

A potential client called: **"Seaside Cafe, Collingwood"**

### What You Do:
1. **Click** "New Client" → Discovery Form
2. **Fill out** (or let AI transcribe the call):
   - Business name: Seaside Cafe
   - Owner: Sarah Jenkins
   - Email: sarah@seasidecafe.ca
   - Business number: [blank — you get this later]
   - HST frequency: Monthly
   - Payroll: Yes, 4 employees
   - Software: Currently using Excel 😱
   - Pain points: "I spend 6 hours a week on bookkeeping"
3. **AI calculates:**
   - Recommended fee: $350/month
   - Scope: Full bookkeeping + payroll + HST
   - ROI: "You'll save 20 hours/month — worth $800+ in your time"
4. **Click** "Generate Proposal" → fillable PDF engagement letter
5. **Send** via email from the CRM

**Client gets:** Professional proposal, fee breakdown, scope of work, next steps.
**You get:** Client added to pipeline, follow-up task auto-created for next week.

---

## ⏰ 10:00 AM — Payroll Day (Align Plumbing)

You click **Clients → Align Plumbing → Payroll**

### What You See:

**Payroll Dashboard:**
- 📅 Period: May 15 — May 31
- 👥 6 employees
- 💰 Gross payroll: $8,400
- 🏛️ Source deductions: $1,247
- 🏗️ WSIB: $420
- 🧾 Net pay: $6,733

### What You Do:
1. **Review** the payroll journal (AI prepped it from time entries)
2. **Click** "Sync with QBO" → payroll entries auto-posted to QBO
3. **Click** "Generate PD7A" → form auto-filled with numbers
4. **Click** "File with CRA" → (in future: API filing. For now: download, upload to CRA)
5. **Click** "Notify Client" → AI draft: "Payroll processed. Net pay $6,733. PD7A filed."

---

## ⏰ 10:30 AM — Monthly Close (Aim Construction)

You click **Monthly Close**.

### What You See:

**May 2026 Close Checklist:**
- ✅ Bank statements reconciled
- ✅ Credit card statements reconciled  
- ✅ All receipts processed (AI found 23, you approved)
- ✅ AP reviewed
- ✅ AR reviewed
- ✅ Payroll journal verified
- ✅ Source deductions confirmed
- ✅ HST tracked
- ⚠️ Owner transactions: 1 unclear → "Lunch at Boston Pizza $47 — business or personal?"
- ✅ Adjusting entries posted
- ✅ P&L reviewed
- ✅ Balance sheet reviewed
- ✅ Bank rec matches balance sheet
- ✅ Financials uploaded to Drive
- ✅ Client notified

### What You Do:
1. **Click** the unclear lunch charge
2. **Tag** it: "Personal — owner draw" → auto-moved to owner transactions
3. **Click** "Complete Close" → checklist 100%
4. **System:**
   - Generates P&L, Balance Sheet, Cash Flow
   - Uploads to Google Drive: `3 - Year-End Financials > 01 - Financials`
   - Sends client email: "May books are closed. Here's your summary."
   - Creates June close checklist (auto-scheduled)

---

## ⏰ 11:00 AM — Calendar (Unified!)

You click **Calendar**.

### What You See:

**Unified Calendar:**
- Your personal Google Calendar
- Your business Google Calendar
- Client meetings (from your CRM)
- Deadlines (HST due dates, payroll dates, year-end dates)

**Today:**
- 11:00 AM → Team sync (Google Meet link)
- 1:00 PM → Client call: West York Paving (reminder: bring up HST)
- 3:00 PM → Discovery call: Seaside Cafe (follow-up from morning)
- 4:00 PM → Deadline reminder: Dark Horse payroll journal

### What You Do:
- **Click** any event → see client context, recent activity, notes
- **Add** "Bring WCB certificate" to the West York meeting notes
- **Reschedule** the Seaside Cafe call → drag to tomorrow

---

## ⏰ 11:30 AM — AI Agent Runs (Background Magic)

While you're in meetings, AI is working:

### What's Happening:
- 🤖 **Email Agent**: Reading all new emails, drafting replies, flagging urgent
- 🤖 **Receipt Agent**: Processing Hubdoc uploads, reading PDFs, suggesting accounts
- 🤖 **Reconciliation Agent**: Matching bank transactions to invoices, flagging discrepancies
- 🤖 **Deadline Agent**: Checking all client deadlines, sending reminders

### You Check In:
- **3 new AI findings** waiting for review
  - "Aim Construction: $2,400 payment from 'ABC Supply' — no matching invoice. Create one?"
  - "West York: HST filing deadline is June 30 — 10 days away"
  - "Stripe: Dark Horse payout failed — investigate"

### What You Do:
- **Approve** the payment match → AI creates the invoice
- **Snooze** the HST reminder → remind me June 25
- **Fix** the Dark Horse issue → update API key, re-sync

---

## ⏰ 1:00 PM — Client Call (West York Paving)

You click **Clients → West York → Start Call**.

### What You See (Call Prep Screen):
- 📊 **Last month P&L** (ready to screenshare)
- 🧾 **Missing items** (2 receipts, 1 bank statement)
- 📅 **Upcoming deadlines** (HST June 30)
- 📝 **Last conversation notes**: "They want to discuss year-end planning"

### During the Call:
- **Screenshare** the P&L from the CRM
- **Click** "Request Missing Items" → sends client portal link
- **Click** "Add Note" → "Discussed year-end. They want to buy a new truck. Need to plan depreciation."
- **Click** "Create Task" → "Calculate truck depreciation options for next call"

---

## ⏰ 2:00 PM — Tasks & Time Tracking

You click **Tasks**.

### What You See:

**Your Task List:**
- 🔴 **Urgent**: Dark Horse API key expired (from this morning)
- 🟡 **Today**: Review Seaside Cafe proposal
- 🟢 **This week**: Prepare West York year-end planning
- 🔵 **Recurring**: Monthly close for 3 clients (June 1-5)

### Time Tracking:
- **Start timer** on "West York client call" → 1 hour
- **Stop** → auto-logged to West York's time entries
- **System calculates**: "This call cost the client $175 (your hourly rate). Added to next invoice."

---

## ⏰ 3:00 PM — Client Portal Check

You click **Portal**.

### What You See:

**Client Portal Activity:**
- 👤 **Aim Construction**: Logged in yesterday, uploaded 2 receipts
- 👤 **West York**: Viewed May P&L, didn't upload missing items yet
- 👤 **Align Plumbing**: Downloaded engagement letter, signed digitally
- 👤 **New: Seaside Cafe**: Portal invite sent, pending signup

### What You Do:
- **Send reminder** to West York: "Hey! Still need those 2 receipts for May close"
- **Review** Aim's new receipts → approve, file, done
- **Check** Align's signature → ✅ received, filed in `1 - Company Documentation`

---

## ⏰ 4:00 PM — Daily Wrap-Up

You click **Dashboard**.

### What You See:

**Today's Wins:**
- ✅ Triage: 12 items processed
- ✅ QBO sync: 2 companies updated
- ✅ Stripe statements: 2 clients pulled
- ✅ Monthly close: Aim Construction done
- ✅ New client: Seaside Cafe proposal sent
- ✅ Client call: West York — 1 hour logged

**Tomorrow's Focus (AI Suggested):**
- 🔴 Dark Horse API fix + re-sync
- 🟡 Follow up Seaside Cafe
- 🟡 West year-end planning prep
- 🟢 June close checklist for 3 clients

**Notifications Sent:**
- 📧 4 client emails sent
- 📱 2 portal reminders
- 📊 1 monthly close summary delivered

---

## ⏰ 4:30 PM — Log Off

You close the CRM. 

**Nothing else is open.** No QuickBooks. No Gmail. No Google Drive. No Hubdoc. No Stripe dashboard. No spreadsheets.

**Everything was in one place.**

---

## 🎯 Key Principles

### 1. **Triage First**
Everything lands in Triage. You review, approve, assign. Nothing gets lost.

### 2. **Auto-Assignment**
When you connect a QBO/Wise/Stripe account, you pick the client ONCE. Everything auto-tags. Retroactive assignment works too.

### 3. **AI Does the Heavy Lifting**
- Reads receipts
- Drafts emails
- Matches transactions
- Flags discrepancies
- Calculates fees
- Generates reports

**You review and approve.** You don't do the grunt work.

### 4. **One Source of Truth**
Every client has ONE page with everything: QBO data, emails, files, calendar, tasks, time, portal activity.

### 5. **Client Portal = Self-Service**
Clients upload docs, view reports, sign agreements, see deadlines — without bugging you.

---

## 🚀 What This Replaces

| Old Way | New Way |
|---------|---------|
| QuickBooks + Gmail + Drive + Hubdoc + Stripe + 10 tabs | **One CRM** |
| Manually matching receipts to transactions | **AI auto-matches, you approve** |
| Writing emails from scratch | **AI drafts, you edit/send** |
| Chasing clients for missing docs | **Portal + auto-reminders** |
| Spreadsheets for tracking | **Built-in dashboards + reports** |
| Guessing which client a QBO file belongs to | **Pick once, auto-tags forever** |
| Monthly close = 3 hours | **Monthly close = 30 minutes** |

---

## 💬 Markie's Day: Summary

**Time in CRM:** ~6 hours
**Time saved vs old way:** ~4 hours (no app switching, AI doing grunt work)
**Clients touched:** 6
**New business:** 1 proposal sent
**Monthly closes completed:** 1
**Things that fell through cracks:** ZERO

**This is what a modern bookkeeping practice looks like.** 🔥
