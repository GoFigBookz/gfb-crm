# 🔀 RECEIPT-TO-POSTED WORKFLOW (v2 — Matches Real Drive Structure)

_The exact path every document takes through your system. Updated to match your actual GFB Drive folders._

---

## 📁 YOUR REAL FOLDER STRUCTURE

```
Finance - [Client Name]/
├── 1 - Company Documentation/
│   └── Engagement Letters & Legal/
├── 2 - Tax Filings/
│   ├── HST/
│   ├── Payroll/
│   ├── WSIB/
│   ├── Dividends/
│   └── Corp Tax/
├── 3 - Year-End Financials/
│   ├── 01 - Financials (Your work for accountant)/
│   └── 02 - Accountant (Adjusting entries back)/
├── 4 - Statements/
├── 5 - Triage/                    ← PER-CLIENT staging (rarely used)
├── 6 - Vendors/                   ← ← RECEIPTS GO HERE
│   └── [Vendor Name]/
│       └── [Vendor]_[Invoice#]_[Date].pdf
├── 7 - Customers/
└── ARCHIVE (pre-2020)/
```

**But here's the key insight:**

---

## 🎯 MASTER TRIAGE (One Inbox for ALL Clients)

**NOT per-client triage.** One master triage queue where EVERYTHING lands first.

### Why Master Triage?

| Per-Client Triage (Bad) | Master Triage (Good) |
|---|---|
| 30 separate inboxes to check | One inbox, everything visible |
| Miss cross-client patterns | See "3 clients missing receipts" at once |
| Vendor emails you — who clicks into which client? | Auto-suggests client based on sender |
| Easy to forget a client's inbox | Can't miss anything — it's all here |
| No prioritization across clients | "Aim Construction HST due Friday" bubbles up |

---

## 📥 STEP 1: Document Arrives → Lands in MASTER TRIAGE

### Path A: Vendor Emails Receipt
```
Vendor "ABC Supply" emails receipt to: aim@gofig.ca
↓
Email lands in CRM MASTER TRIAGE (unassigned — no client yet)
↓
AI reads attachment (PDF, image, or photo)
↓
AI extracts: vendor name, date, amount, items, HST/GST
↓
AI suggests: "Likely Aim Construction (ABC Supply is known vendor)"
```

### Path B: Client Uploads to Portal
```
Client logs into Portal → clicks "Upload Receipts"
↓
Drags 7 photos from phone
↓
Client selects: "This is for Aim Construction"
↓
Files land in MASTER TRIAGE with client tag PRE-APPLIED
↓
AI reads each image, extracts data
```

### Path C: Hubdoc Auto-Capture
```
Aim Construction's credit card swiped at Home Depot
↓
Hubdoc (connected to bank) captures the transaction
↓
Lands in MASTER TRIAGE: "Home Depot - $247.50 — client unknown"
↓
AI: "Home Depot is vendor for 4 clients — needs assignment"
```

### Path D: Photo via WhatsApp/Text
```
Client texts you a photo of a receipt
↓
You forward it to the CRM
↓
Lands in MASTER TRIAGE: "from: [phone number] — client unknown"
↓
AI: "Unassigned — needs client + vendor"
```

### Path E: Email Forwarded by Client
```
Client forwards: "Here's the receipt from our plumber"
↓
AI reads the forwarded email + attachment
↓
Lands in MASTER TRIAGE with sender context
↓
Auto-suggests client based on email domain/sender name
```

---

## 🧠 STEP 2: AI Processing in Master Triage

```
Document lands in MASTER TRIAGE
↓
AI reads the document (OCR for images/PDFs, parsing for emails)
↓
Extracts:
  ✓ Vendor name: "ABC Supply"
  ✓ Date: May 15, 2026
  ✓ Amount: $1,247.50
  ✓ HST: $162.18
  ✓ Total: $1,409.68
  ✓ Items: "Lumber, drywall screws, primer"
↓
AI looks up CLIENT MASTER for vendor "ABC Supply":
  → Found: ABC Supply = vendor for Aim Construction
  → Confidence: 94%
↓
AI suggests:
  Client: Aim Construction
  Account: "5-5100 Materials & Supplies"
  HST: "HST-ON-13%"
  Vendor folder: 6 - Vendors/ABC Supply/
↓
If vendor found in MULTIPLE clients:
  → "ABC Supply services 3 clients — which one?"
  → You pick from dropdown
↓
If vendor NOT FOUND:
  → "New vendor — which client?"
  → You assign client + create vendor folder
```

---

## 🎯 STEP 3: Triage Review (Your Action Required)

