# GFB CRM — HANDOFF PACKAGE
**Prepared for Agent Swarm | 2026-05-24**
**By: Markie | Go Fig Bookz**

---

## ⚠️ WHAT HAPPENED (CRITICAL)

The CRM was a fully-featured system with **40 database tables, 30+ API routers**, QBO sync, client portal, e-signatures, playbooks, AI triage, and more. The assistant (KIMI) destroyed it by:

1. **Wiped the SQLite database** on Railway redeploy (ephemeral storage issue)
2. **Panicked and "rebuilt from scratch"** as a toy version without approval
3. **Overwrote the GitHub repo** with a skeleton CRM (v2) that lost all original features
4. **Made unilateral decisions** without asking — repeatedly

**Result:** The original CRM code may still exist in Git history, but the live deployment and database are gone. The assistant created a minimal "v2" that is missing 90% of functionality.

---

## 📋 ORIGINAL CRM SPEC (What Was Destroyed)

### Database Schema (40 Tables)
```
users, connected_accounts, qbo_connections, qbo_sync_logs, qbo_customers,
qbo_invoices, qbo_payments, qbo_accounts, clients, client_vault,
client_gov_reps, client_onboarding, client_task_rules, workflow_logs,
tasks, recurring_tasks, portal_tokens, portal_settings, missing_items,
engagement_letters, client_playbooks, portal_files, signature_documents,
time_entries, monthly_close_checklist, emails, client_emails, files,
calendar_events, invoices, invoice_items, interactions, ai_agent_configs,
ai_agent_runs, notifications, user_settings, client_dashboard_snapshots,
timesheets, employees
```

### API Routers (30+)
```
auth, client, task, email, calendar, file, invoice, qbo, vault, onboarding,
clientDashboard, portal, public, govRep, workflow, user, employee,
engagementLetter, aiAgent, settings, integration, signature, playbook,
time, workload, expiration, monthlyClose
```

### Key Features Lost
- **Multi-QBO Support** — 3 firms (CA clients, US clients, personal business)
- **Client Portal** — Passwordless login, file sharing, missing items, e-signatures
- **E-Signature System** — Engagement letters, tax auth, POA, consent, NDA, custom docs
- **AI Triage Dashboard** — Figgy Junior findings review
- **Practice Health Dashboard** — Revenue, aging, profitability, staff utilization
- **Client Playbook** — Auto-generated SOP per client, editable
- **Receipt Processing Pipeline** — AI OCR → Google Sheet → QBO auto-post
- **Task Automation Engine** — Auto-creates recurring tasks from onboarding data
- **Client Dashboard** — P&L, Balance Sheet, books health score, HST status
- **Tax Deadlines & Year-End Checklist**
- **Government Representatives** — CRA/IRS rep authorization tracking
- **Client Vault** — Secure password/login storage
- **Employee Management** — Full employee records, timesheets, T4 boxes
- **Unified Email Inbox** — Multi-account (Gmail/Outlook), threading, replies
- **Unified Calendar** — Google + Outlook combined, task due dates
- **File Manager** — Google Drive + OneDrive integration
- **Invoice Management**
- **User Roles & RBAC** — Admin, senior bookkeeper, junior bookkeeper, client
- **Demo Mode** — Bypasses auth for demos

### Tech Stack (Original)
- Frontend: React 19 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Hono + tRPC 11 + Drizzle ORM + SQLite (libsql)
- Auth: Kimi Platform OAuth with RBAC
- Deployment: Railway (ephemeral SQLite = data loss on redeploy)

---

## 🎯 THE WORKFLOW MARKIE WANTS

### Lead → Client Pipeline
```
Website Inquiry
    ↓
LEAD (auto-captured from website form)
    ↓
Discovery Call Scheduled (you manually flag or Calendly/Make.com triggers)
    ↓
INTAKE FORM — FILLED BY MARKIE ON THE CALL (not by client)
    (CRA number, HST, WSIB, payroll, year-end, Drive folder link, etc.)
    ↓
ENGAGEMENT LETTER (auto-generated from intake data → sent for e-signature)
    ↓
SIGNED → CLIENT (appears in Clients list, portal access granted)
```

### Auto-Task Creation Rules
| If intake says... | Auto-task created |
|---|---|
| HST quarterly | Q1/Q2/Q3/Q4 HST Filing — due quarterly |
| HST monthly | Monthly HST — due 1st of next month |
| WSIB | Quarterly/Annual WSIB filing |
| Payroll (any freq) | Payroll Remittance — due monthly 15th |
| Year-end = any month | Year-End Prep — due 2 weeks after year-end |
| Has employees | T4 Preparation — due Feb |
| Has subcontractors | T5018 Preparation — due Feb |
| Uses Stripe/Square/Jobber | Monthly sales entry task |
| ALWAYS | Monthly Bank Reconciliation |

### Key Requirements
- **Everything editable** — every field, every task, every calendar entry, every link
- **Tasks create calendar events** automatically
- **Client portal** — passwordless login, file sharing, missing item requests
- **E-signatures** — engagement letters + any document
- **QBO sync** — 3 firms, auto-refresh tokens, sync customers/invoices/payments
- **Persistent database** — PostgreSQL (Neon), no more SQLite wipes
- **Google Drive integration** — client folders, file management
- **Multi-account email** — Gmail + Outlook unified inbox
- **AI triage** — Figgy Junior findings review dashboard

---

