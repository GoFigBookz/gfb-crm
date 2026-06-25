/**
 * QUICKBOOKS ONLINE PLAYBOOK — US + Canada. The shared QBO knowledge the
 * book-touching agents (Figs/Sage/Wren/Tess/Jade) carry. How QBO is structured,
 * how to post transactions & sales, how to pull data, and the US-vs-CA tax
 * differences. Non-finance agents get the short pointer (QBO_AWARE) instead.
 */
export const QBO_PLAYBOOK = `
=== QUICKBOOKS ONLINE — FULL PLAYBOOK (US + Canada) ===

HOW QBO IS STRUCTURED:
- Chart of Accounts (the spine): asset/liability/equity/income/expense + COGS. It is LOCKED — never invent an account.
- Lists: Customers (who you invoice), Vendors (who you pay), Products/Services (items), Accounts, Tax codes/rates.
- Transactions hang off those lists; each posts to accounts via debits/credits (QBO hides the journal but it's still double-entry).

POSTING EXPENSES / BILLS (money out):
- Bill = you owe a vendor (A/P), pay later. Expense/Cheque/Card = paid now. Purchase Order = not a posting.
- For each line: pick the vendor, the EXPENSE/COGS account (code from the client's vendor history — consistency matters), the tax code, amount; attach the receipt/invoice.
- Watch for DUPLICATES (same vendor + invoice # + amount) and control accounts (A/P, clearing, undeposited) — never code spend straight to those.

POSTING SALES (money in):
- Invoice = customer owes you (A/R) → later "Receive Payment" → into Undeposited Funds → "Bank Deposit" to the bank.
- Sales Receipt = paid at point of sale (no A/R) — this is what we use for Stripe/Square/Jobber/TouchBistro MONTHLY totals: one summarized sales receipt (gross sales) with processor FEES booked as an expense and the NET matching the bank payout/deposit.
- Always reconcile: gross sales − fees = net deposit that hit the bank. If it doesn't tie, stop and flag.

PULLING DATA:
- Reports: Profit & Loss, Balance Sheet, A/R & A/P Aging, Sales by Customer/Product, TransactionList by Vendor (params go in the URL, vendor-filtered, read the other_account column).
- API/queries: Bills filter by vendor via SQL ("SELECT * FROM Bill WHERE VendorRef='ID'" — use SELECT *, a column-projected query drops the line AccountRef). Purchase/Expense are NOT queryable by vendor (EntityRef) → use the TransactionList report. QBO Vendor has NO native default-account/tax field → coding memory lives in our vendorMemory.

=== CANADA specifics ===
- Sales tax: GST / HST (combined fed+prov, e.g. ON 13%, NS 15%) / PST or QST in some provinces. Use the right TAX CODE per line; track Input Tax Credits (ITCs) on purchases.
- Filing: GST/HST return (GST34) — net = tax collected − ITCs. Quick Method is an option for some.
- Payroll: CRA (T4/T4A, source deductions = CPP/EI/tax, remit monthly/quarterly), WSIB, EHT (ON).
- Year-end: T2 (corporate), T1 (personal). Watch province-specific rates.

=== USA specifics ===
- Sales tax: NO federal sales tax — state + local, by NEXUS. QBO "Automated Sales Tax (AST)" computes by address. There is NO Input-Tax-Credit concept; sales tax collected is a LIABILITY (Sales Tax Payable) you remit to the state.
- Payroll: IRS/state (W-2, W-4, 941/940, FUTA/SUTA, Social Security + Medicare).
- Year-end: 1120/1120-S (corporate), 1040 + Schedule C (personal/sole prop); 1099-NEC for contractors (≈ Canada's T4A).
- Terminology in this CRM: for US clients show "Sales Tax" (not HST), suppress WSIB/EHT/CRA-specific items.

REPORTS API MODERNIZATION (Intuit, effective 2026): the QBO Reports API is moving
to a modernized backend in phases — Group 1 (ProfitAndLoss, BalanceSheet, CashFlow,
TrialBalance, GeneralLedger-adjacent, TransactionList, TransactionListByVendor,
ARAgingSummary, AccountListDetail, JournalReport) ramps from Jul 1 2026 → 100% by
Jul 16; Group 2 (GeneralLedger, P&L Detail, AP/AR aging detail, SalesByCustomer/
Product/Class/Department, VendorExpenses, inventory/customer/vendor balances) Jul 13
→ Jul 22. Default switches automatically (no action needed). Opt in early with the
'testing_migration' query param; confirm via the 'v3modernResponse=true' response
header. EXCEPTION: TaxSummary is NOT modernized yet — do not pass testing_migration
on it. ACTION FOR US: when we pull reports (we use TransactionList / TransactionList-
ByVendor for vendor coding), validate parsing against the modernized response shape;
field names/structure can shift, so don't hard-assume column order — read by name.

BANK / CREDIT-CARD RECONCILIATION (Markie's exact procedure — UI-only, no API; Figs does this in the browser):
 1. PREP THE BANK FEED FIRST. Transactions > Bank transactions (Banking). In the "For Review" tab, add/match/categorize EVERY downloaded transaction for the statement period before starting.
 2. OPEN RECONCILE. Settings (gear, top-right) > under Tools > Reconcile.
 3. ENTER STATEMENT INFO. Pick the EXACT account from the dropdown. Verify the BEGINNING balance in QBO matches the statement's beginning balance — if it doesn't, STOP and flag (an unresolved issue or a previously deleted/modified transaction from a past reconciliation). Enter the Ending Balance and Ending Date exactly as on the statement, then "Start reconciling". (QBO also has an AI experience: drag-and-drop the PDF statement to auto-fill ending balance/date and highlight mismatches.)
 4. CHECK OFF MATCHES. Bank-feed-matched transactions are usually pre-checked. Compare the statement line by line and check off any remaining items that match.
 5. FINALIZE. Get the "Difference" in the top-right to $0.00. Only when it's exactly zero, click "Finish now". If it won't hit $0.00, STOP and flag — never force-finish a non-zero reconciliation.

NEVER USE "FIGGY CLEARING" (Markie, NON-NEGOTIABLE): the "Figgy Clearing" account is an internal staging account — NEVER reconcile it, never post spend/income to it, never pick it as the account for any transaction. Same for any other control/clearing account (A/P, A/R, Undeposited Funds, equity). If a workflow seems to want Figgy Clearing, STOP and flag.

GOLDEN RULES (always): nothing posts to QBO without Markie's review; verify every change against LIVE QBO before reporting done; per-client isolation (each call's realmId is fixed); the Sanity Guard stays on.`.trim();

/** Short pointer for agents who don't post to the books. */
export const QBO_AWARE = `
QUICKBOOKS: Figs, Sage and Wren handle posting and pulling data in QuickBooks Online (US & Canada). If a bookkeeping/QBO question comes up, hand it to them rather than guessing.`.trim();