You open **MASTER TRIAGE** and see ALL unassigned items across ALL clients:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🧾 MASTER TRIAGE — 12 items need attention                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ [🔴 HIGH] ABC Supply — $1,409.68 → Suggested: Aim Construction          │
│   AI Confidence: 94% | Vendor: Known | Client: AIM                      │
│   [✅ Approve & Post] [📝 Edit] [❌ Reject] [⏸️ Save]                    │
│                                                                         │
│ [🟡 MED] Home Depot — $247.50 → Suggested: 3 clients                    │
│   AI: "Home Depot found for Aim, West York, Clark Pools"                │
│   [🎯 Pick Client ▼] [📝 Edit] [❌ Reject]                              │
│                                                                         │
│ [🟡 MED] Stripe Payout — $4,247.50 → Client: Clark Pools (auto)       │
│   From Stripe webhook | Matched to invoice #2847                        │
│   [✅ Approve & Reconcile] [📝 Review]                                  │
│                                                                         │
│ [🔴 HIGH] Missing receipt — 3 transactions at Boston Pizza            │
│   Client: Unknown | Need vendor + assignment                          │
│   [🎯 Assign] [⏸️ Request from Client]                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Priority Sorting:
- 🔴 **High**: Known vendor + known client → one-click approve
- 🟡 **Medium**: Known vendor + multiple clients → pick client
- 🟠 **Low**: Unknown vendor → assign client + vendor from scratch
- ⚪ **Info**: Auto-matched items (Stripe, etc.) → quick verify

---

## ✅ STEP 4: You Click Approve → What Happens

```
You click ✅ Approve for ABC Supply receipt
↓
System:

  1. POSTS TO QBO (Aim Construction's realm):
     {
       Vendor: ABC Supply
       Account: 5-5100 Materials & Supplies
       Amount: $1,247.50 + $162.18 HST
       Date: May 15, 2026
       Bill #2847 created
     }

  2. FILES IN GOOGLE DRIVE:
     GFB Clients/
     └── Finance - Aim Construction/
         └── 6 - Vendors/
             └── ABC Supply/
                 └── ABC_Supply_2847_2026-05-15.pdf

  3. REMOVES from Master Triage
     → Item archived with log: "Posted 2026-05-23 9:47 AM by Markie"

  4. UPDATES CLIENT DASHBOARD:
     "Aim Construction: Last receipt 2 min ago"
     "May expenses: +$1,409.68"

  5. CHECKS MISSING ITEMS:
     → If this was flagged as missing → auto-checks off
```

---

## 📁 PER-CLIENT TRIAGE (Folder 5 - Triage) — RARELY USED

**Master Triage is for 95% of items.** But `5 - Triage/` exists per-client for:

- **Items YOU want to stage** before filing (e.g., "hold all May receipts until I batch-process")
- **Client-specific unknowns** the client uploaded directly to their portal
- **Items waiting for clarification** (e.g., "what project was this for?")

**Rule:** Items should not SIT in per-client Triage. They're either:
- Approved → move to 6 - Vendors/[Vendor]/
- Rejected → archive or trash
- Waiting → master triage with "⏸️ Save" status

---

## 🔄 THE COMPLETE FLOW (Visual)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCUMENT ARRIVES                             │
│  (Email / Portal / Hubdoc / Photo / Forwarded / Bank Feed)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 MASTER TRIAGE (ONE INBOX)                       │
│  • All unassigned items across ALL clients                       │
│  • AI suggests client + vendor + account                       │
│  • Sorted by priority (known → unknown)                        │
│  • You see: "12 items need attention today"                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   YOU REVIEW & APPROVE                          │
│  • Click ✅ (known vendor + client) → auto-posts               │
│  • Click 🎯 (pick client) → dropdown → then post             │
│  • Click 📝 (edit) → adjust account/amount → then post       │
│  • Click ❌ (reject) → archive, no post                        │
│  • Click ⏸️ (save) → stays in triage for later                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              POST TO QBO + FILE TO DRIVE                        │
│  QBO: Creates bill in client's realm                            │
│  Drive: Saves to Finance - [Client]/6 - Vendors/[Vendor]/      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              BANK MATCHING (automatic next day)                 │
│  Bank transaction hits → AI matches to posted receipt           │
│  Links them → "Matched & Reconciled"                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 MASTER TRIAGE TABLE DESIGN

```sql
CREATE TABLE triage_queue (
  id INTEGER PRIMARY KEY,
  
  -- Source info
  source_type TEXT,        -- 'email', 'portal_upload', 'hubdoc', 'stripe', 'bank_feed', 'manual'
  source_id TEXT,          -- email ID, upload ID, etc.
  
  -- Document info (AI-extracted)
  vendor_name TEXT,
  vendor_id INTEGER,       -- linked to vendors table
  invoice_number TEXT,
  amount REAL,
  hst_amount REAL,
  total_amount REAL,
  transaction_date DATE,
  suggested_account TEXT,
  suggested_hst_code TEXT,
  
  -- Client assignment
  suggested_client_id INTEGER,  -- AI guess
  assigned_client_id INTEGER,   -- your final assignment
  confidence_score INTEGER,     -- 0-100
  
  -- File storage
  file_url TEXT,           -- Google Drive temp location
  file_name TEXT,
  mime_type TEXT,
  
  -- Status
  status TEXT,             -- 'pending', 'approved', 'rejected', 'saved', 'posted'
  action_taken TEXT,       -- 'posted_to_qbo', 'filed_to_drive', 'rejected_duplicate', etc.
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by INTEGER,   -- user ID
  posted_at TIMESTAMP,
  qbo_bill_id TEXT,        -- reference to QBO bill
  drive_file_id TEXT,      -- reference to Drive file
  
  -- Notes
  notes TEXT,              -- your notes or AI flags
  ai_suggestion TEXT       -- full AI reasoning
);
```