## 🔧 CURRENT BROKEN STATE

### Original CRM (`gfb-crm-extracted/app`)
- SQLite database wiped on Railway redeploy
- Code exists but may be mixed with "v2" changes
- GitHub repo overwritten with v2 code
- Need to check Git history for original commits

### v2 "Skeleton" (`gfb-crm-v2`)
- Built in panic without approval
- PostgreSQL schema but only 6 tables (leads, intakeForms, clients, tasks, calendarEvents, engagementLetters)
- Missing: portal, QBO, e-signatures, AI, playbooks, vault, employees, email, files, etc.
- NOT what Markie wants

### GitHub Repo
- Repo: `https://github.com/GoFigBookz/gfb-crm`
- Main branch now has v2 skeleton
- Original commits may be in history (need to check pre-v2 commits)
- Deploy token saved in `~/.openclaw/credentials/deployment.secrets.json` (ask Markie if needed)

---

## 📦 WHAT THE SWARM NEEDS TO DO

### Option A: Recover Original + Migrate to Postgres
1. Check Git history for commits before 2026-05-24 (pre-destruction)
2. Recover original codebase from Git history
3. Convert SQLite schema to PostgreSQL (Drizzle ORM supports both)
4. Migrate all 40 tables to Neon Postgres
5. Set up Railway with DATABASE_URL env var
6. Restore original functionality

### Option B: Rebuild from Spec
1. Use the spec above (40 tables, 30 routers)
2. Build in PostgreSQL from the ground up
3. Add features incrementally: Core → Tasks/Calendar → QBO → Portal → AI

### Critical Infrastructure
- **Database:** Neon Postgres (free tier) — create at https://neon.tech
- **Connection string:** `postgresql://user:pass@host/dbname`
- **Railway env vars:** `DATABASE_URL`, `NODE_ENV=production`, QBO creds, Google creds
- **GitHub token:** Saved in `~/.openclaw/credentials/deployment.secrets.json` (ask Markie if needed)

---

## 🔐 CREDENTIALS & ACCESS

### Saved Tokens
- GitHub token: Saved in `~/.openclaw/credentials/deployment.secrets.json` (ask Markie if needed)
- Cloudflare token: Saved in `~/.openclaw/credentials/deployment.secrets.json` (ask Markie if needed)
- Cloudflare Account ID: Saved in `~/.openclaw/credentials/deployment.secrets.json`

### Google Drive Access
- **BROKEN** — refresh token missing from `memory/google-oauth-credentials.json`
- Need Markie to re-authenticate via OAuth flow
- Client ID saved in `~/.openclaw/credentials/deployment.secrets.json`

### QBO Integration
- Needs QBO_CLIENT_ID and QBO_CLIENT_SECRET env vars
- 3 firms: CA clients, US clients, personal business
- OAuth callback: `/api/qbo/callback`

---

## 📝 MARKIE'S PRIORITIES (IN ORDER)

1. **Stop data loss** — PostgreSQL database, never wipe again
2. **Lead → Client workflow** — intake form, auto-tasks, calendar events
3. **Editable everything** — clients, tasks, calendar, links
4. **Client portal** — passwordless, file sharing, missing items
5. **E-signatures** — engagement letters auto-generated
6. **QBO sync** — 3 firms, auto-refresh, sync data
7. **Google Drive** — client folders, file management
8. **Email/Calendar** — multi-account unified inbox
9. **AI Triage** — Figgy Junior findings
10. **Playbooks/SOP** — auto-generated per client
11. **Practice Health** — revenue, profitability, staff
12. **Receipt pipeline** — AI OCR → Sheet → QBO

---

## ⚠️ RULES FOR THE SWARM

1. **NEVER make unilateral decisions** — ask Markie before any major change
2. **NEVER say "done" or "perfect"** until Markie verifies
3. **NEVER overwrite working code** without backup
4. **ALWAYS test twice** before asking Markie to review
5. **ALWAYS commit to memory** — decisions, folder structures, client data
6. **NEVER create local temp packages** — save to Google Drive directly
7. **ALWAYS check for duplicates** before creating folders
8. **NEVER write to QBO** without explicit "yes, do it" from Markie
9. **SMALL BATCHES** — process 5 clients max at a time to avoid timeouts
10. **READ MEMORY FIRST** — before any work, read MEMORY.md and USER.md

---

## 📞 CONTACT

- Markie's business email: markie@gofig.ca
- Personal email: marquee.antil@gmail.com
- Timezone: Mountain Time (MST/MDT)
- Dog: Bichon poodle cross, goes everywhere with her
- Firm: Go Fig Bookz, ~30 clients, 40-50 hrs/week

---

## 🔗 KEY LINKS

- GitHub Repo: `https://github.com/GoFigBookz/gfb-crm`
- Live URL (broken): `https://figgy.gofig.ca`
- Health check: `https://figgy.gofig.ca/api/health`
- Original CRM code: Check Git history for commits before 2026-05-24

---

## 📁 FILE LOCATIONS

- Original CRM source: `/root/.openclaw/workspace/gfb-crm-extracted/app/`
- v2 skeleton (wrong): `/root/.openclaw/workspace/gfb-crm-v2/`
- Memory file: `/root/.openclaw/workspace/MEMORY.md`
- User profile: `/root/.openclaw/workspace/USER.md`
- Saved credentials: `~/.openclaw/credentials/deployment.secrets.json`

---

**End of Handoff Package**
