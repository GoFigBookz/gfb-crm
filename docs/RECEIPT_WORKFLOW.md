# 🔀 RECEIPT-TO-POSTED WORKFLOW

_The exact path every document takes through your system._

---

## 📥 STEP 1: Document Arrives (5 Ways)

### Path A: Vendor Emails Receipt
```
Vendor "ABC Supply" emails receipt to: aim@gofig.ca
↓
Email lands in CRM Unified Inbox (auto-tagged "Aim Construction")
↓
AI reads attachment (PDF, image, or photo)
↓
AI extracts: vendor name, date, amount, items, HST/GST
```

### Path B: Client Uploads to Portal
```
Client logs into Portal → clicks "Upload Receipts"
↓
Drags 7 photos from phone
↓
Files land in Triage with client tag pre-applied
↓
AI reads each image, extracts data
```

### Path C: Hubdoc Auto-Capture
```
Aim Construction's credit card swiped at Home Depot
↓
Hubdoc (connected to bank) captures the transaction
↓
Receipt appears in CRM Triage: "Home Depot - $247.50"
↓
AI suggests account: "5-5100 Job Materials"
```

### Path D: Photo via WhatsApp/Text
```
Client texts you a photo of a receipt
↓
You forward it to the CRM (or AI reads it directly)
↓
File lands in Triage with "from: [client phone]"
↓
AI extracts and suggests
```

### Path E: Email Forwarded by Client
```
Client forwards: "Here's the receipt from our plumber"
↓
AI reads the forwarded email + attachment
↓
Tags: client + vendor + suggests account
```

---

## 🧠 STEP 2: AI Processing (Happens Automatically)

```
Document lands in Triage
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
AI looks up vendor in CLIENT MASTER:
  "ABC Supply" → known vendor for Aim Construction
  → Suggests account: "5-5100 Materials & Supplies"
  → Suggests HST code: "HST-ON-13%"
↓
AI checks for duplicates:
  "Same receipt already posted on May 15?" → NO
↓
AI confidence score: 94%
```

---

## 🎯 STEP 3: Triage Review (Your Action Required)

You open **Triage** and see:

```
┌─────────────────────────────────────────────────────────┐
│ 🧾 NEW RECEIPT — Aim Construction                       │
│ From: ABC Supply <invoices@abcsupply.ca>               │
│ Date: May 15, 2026                                      │
│ Amount: $1,409.68 (incl. $162.18 HST)                  │
│                                                         │
│ AI Suggests:                                            │
│   Account: 5-5100 Materials & Supplies                  │
│   Vendor: ABC Supply (known)                            │
│   HST: 13% Ontario                                      │
│   Confidence: 94%                                       │
│                                                         │
│ [✅ Approve & Post]  [📝 Edit]  [❌ Reject]  [⏸️ Save]   │
└─────────────────────────────────────────────────────────┘
```

### What You Do:

**Option 1: Approve (90% of the time)**
```
Click ✅ Approve
↓
System:
  1. Creates bill in QBO (aim_construction_realm)
     - Vendor: ABC Supply
     - Account: 5-5100 Materials & Supplies
     - Amount: $1,247.50 + $162.18 HST
     - Date: May 15, 2026
     - Memo: "Job materials - invoice #2847"
  
  2. Files receipt in Google Drive:
     → GFB Clients > Finance - Aim Construction > 2 - Tax Filings > Receipts > 2026-05 > ABC_Supply_2847.pdf
  
  3. Marks Triage item: ✅ POSTED
  
  4. Updates client dashboard:
     "Last receipt processed: 2 minutes ago"
     "May expenses: +$1,409.68"
  
  5. If this was a missing item → checks it off the missing items list
```

**Option 2: Edit (8% of the time)**
```
Click 📝 Edit
↓
You adjust:
  - Account: "5-5200 Subcontractors" (not materials)
  - Add note: "This was actually for the sub trade, not direct materials"
  - Split: $1,000 to materials, $409.68 to sub trade
↓
Click ✅ Approve → same posting flow but with YOUR edits
```

**Option 3: Reject (1% of the time)**
```
Click ❌ Reject
↓
Options:
  - "Not a business expense" → move to personal/client notes
  - "Duplicate" → mark as dup, don't post
  - "Wrong client" → reassign to different client
  - "Need more info" → send portal request: "What was this for?"
```

**Option 4: Save for Later (1% of the time)**
```
Click ⏸️ Save
↓
Receipt stays in Triage with tag: "Waiting for clarification"
↓
You add note: "Need to confirm if this was for Job A or Job B"
↓
Client gets portal notification: "1 receipt needs your input"
```

---

## 📊 STEP 4: QBO Posting (What Actually Happens)

