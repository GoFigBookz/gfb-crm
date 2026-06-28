/**
 * MANUALS — the firm's in-app handbooks (Markie 2026-06-27).
 * THREE maintained manuals: the Bookkeeping Team manual (standard procedures; per-client
 * playbooks live separately, edited per client), the CRM manual (how to drive this app),
 * and the QuickBooks manual (how we keep the books in QBO). Content ships with the build
 * and is version-controlled — update it here as procedures change (engineering standard:
 * document while building, standardize anything repeated > 2×). No DB; the only stored
 * thing is each client's own playbook (client_playbooks table).
 */

export interface ManualSection { heading: string; body: string[]; }
export interface Manual { id: string; title: string; tagline: string; sections: ManualSection[]; }

const BOOKKEEPING_TEAM: Manual = {
  id: "bookkeeping",
  title: "Bookkeeping Team Manual",
  tagline: "Our standard procedures — how Go Fig Bookz does the books on every client.",
  sections: [
    {
      heading: "Golden rules (never break these)",
      body: [
        "Nothing posts to QuickBooks without Markie's review. Figgy proposes; a human approves.",
        "The chart of accounts is LOCKED. Never invent or guess an account — if a vendor has no history and no obvious account, flag it for review.",
        "Per-client isolation is absolute. One client's coding, vendors, and memory NEVER cross into another's. Judge a document by the bill-to / company on it, never the sender or folder.",
        "If you're unsure about a financial decision: stop, log it, and ask. Never silently continue an uncertain entry.",
        "Preserve auditability — for anything that touches the books, record what, when, why, and what changed.",
      ],
    },
    {
      heading: "Daily / intake flow",
      body: [
        "Receipts and bills arrive by Gmail and the client's Drive drop folder. Figgy captures the vendor, date, invoice #, subtotal, HST, total, and payment method.",
        "Each document is matched to the right client by the bill-to + location on the document.",
        "Figgy codes the vendor from that client's history (the vendor brain). New vendors get a review-gated suggestion — confirm or correct it; the correction teaches the brain for next time.",
        "Items needing a human decision land in Triage. Work the New tab first; approve, dismiss, or send a question to the client.",
      ],
    },
    {
      heading: "Posting transactions",
      body: [
        "Bills are the trusted spine — they carry the line-level account and tax code. Code from the vendor's own history first.",
        "Meals & entertainment: ITCs are generally restricted to 50%. Confirm before claiming full HST.",
        "Never post to a control account (A/P, A/R, HST/GST, clearing, undeposited funds) from an expense line — that distorts the books and the HST report.",
        "When confidence is below the green threshold, leave it in Triage for review rather than guessing.",
      ],
    },
    {
      heading: "Month-end reconciliation",
      body: [
        "At the START of the month, pull the statement list: open the client's Month-end reconciliation card and note which accounts are reconciled through and which need statements. Download those first so nobody is blocked mid-close.",
        "Reconcile every bank, credit card, loan, and processor through month-end. An account short of the close month-end shows a red 'behind' badge.",
        "Clear undeposited funds and any clearing/suspense accounts to zero.",
        "Use the month-end close checklist on the client's Compliance tab to tick each step.",
      ],
    },
    {
      heading: "HST / GST",
      body: [
        "Reconcile in QuickBooks first, then run the Pre-HST review to catch coding issues (missing tax codes, wrong codes, sales without tax, control-account coding).",
        "Use the Exception cross-check (authoritative): paste QuickBooks' Sales Tax / exception report numbers + the GST/HST account balance at period end, and confirm net tax (collected − ITCs + adjustments) ties to the account. A gap is the exception to clear before filing.",
        "Sage prepares the return; Markie approves; nobody files without his sign-off.",
      ],
    },
    {
      heading: "Payroll",
      body: [
        "Each client has its own cadence and pay-day rules — check the client's payroll settings, don't assume.",
        "Hours come from the client's source (timesheet, Jobber, or manual). Banked / lieu hours are tracked in the Banked hours ledger and synced into the run.",
        "Run → review → Markie approves. T4/T4A and remittances are compliance tasks on the Compliance tab.",
      ],
    },
    {
      heading: "Year-end",
      body: [
        "Use the Year-end review on the client's Compliance tab: Start → work the phased checklist (Reconcile → Compliance → Adjustments → Review → Package) → Close → Build the accountant package.",
        "Close is gated on the required items (bank/CC reconciled, HST filed, trial balance reviewed). Don't close until the books are right.",
        "The package assembles TB / GL / Balance Sheet / P&L (from QBO where available) + statements + reconciliation reports + working-paper notes for the accountant.",
      ],
    },
    {
      heading: "Per-client playbooks",
      body: [
        "Standard procedures (above) apply to everyone. Each client ALSO has its own quirks — special accounts, who to email, recharge arrangements, odd cadences.",
        "Those client-specific procedures live in the client's PLAYBOOK — open the 'Per-client playbooks' tab here (it opens the Client Playbooks page), pick the client, and read/update it.",
        "When you learn something client-specific from a correction or a conversation, write it into that client's playbook so the whole team has it.",
      ],
    },
  ],
};