---

## 📊 MASTER TRIAGE DASHBOARD (What You See)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ MASTER TRIAGE — Thursday, May 23, 2026                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ SUMMARY CARDS:                                                          │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│ │ 12           │ │ 7            │ │ 3            │ │ 2            │  │
│ │ Pending      │ │ Ready to     │ │ Need Client  │ │ Saved for    │  │
│ │              │ │ Approve      │ │ Assignment   │ │ Later        │  │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
│ BY CLIENT:                                                              │
│ • Aim Construction: 3 items (2 ready, 1 needs client)                   │
│ • Clark Pools: 4 items (all from Stripe webhook)                        │
│ • West York: 2 items (1 ready, 1 saved)                                 │
│ • Unassigned: 3 items (need your input)                                │
│                                                                         │
│ BY VENDOR:                                                              │
│ • ABC Supply: 2 receipts                                              │
│ • Home Depot: 3 receipts (2 clients possible)                           │
│ • Stripe: 4 payouts                                                    │
│ • Unknown: 3 new vendors                                              │
│                                                                         │
│ BY AGE:                                                                 │
│ • Today: 5 items                                                        │
│ • Yesterday: 4 items                                                  │
│ • 2-3 days: 2 items                                                     │
│ • >3 days: 1 item (FLAGGED)                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚫 EXCEPTIONS IN MASTER TRIAGE

### Exception 1: Wrong Client Auto-Assigned
```
AI suggests: "Aim Construction" for ABC Supply receipt
But YOU know: "This was actually for West York (shared vendor)"
↓
Click: 🎯 Pick Client → "West York Paving"
↓
System:
  1. Updates suggestion to West York
  2. Re-files to: Finance - West York/6 - Vendors/ABC Supply/
  3. Posts to QBO West York realm (not Aim)
  4. Logs: "Reassigned by Markie: Aim → West York"
```

### Exception 2: Multi-Client Vendor
```
Vendor: "Home Depot" → serves 4 clients
↓
Triage shows: "Home Depot $247.50 — 4 possible clients"
↓
You see mini-cards:
  • Aim Construction (last purchase: May 10)
  • West York (last purchase: April 28)
  • Clark Pools (last purchase: May 18) ← MOST LIKELY
  • Selective Painting (last purchase: Feb 3)
↓
Click: "Clark Pools" → system learns: "Home Depot + $247 + May = likely Clark Pools"
```

### Exception 3: Item Stuck in Triage > 3 Days
```
Item: "Unknown vendor, blurry photo, $47"
Age: 5 days
↓
System flags: "⏰ STALE ITEM — 5 days old"
↓
Auto-actions:
  1. Sends you notification: "1 item needs your attention"
  2. Offers: "Send to client portal for clarification?"
  3. Or: "Archive as "unresolved" and move on?"
↓
You choose → system learns from your choice
```

---

## 🎯 WHO DOES WHAT?

| Step | System (AI) | You (Markie) |
|------|-------------|--------------|
| Document arrives | Captures, OCR, extracts | — |
| Lands in Master Triage | Auto-suggests client + vendor | — |
| Confidence < 90% | Flags for your review | — |
| Known vendor/client | Shows "✅ Ready to Approve" | Click approve (5 sec) |
| Multi-client vendor | Shows "🎯 Pick Client" | Pick from dropdown (10 sec) |
| Unknown vendor | Shows "📝 Needs Assignment" | Assign client + vendor (30 sec) |
| Post to QBO | API call, create bill | — |
| File to Drive | Upload to 6 - Vendors/[Vendor]/ | — |
| Bank matching | Auto-match next day | Review mismatches |
| Stale items | Flag after 3 days | Decide: archive / chase / fix |

**Your time per receipt: 5-30 seconds depending on complexity.**
**AI handles: extraction, suggestion, filing, posting, matching.**

---

## ✅ THE BOTTOM LINE

**ONE Master Triage inbox. Everything lands there. AI suggests client + vendor. You click approve. System posts to QBO and files to `6 - Vendors/[Vendor]/` in the RIGHT client's folder.**

**Per-client `5 - Triage/` is for client-specific staging only — not the main workflow.**

**Your touch points:**
1. Open Master Triage → see everything (10 seconds)
2. Click approve on known items (5 seconds each)
3. Pick client for ambiguous items (10 seconds each)
4. Monthly close review (30 minutes)

**Everything else is automatic.** 🔥