```
You clicked Approve
↓
System connects to QBO API (Aim Construction's realm)
↓
POST /v3/company/{realmId}/bill
{
  "VendorRef": { "value": "123", "name": "ABC Supply" },
  "APAccountRef": { "value": "33", "name": "Accounts Payable" },
  "TxnDate": "2026-05-15",
  "DueDate": "2026-06-15",
  "TotalAmt": 1409.68,
  "Line": [
    {
      "Description": "Lumber, drywall screws, primer",
      "Amount": 1247.50,
      "DetailType": "AccountBasedExpenseLineDetail",
      "AccountBasedExpenseLineDetail": {
        "AccountRef": { "value": "5100", "name": "Materials & Supplies" },
        "TaxCodeRef": { "value": "13", "name": "HST ON 13%" }
      }
    }
  ]
}
↓
QBO responds: Bill #2847 created
↓
System stores: QBO bill ID, posting timestamp, your user ID
↓
Receipt marked: ✅ POSTED TO QBO
```

---

## 📁 STEP 5: Drive Filing (Automatic)

```
Receipt posted to QBO
↓
System uploads to Google Drive:

Path: 
GFB Clients/
└── Finance - Aim Construction/
    └── 2 - Tax Filings/
        └── Receipts/
            └── 2026-05/
                └── ABC_Supply_2847_2026-05-15.pdf

Naming convention: {Vendor}_{Invoice#}_{Date}.{ext}

If vendor folder doesn't exist → creates it
If month folder doesn't exist → creates it
If file already exists → appends _2, _3, etc.
```

---

## 🔄 STEP 6: Transaction Matching (If Bank Feed Exists)

```
Receipt posted: ABC Supply $1,409.68
↓
Bank transaction comes in: "ABC SUPPLY $1,409.68" on May 18
↓
AI matches:
  - Amount: exact match $1,409.68
  - Vendor: ABC Supply = ABC SUPPLY (fuzzy match)
  - Date: within 5 days (May 15 vs May 18)
  - Confidence: 97%
↓
System:
  1. Links receipt to bank transaction
  2. Marks: "Matched & Reconciled"
  3. Shows in reconciliation: "✅ ABC Supply $1,409.68 — receipt attached"
↓
If NO match found after 7 days:
  → Flags in Triage: "Receipt posted but no matching bank transaction"
  → You check: "Did they pay by credit card? Is this a different account?"
```

---

## 📋 STEP 7: Monthly Close Impact

```
May 31 — Monthly Close for Aim Construction
↓
System checks:
  ✅ All receipts posted? 23/23 receipts processed
  ✅ All bank transactions matched? 47/47 matched
  ✅ Missing items? 0 missing
  ✅ HST tracked? $2,147.32 total HST collected
↓
System generates:
  - P&L: Revenue $89,400 | Expenses $67,200 | Net $22,200
  - Balance Sheet: Assets $45,000 | Liabilities $12,000
  - Cash Flow: +$8,400 this month
↓
Files to Drive:
  → 3 - Year-End Financials/01 - Financials/2026-05_P&L_AimConstruction.pdf
  → 3 - Year-End Financials/01 - Financials/2026-05_BalanceSheet_AimConstruction.pdf
↓
Sends to client:
  "May books are closed. Here's your summary. Revenue up 12% vs April."
```

---

## 🚫 EXCEPTIONS: When Things Go Wrong

### Exception 1: Receipt Has No Vendor Name
```
Photo of receipt is blurry, no vendor name visible
↓
AI confidence: 34% (too low to auto-post)
↓
Triage shows:
  ⚠️ "Vendor unclear — please review"
  [📝 Edit] → you type: "Tim Hortons"
  [🔍 Search] → system looks up: "Is there a Tim Hortons transaction for $47?"
↓
If found match → auto-populate vendor, post
If not found → you assign account manually
```

### Exception 2: Wrong Client Tagged
```
Receipt from "ABC Supply" tagged to "West York Paving"
↓
You click: "Wrong Client" → dropdown → "Aim Construction"
↓
System:
  1. Moves receipt file from West York folder to Aim Construction folder
  2. Deletes QBO bill from West York's realm
  3. Creates QBO bill in Aim Construction's realm
  4. Re-tags everything
  5. Logs: "Reassigned from West York → Aim Construction by Markie"
```

### Exception 3: Duplicate Receipt
```
Same ABC Supply receipt uploaded twice (client emailed + Hubdoc captured)
↓
AI detects: "Similar document found — May 15, ABC Supply, $1,409.68"
↓
Triage shows:
  ⚠️ "Possible duplicate of #2847 (already posted May 15)"
  [🔗 View Original]  [❌ Reject Duplicate]  [✅ Post Anyway]
↓
You click: ❌ Reject Duplicate
↓
System: marks as dup, doesn't post, keeps for records
```

### Exception 4: Partial Payment
```
Receipt: ABC Supply invoice #2847 for $1,409.68
Bank transaction: ABC SUPPLY $1,000.00
↓
System flags: "Partial payment — $409.68 remaining"
↓
Triage:
  "Invoice #2847 partially paid. Remaining balance: $409.68"
  [💰 Mark as Partially Paid]  [⏸️ Wait for Rest]  [📝 Adjust Invoice]
↓
You click: 💰 Mark as Partially Paid
↓
QBO updated: Bill #2847 shows paid $1,000, balance $409.68
```

