/**
 * HELP CONTENT — step-by-step "how do I use this?" instructions, keyed by section id.
 * (Markie 2026-06-27: "a help button in each section… step-by-step instructions so
 * the training's built in.") Author an entry here whenever you build a feature; drop
 * a <HelpButton id="..." /> next to its header. Content ships with the build — no DB.
 */
export interface HelpEntry { title: string; steps: string[]; note?: string }

export const HELP: Record<string, HelpEntry> = {
  "recharge-invoice": {
    title: "Recharge invoice (inter-company)",
    steps: [
      "Pick the PAYER (the company that paid the shared expenses) — it defaults to the client you're on.",
      "Mark the expenses billable to the counterparty IN QUICKBOOKS first, with the counterparty set as the Customer — the recharge pulls from billable expenses, not date ranges.",
      "Click ‘Spot-check’ to confirm every expense from the period is marked billable and has the customer attached (anything missed is flagged).",
      "Review the worksheet: it zeroes the payer's expenses AND HST to $0, excludes bank charges, and lists any prior-period exceptions.",
      "When it ties out, click Post — it creates the Invoice (payer) + mirror Bill (counterparty) and auto-files a report to both Drive folders.",
    ],
    note: "Nothing posts until you click Post. Customer (e.g. Ovita Holdings) MUST be attached to each billable expense or it won't be picked up.",
  },
  "statement-coding": {
    title: "Statement coding",
    steps: [
      "Export the bank or credit-card transactions as CSV (or paste them) — Date + Amount, or Date + Debit/Credit columns.",
      "Drop/paste them in the box and click ‘Code statement’.",
      "Fig codes every money-out row — account, tax, and a 🟢🟡🔴 confidence — by reading the vendor's history.",
      "Review the coded list: 🟢 green = confident (history or a locked rule); 🟡/🔴 need a look.",
      "Lock recurring vendors as rules (below) so they auto-code green next time.",
    ],
    note: "Read-only — nothing posts to QuickBooks. It cuts the coding work; you still review.",
  },
  "vendor-rules": {
    title: "Vendor auto-post rules",
    steps: [
      "Click ‘Suggest from history’ — Fig scans your vendors and offers the ones with consistent history.",
      "Click ‘Lock’ on each obvious one (Bell → Telephone, hydro, rent…).",
      "Or ‘Add rule’ to pick a vendor + account + tax code manually.",
      "A locked rule makes that vendor code 🟢 green automatically on every future post — no re-review.",
    ],
    note: "Writes only Figgy's memory, never your QuickBooks books.",
  },
  "reconcile-matcher": {
    title: "Reconciliation matcher",
    steps: [
      "Paste the bank statement (CSV/text), or drop a PDF to auto-read it.",
      "Paste the QuickBooks account register (export to CSV from the register).",
      "Click ‘Match’ — it buckets everything: matched, outstanding in QBO, missing from books, and a tie-out.",
      "Check the ‘Post-reconciliation cleanup’ panel — stale/uncashed cheques (6+ months) and likely duplicates to chase.",
    ],
    note: "Read-only, all in-browser. It matches to the register — that IS the reconciliation.",
  },
  "tasks-cleanup": {
    title: "Tasks cleanup",
    steps: [
      "Open Tasks → ‘Clean up’. It scans every client.",
      "Near-duplicates: similar tasks on different days — the earliest is kept; tick the rest to delete.",
      "Stale overdue: due 4+ months ago — mark done (keeps history) or open the client to re-date.",
      "Undated: no date so they never hit the calendar — open the client to schedule them.",
    ],
  },
  "plan-my-day": {
    title: "Plan my day",
    steps: [
      "It auto-pulls today's work: overdue + due-today tasks + open personal items.",
      "Give each a quick time estimate — the workload meter turns 🟡→🔴 if you over-commit.",
      "Defer anything that won't fit; ‘+ add’ from the Available list to pull more in.",
      "Tick items done as you go. At end of day hit ‘Shutdown’ — unfinished items roll to tomorrow.",
    ],
    note: "Your picks + estimates are saved on this device.",
  },
  "reseller-listings": {
    title: "Reseller listings",
    steps: [
      "On a Side-Sales product, click ‘Listings’ → ‘Draft’.",
      "Skye writes one listing per channel (Marketplace, Kijiji, eBay): title, body, price, hashtags.",
      "Click the copy icon and paste it into the channel — then ‘✓ posted’ to mark it listed.",
      "When it sells, use ‘Sell’ on the product to log the sale and decrement stock.",
    ],
    note: "No auto-posting — Facebook Marketplace has no public API, so you paste-and-post (safe from bans).",
  },
  "liv-briefing": {
    title: "Liv's briefing",
    steps: [
      "This is your one daily digest from Liv (Chief of Staff): what needs you, what's behind, due today, and what the team learned.",
      "Click hide/show to collapse it.",
      "Anytime in chat, say ‘brief me’ or ‘the rundown’ to get it on demand.",
    ],
    note: "Reads your live app state — costs nothing to run.",
  },
  "hst-review": {
    title: "Pre-HST review",
    steps: [
      "Pick the client and the HST period.",
      "It pulls the HST collected vs. ITCs and runs a reasonableness check (effective rate ≈ 13%).",
      "Green = sensible; yellow/red = worth a look before filing.",
      "Use it as the sanity gate before Sage prepares the return.",
    ],
  },
  "triage": {
    title: "Ask Markie (review queue)",
    steps: [
      "Everything Fig or Sage isn't sure about lands here — not in the chat — for your call.",
      "Tabs: New, Awaiting client, Approved, Dismissed. Each card shows the vendor/amount, a 🟢🟡🔴 confidence pill, and Figgy's plain-English ‘Why’.",
      "Click ‘✨ Get Figgy's suggestions’ to run the brain over the current cards (coding + rationale) before you decide.",
      "Fix anything wrong and add a note — your note TEACHES the team (it's captured as a lesson).",
      "Then Approve, Dismiss, or ‘Ask the client’ for what's missing.",
    ],
    note: "Nothing posts to QuickBooks from here — approving records your decision; posting stays off until the QBO write connection is on.",
  },
  "payroll": {
    title: "Payroll",
    steps: [
      "Pick the company from the dropdown — each runs on its own cadence (weekly, bi-weekly, monthly, or QBO autopay).",
      "Open or start a pay run: enter hours/salary per employee; phone allowance, banked hours, and reimbursements flow in where set.",
      "Review the totals — gross, deductions (CPP/EI/tax), net, and the CRA remittance.",
      "Click an employee to open their card (one shared editor across Payroll and Employee Management).",
      "Banked hours: the per-employee panel + the client board sync with the shared ledger.",
    ],
    note: "Numbers come from your inputs + the employee records. Nothing files with CRA automatically.",
  },
  "month-end-close": {
    title: "Month-End Close",
    steps: [
      "This is your close cockpit: every active client and where they stand this period.",
      "Each row shows transactions to review, HST status, year-end, and reconciliation — fed by the live QBO snapshot.",
      "Sort by ‘who's behind’ to triage the portfolio; click a client to open their dashboard.",
      "Use the ‘Open in QuickBooks’ deep-link to jump straight to that client's books.",
      "Work the reds and yellows down to green — that's the close.",
    ],
    note: "Reads a cached snapshot (cheap) — refresh pulls the latest from QBO.",
  },
  "brain": {
    title: "Ask Figgy Brain",
    steps: [
      "Ask anything about the firm, clients, tax, HR, or process — Liv answers from the shared knowledge base, with sources.",
      "If it's not in the brain, she asks YOU instead of guessing — answering teaches it for next time.",
      "Confirmed corrections become facts every agent can use (per-client isolation preserved).",
      "The counter shows how many facts and open questions the brain holds.",
    ],
  },
  "find-duplicates": {
    title: "Find duplicate clients",
    steps: [
      "Click ‘Find duplicates’ — it scans every client card for matching name, email, phone, HST/business number, or tax ID.",
      "Pairs are ranked: 🔴 strong (shared hard ID), 🟠 likely, ⚪ possible (name only).",
      "Open each card to compare them side by side.",
      "Decide which to keep, move anything important over, and set the other to inactive.",
    ],
    note: "Read-only — it finds, you decide. One-click merge isn't enabled on purpose: blindly re-pointing data could collapse two separate QuickBooks companies into one.",
  },
  "clients": {
    title: "Clients",
    steps: [
      "Your whole book of business — search or filter, click a card to open that client's dashboard.",
      "‘Add Client’ opens the full intake form (entity, QBO realm, payroll, compliance dates).",
      "Each card shows status and what's outstanding at a glance.",
      "Inside a client: Overview, Tasks, Financials, Billing, Payroll, Compliance, Rev Rec, Cash Book, Loans, Time.",
    ],
  },
  "cash-book": {
    title: "Cash book",
    steps: [
      "Add the client's bank/cash account with its opening balance and the date it's as of.",
      "Fast start: click ‘Import’ and paste a bank/credit-card CSV (Date + Amount, or Debit/Credit columns) — deposits come in as money-in, withdrawals as money-out. Preview first, then import.",
      "Or log each transaction by hand: date, Money in/out, amount, optional HST, a category, and a reference (cheque #).",
      "Tick ‘Cleared’ when it shows on the bank statement — that drives the reconciliation.",
      "Reconcile: type the statement's closing balance — it ties to your CLEARED book balance (uncleared cheques are shown as in-transit).",
      "Year-end: the category summary totals income and expenses (with HST) — the backbone for the T2 / income statement. Export to CSV anytime.",
      "HST: pick a quarter in the HST worksheet — it sums sales (line 101), HST collected (105), and ITCs (108) into the net tax owing (109). It flags any revenue with no HST recorded.",
    ],
    note: "For micro-clients / holding companies that don't need full QuickBooks. Nothing posts to QBO — this IS the book of record for that account.",
  },
  "legal-builder": {
    title: "Legal & estate documents",
    steps: [
      "Pick a document (Will, Power of Attorney, Living Will, Business Succession, Account Directive).",
      "Answer the guided questions one section at a time — Liv asks, you answer.",
      "Click ‘Generate draft’ — it fills a template from your answers.",
      "Edit anything, then export/print.",
    ],
    note: "These are DRAFTS to review with a lawyer and execute properly (Ontario wills need your signature + 2 witnesses). Not legal advice; not valid until properly signed/witnessed.",
  },
};