const CRM_MANUAL: Manual = {
  id: "crm",
  title: "CRM Manual",
  tagline: "How to drive Figgy — the month-end-close cockpit.",
  sections: [
    {
      heading: "The big picture",
      body: [
        "This CRM is the firm's cockpit: at a glance, where every client stands on their close — what needs posting, who's due for HST, is year-end done, is it reconciled.",
        "Figgy (the AI team) does the work and proposes; you review and approve. Every tool has a Help button (?) with step-by-step instructions.",
      ],
    },
    {
      heading: "Clients",
      body: [
        "Each client is a single scrollable workspace: a Needs-Attention banner up top, then Team notes, Payroll, Month-end close, HST, Year-end, Emails, Tasks, Financials, Billing, Contacts.",
        "Lead → active is built into the same card; the intake fields fill the firm's mapping (HST, payroll, fiscal year-end, etc.).",
        "US clients show their dollars in USD; Canadian clients in CAD — the card follows the client's country.",
      ],
    },
    {
      heading: "Triage (what needs posting)",
      body: [
        "Triage is the human-review surface for Figgy's findings: New / Awaiting client / Approved / Dismissed.",
        "Each card shows a traffic-light pill (green/yellow/red), a confidence %, and a plain-English 'why'. Click '✨ Get Figgy's suggestions' to run the brain over the current tab.",
        "Approve, dismiss, or send a question to the client. Your notes on approve/dismiss teach the team (the learning loop).",
      ],
    },
    {
      heading: "Tasks & Calendar",
      body: [
        "Every task has a due/start date and syncs with Google Calendar + Tasks. Compliance tasks (HST, WSIB, T4/T5) surface on the client's Compliance tab.",
        "Click any task or calendar item to open its detail. Inactive clients' tasks are hidden so the board stays clean.",
      ],
    },
    {
      heading: "Team notes (replacing WhatsApp)",
      body: [
        "Each client has a Team notes thread — Markie ↔ the bookkeeper, inside the CRM. Tick 'This is a question' for anything that needs an answer; open questions raise an amber badge on the Needs-Attention banner.",
        "Mark a question resolved when answered. Staff-only — clients never see it.",
      ],
    },
    {
      heading: "Practice Health (owner-only)",
      body: [
        "Firm-performance rollup: client roster, recurring revenue, payroll processed, billed-vs-collected from the firm's own QBO books.",
        "Multiple firms are supported — switch between Go Fig Bookz (CA) and Go Fig Bookz USA (US) with the chips; each shows its own clients, income, and currency.",
      ],
    },
    {
      heading: "Ask Figs",
      body: [
        "One chatbot, the whole team. Just talk — it auto-routes to the right agent (Fig, Sage, Wren, Liv, Jinx, Tess, Jade, Skye). Hands-free voice mode and 'near me' location are built in.",
        "Agents can add tasks, get your agenda, file personal items, check firm status, run health checks, and remember lessons.",
      ],
    },
  ],
};

