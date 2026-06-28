/**
 * HELP CONTENT — step-by-step "how do I use this?" instructions, keyed by section id.
 * (Markie 2026-06-27: "a help button in each section… step-by-step instructions so
 * the training's built in.") Author an entry here whenever you build a feature; drop
 * a <HelpButton id="..." /> next to its header. Content ships with the build — no DB.
 */
export interface HelpEntry { title: string; steps: string[]; note?: string }

export const HELP: Record<string, HelpEntry> = {
  "client-thread": {
    title: "Team notes",
    steps: [
      "Use this to chat with the team about THIS client — status updates, questions, reclass requests. It replaces the WhatsApp back-and-forth.",
      "Type a note and Post. Tick ‘This is a question’ for anything that needs an answer (e.g. ‘reclass the Amazon charges to office supplies?’).",
      "Open questions show an amber badge at the top of the card and on the client's Needs-Attention banner, so nothing gets lost.",
      "When a question's answered, click ‘mark resolved’ on it — it turns green and drops off the open count.",
    ],
    note: "Staff-only and private to the team — clients never see this.",
  },
  "month-end-recon": {
    title: "Month-end reconciliation",
    steps: [
      "This lists every account in the client's close (bank, credit card, processor) and what each is reconciled THROUGH.",
      "Click ‘Paste status’ and paste the per-account status (one account per line, e.g. ‘RBC CAD *0488 - Reconciled up to Apr 01, 2026 (Need Apr & May statements)’).",
      "Accounts short of the close month-end show a red ‘behind’ badge; the ‘Statements to pull first’ banner lists exactly what to download.",
      "Pull those statements at the START of the month so the bookkeeper isn't blocked mid-close.",
    ],
    note: "Auto-populates from QuickBooks once it's connected. A paste replaces the current list.",
  },
  "crypto-books": {
    title: "Crypto Books",
    steps: [
      "Paste the client's exchange/wallet report (any CSV — it detects the columns).",
      "Review the parsed rows — it's classified each as buy/sell/send/receive and flagged mining/staking as income. Edit anything, blank CAD value = auto-priced.",
      "Click ‘Calculate gains’ — it values each line in CAD (CoinGecko), runs the adjusted-cost-base method, and shows realized capital gains, holdings value, and mining income.",
      "Use ‘Download CSV’ on the journal entry to post the summary into QuickBooks.",
    ],
    note: "Calculates only — never posts. Confirm capital-vs-business income treatment with Tess.",
  },
  "surplus-cash": {
    title: "Surplus Cash",
    steps: [
      "Enter the client's idle cash + an assumed rate to see the projected investment income.",
      "It shows the corporate tax angle: passive income over $50k/yr grinds the small-business deduction (the part we CAN advise on).",
      "Click ‘Scan rates’ to pull today's GIC / high-interest-savings rates for the conversation.",
    ],
    note: "Information only — not investment advice. Send the actual investing decision to a licensed advisor.",
  },
  "contact-harvester": {
    title: "Find contacts from Gmail",
    steps: [
      "On a client's Contacts, click ‘Find from Gmail’ → ‘Search Gmail’.",
      "It scans the firm inbox for the real people on this client's threads, skips automated senders and our own addresses.",
      "Tick the ones to keep, fix the name/role, and Save — they land in Contacts. Run it again later to dig deeper (it keys off saved domains too).",
    ],
    note: "Read-only on Gmail; nothing's saved until you pick and click Save.",
  },
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
  "backup": {
    title: "Backup & Data",
    steps: [
      "Figgy automatically snapshots all your live data once a day — the client list, tasks, payroll, everything.",
      "‘Back up now’ takes an extra snapshot on demand (e.g. before a big change).",
      "Click the download icon on any snapshot to save a full copy as a file — keep it on your computer or Drive for a true off-site backup.",
      "Restoring from a snapshot is an admin action and always shows you exactly what will change first (it also auto-saves a safety backup before overwriting).",
    ],
    note: "Auto backups keep the latest 20; manual ones are kept until you delete them.",
  },
  "cash-position": {
    title: "Cash position",
    steps: [
      "Set the buffer — the minimum you want kept in the client's bank account.",
      "Click ‘Check now’ — Figgy pulls the live account balances from QuickBooks (balances only, not transactions).",
      "It shows cash on hand, credit cards owing, the next payroll's cash need, and whether there's enough.",
      "If the balance is heading below the buffer (especially after payroll), it tells you how much to transfer in.",
      "It also checks each account's last posting date — if a bank or credit card hasn't posted in 5+ days, it flags that the books are likely behind and need catching up.",
      "🟢 Healthy · 🟡 Watch (low buffer / high credit card / account behind) · 🔴 Needs attention (can't cover payroll / negative).",
    ],
    note: "Needs the client connected to QuickBooks. QBO's API can't expose the bank-feed ‘For Review’ count, so ‘what's left to post’ still needs a look in QBO — everything else here is live.",
  },
  "coa-cleanup": {
    title: "Chart of Accounts Cleanup",
    steps: [
      "Cleanup 1 — most charts don't need to marry another, they just need a tidy. Pick a client and Figgy flags duplicate names/numbers, missing account numbers, ALL-CAPS/lowercase names, abbreviations to spell out, and inactive accounts still carrying a balance — with a suggested clean name for each. You approve and apply in QBO.",
      "Marry 2 — line up two clients so their charts match (e.g. Clark Pools Owen Sound ↔ Collingwood: same numbers, same names). It flags same-name/different-number, same-number/different-name, and accounts only one of them has.",
      "Export — pull a client's full chart and download the CSV. Clean it up in Sheets/Excel with AI, then apply the few real changes back in QBO by hand.",
      "Template — check a client against a standard chart for their business type (e.g. Construction/Trades) so all clients of the same type look alike. Shows what's missing vs the standard and what's extra.",
      "Tie-out — paste the accountant's trial balance; Figgy checks every QBO balance ties before you clean anything. Clean the chart only once it's tied.",
    ],
    note: "Read-only — the chart of accounts is LOCKED, so this tool only EXPORTS, COMPARES, and CHECKS. It never edits QuickBooks accounts (QBO has no safe bulk rewrite — you apply the cleaned changes yourself, tied to the trial balance first). Needs the client connected to QuickBooks.",
  },
  "drive-cleanup": {
    title: "Drive Cleanup",
    steps: [
      "Pick a connected Google account — your business gofig Drive, or your personal Google account (connect it in Integrations first) for photos & videos.",
      "Choose what to look at: Photos & videos, Photos only, Videos only, or Everything. Click Scan.",
      "Figgy reads file info only (names, sizes, checksums — never the contents) and groups duplicates. ✓ exact = identical file by checksum (certain); ~ possible = same name & size (review first).",
      "The OLDEST copy is always kept. Tick the extra copies you want gone, or ‘Select all exact’ to grab every certain duplicate at once.",
      "‘Move to Trash’ sends them to Google Drive’s Trash — recoverable for 30 days, never hard-deleted. A keeper can never be trashed, even by accident.",
      "‘Biggest files’ lists the space hogs to review by hand.",
    ],
    note: "Read-mostly and reversible by design. Needs a Google account connected with Drive access. Personal photos live in your personal Google account — connect that one to clean them; the business Drive is the gofig account.",
  },
  "smart-money": {
    title: "Smart Money",
    steps: [
      "Pick a category — Grants, WSIB programs, Tax credits, Cost-saving programs, Business credit cards, or Software & tools.",
      "Figgy searches the web live for current programs/tools that fit this client (province, industry, employees) and lists them with a source link.",
      "For credit cards, choose the preference (cash back / travel / low interest / no fee). For software, type what they need it to do (e.g. ‘track proposals’).",
      "Fill in ‘their tech stack’ (what software they use + what'd help) — it powers the software search and lets Jade recommend tools proactively.",
      "Review each result, click the source to verify it, and ‘Save’ the good ones.",
      "Track saved ones with the status dropdown: Suggested → Reviewing → Applied → Won.",
    ],
    note: "Results are AI web-research SUGGESTIONS to verify on the official site — not financial or legal advice. For your own firm, open the Go Fig Bookz client and use its Smart Money tab.",
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