### Exception 5: Personal vs Business
```
Receipt from "Boston Pizza" for $47
↓
AI: "Could be business lunch or personal"
↓
Triage confidence: 52% (needs your judgment)
↓
You click: "Personal — Owner Draw"
↓
System:
  1. Does NOT post to QBO expense account
  2. Posts as: Owner Draw / Shareholder Loan
  3. Files in: 2 - Tax Filings > Owner Transactions
  4. Note: "Owner lunch — personal, not business deductible"
```

---

## 📊 THE COMPLETE FLOW (Visual)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DOCUMENT ARRIVES                                     │
│  (Email / Portal / Hubdoc / Photo / Forwarded)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI READS & EXTRACTS                                   │
│  • Vendor name     • Date        • Amount                                   │
│  • HST/GST         • Items       • Invoice #                                │
│  • Looks up vendor in master data                                           │
│  • Checks for duplicates                                                    │
│  • Suggests account & HST code                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRIAGE REVIEW                                        │
│  You see: vendor, amount, AI suggestion, confidence score                  │
│  Actions: ✅ Approve  📝 Edit  ❌ Reject  ⏸️ Save                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌─────────┐     ┌─────────┐     ┌─────────┐
              │ APPROVE │     │  EDIT   │     │ REJECT  │
              │  (90%)  │     │  (8%)   │     │  (2%)   │
              └────┬────┘     └────┬────┘     └────┬────┘
                   │               │               │
                   ▼               ▼               ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
         │ POST TO QBO  │  │ POST TO QBO  │  │ FILE ONLY    │
         │ (your edits) │  │ (as-is)      │  │ (no QBO)     │
         └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  │
                                  ▼
         ┌────────────────────────────────────────────┐
         │         FILE IN GOOGLE DRIVE               │
         │  GFB Clients > Finance - [Client] >       │
         │  2 - Tax Filings > Receipts > 2026-05    │
         └────────────────────┬───────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────────┐
         │      MATCH TO BANK TRANSACTION               │
         │  If bank feed: auto-match within 7 days      │
         │  If no match: flag for review                │
         └────────────────────┬───────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────────┐
         │       MONTHLY CLOSE CHECKLIST              │
         │  ✓ Receipt processed                         │
         │  ✓ Bank matched (or flagged)                 │
         │  ✓ HST tracked                               │
         └────────────────────────────────────────────┘
```

---

## 🎯 WHO DOES WHAT?

| Step | System (AI) | You (Markie) |
|------|-------------|--------------|
| Document arrives | Auto-captures, routes | — |
| Read & extract | OCR, parse, lookup vendor | — |
| Suggest account | Based on vendor history | — |
| Confidence check | Score >90% = auto-ready | — |
| Review | — | Click ✅, 📝, ❌, or ⏸️ |
| Post to QBO | API call, create bill | — |
| File in Drive | Upload, name, folder | — |
| Bank matching | Compare amounts/dates | Review mismatches |
| Monthly close | Generate reports | Review & approve |

**Your time per receipt: 15 seconds (approve) to 2 minutes (edit).**
**AI handles: 90% of the work before you even see it.**

---

## 📱 NOTIFICATIONS YOU GET

**Instant (as it happens):**
- "New receipt from ABC Supply — $1,409.68 (confidence: 94%)"
- "Dark Horse payout failed — API key expired"
- "Hubdoc: 3 new receipts for Clark Pools"

**Daily digest (8 AM):**
- "Yesterday: 12 receipts processed, 2 need your review"
- "West York: 1 unmatched bank transaction ($4,247.50)"
- "Aim Construction: HST filing due in 10 days"

**Weekly (Monday):**
- "This week: 67 receipts, 4 missing items, 1 monthly close pending"
- "Client health alerts: 2 clients with overdue items"

---

## 🔐 AUDIT TRAIL (Everything Is Logged)

Every action is tracked:
```
May 23, 2026 9:15 AM — Receipt #19e47135 received from ABC Supply
May 23, 2026 9:15 AM — AI processed: vendor=ABC Supply, amount=$1,409.68, confidence=94%
May 23, 2026 9:47 AM — Markie approved posting
May 23, 2026 9:47 AM — QBO bill #2847 created in Aim Construction
May 23, 2026 9:47 AM — File uploaded: GFB Clients/Finance - Aim Construction/2 - Tax Filings/Receipts/2026-05/ABC_Supply_2847.pdf
May 25, 2026 11:30 AM — Bank transaction matched: ABC SUPPLY $1,409.68
May 25, 2026 11:30 AM — Status: FULLY RECONCILED
```

**This is your proof for CRA. Every step documented.**

---

## ✅ THE BOTTOM LINE

**Vendor sends receipt → AI reads it → You click approve → Posted to QBO → Filed in Drive → Matched to bank → Monthly close done.**

**Your touch points:**
1. Review in Triage (15 seconds)
2. Edit if needed (2 minutes)
3. Monthly close review (30 minutes)

**Everything else is automatic.** 🔥