const QUICKBOOKS_MANUAL: Manual = {
  id: "quickbooks",
  title: "QuickBooks Manual",
  tagline: "How we keep the books in QuickBooks Online (Canada + US).",
  sections: [
    {
      heading: "Connecting a company",
      body: [
        "Connect each QBO company from its client card (or /api/qbo/connect?clientId=N). Native OAuth is the durable rail — tokens are encrypted and auto-refreshed.",
        "One realm = one client. If a company shows 'Reconnect', its token lapsed (invalid_grant) — reconnect it once; the books are fine, only the connection expired.",
        "Connections are read-only today (review-gated). Figgy never writes to QBO without Markie's approval.",
      ],
    },
    {
      heading: "Chart of accounts",
      body: [
        "The chart is LOCKED per client. Figgy never creates or guesses an account.",
        "Coding memory (which account a vendor maps to) lives in the CRM's vendor brain, not on the QBO vendor card — QBO has no default-account field. Only contact fields (email/phone/address) write back to the vendor card.",
        "If a vendor's history is consistently miscoded, the brain will repeat it confidently (green = 'matches this vendor's history', not 'provably correct'). The human review gate is the backstop.",
      ],
    },
    {
      heading: "Posting bills & expenses",
      body: [
        "Bills carry line-level AccountRef + TaxCodeRef — they're the trusted source for a vendor's coding. Pull a vendor's bills with SELECT * FROM Bill WHERE VendorRef='ID' (use SELECT *, a projected query drops the line account).",
        "Purchase/Expense entities can't be filtered by vendor in SQL — use the TransactionList report, vendor-filtered, reading the other_account column.",
        "Skip non-spend transaction types and control accounts when learning history, so a control-account row never poisons a vendor's coding.",
      ],
    },
    {
      heading: "Sales tax (HST/GST) — Canada",
      body: [
        "Tax lives at the transaction level (TxnTaxDetail.TotalTax), not per line. Use the right tax code per realm — some clients have non-standard codes.",
        "The API does NOT expose the bank-feed 'For Review' queue or the Sales Tax exception report. Reconcile + file from QuickBooks; use the CRM's Pre-HST review + Exception cross-check to verify the data first.",
        "Net tax = HST collected − ITCs (+ adjustments). It should tie to the GST/HST Payable account at period end once prior periods are filed.",
      ],
    },
    {
      heading: "US clients (sales tax, not HST)",
      body: [
        "US companies use state/local sales tax and nexus rules — there is no HST/ITC. Don't apply Canadian tax logic to a US client.",
        "US dollars are USD. Suppress Canada-only obligations (HST, WSIB, CRA) for US clients.",
      ],
    },
    {
      heading: "Reports we pull",
      body: [
        "Available via the API: Balance Sheet, Profit & Loss, Trial Balance, General Ledger, A/R & A/P aging. These feed the dashboard, month-end status, and the year-end accountant package.",
        "NOT available: a reconciliation report or the sales-tax exception report. Generate the equivalent from the CRM (Pre-HST review, recon tracker) or pull manually from QuickBooks.",
        "Statements: connected banks auto-pull statements INTO QuickBooks, but the API doesn't hand them back — gather those manually for the year-end package.",
      ],
    },
    {
      heading: "Limits to respect",
      body: [
        "Access token ~1 hour; refresh token rotates ~every 24h on a rolling 100-day window — persist the new token every refresh (the CRM does this automatically).",
        "500 requests/min and 10 concurrent per realm; batch ≤ 30 ops. Bounded pulls (MAXRESULTS 1000) keep us inside the Make ops cap.",
      ],
    },
  ],
};

export const MANUALS: Manual[] = [BOOKKEEPING_TEAM, CRM_MANUAL, QUICKBOOKS_MANUAL];
export const MANUAL_BY_ID: Record<string, Manual> = Object.fromEntries(MANUALS.map((m) => [m.id, m]));
