# Good morning, Markie — overnight build log #2 (2026-06-25)

Everything below is **merged to `main` and live** on figgy.gofig.ca. This is the second
batch from your voice notes (admin, calendar, agents, logo, QBO links, build-build-build).

## Shipped tonight (in order)

### Your urgent + direct asks
1. **Payroll was landing on the wrong day (the "25th" = a Thursday)** — root-caused and
   fixed. The biweekly cadence was anchored to whatever day the server rebooted; now it's
   anchored to a fixed confirmed Wednesday, so Clark OS/CW, Auld Spot, Sher-E-Punjab always
   land on the right Wednesday. Stat-holiday aware (Canada Day → runs Tue Jun 30). **Tested**
   (9 unit tests) so it can't regress.
2. **"$1.5M gross payroll means nothing"** → replaced with a **Next payroll runs** card
   (each company's next due date, today highlighted).
3. **You're an admin now** — you were stuck as senior_bookkeeper with no way to change it;
   boot now always promotes you.
4. **Calendar off by a day** → fixed the real cause (all-day / Google items stored at UTC
   midnight rendered a day early in Ontario). **Tested** (3 unit tests).
5. **Calendar items now open when clicked** — events get a detail popup (tasks already did).
6. **Nothing stays unscheduled** — every task gets a due date so it shows on the calendar.
7. **Month-end close** — per-client close checklist embedded on the client card, with
   **"Open in QuickBooks"** deep-links (Reconcile / Banking / Reports / Chart of accounts).
   Bank/CC reconciliation removed as standalone calendar clutter (it's a checklist item now).
8. **Dashboard "Clients 0 / 0 total"** → real bug fixed (the dashboard asked for a stat that
   didn't exist).
9. **Logo** — "Figgy" with **Figs as the dot of the 'i'** (bigger F, mascot tittle). *Eyeball
   it and tell me to nudge the spacing — I tuned it without the cursive font on my build box.*
10. **FIGGY_TOKEN_KEY** is now zero-touch (auto-generated + persisted; no env var needed).
11. **Vendor memory** now actually persists (the table was never being created).
12. **Phoenix Rising** is now always visible in the sidebar.

### New feature from your Task-Summary notes
13. **Loan Tracker** (Conor Loan, Adbank–Clark Loan, numbered-co shareholder loans). A "Loans"
    tab on each client: add loan accounts, log advances/repayments/interest, see the running
    **balance owed** and whether it's owed/overpaid/settled, plus a **read-only client share
    link**. Pure core with 7 tests.

### Quality / "prove it"
14. Extracted the money-critical payroll + calendar date logic into **pure, tested cores**
    (the running code is now the tested code). **287 tests green.**
15. Ran a **full code-review audit** of the whole session's diff — **no correctness bugs**,
    including the payroll timezone math. Applied 2 small polish fixes it flagged.

## 👉 Needs YOU (blocking)
- **Set `ANTHROPIC_API_KEY` in Railway → Variables → redeploy.** This is the ONLY reason the
  AI agents (Fig, Sage, Liv…) are silent — the code is fine and now shows an "agents offline"
  banner until the key is set. Everything else for the agents is wired and waiting.
- **Eyeball the new logo** and tell me any nudge (mascot up/down, spacing tighter/looser).
- **Confirm the payroll Wednesdays** look right (next biweekly = **Wed Jul 8**, then Jul 22).
- Still pending from before: **Connect QuickBooks** (unlocks Fig auto-posting, Motion Invest
  matching, live financials) and the per-provider connectors (Wise/Stripe/Square/PayPal/
  TouchBistro) — one at a time, with credentials.

## Notes / pushed back
- Most of your Task-Summary trackers (cash position, burn rate, MI wires, etc.) need the
  Google Sheets shared/connected before I can pull them in — I built the **Loan Tracker**
  first because it's self-contained and you had two loan sheets in the list.
- I did NOT touch the dashboard layout beyond fixing the broken client count — it was solid.
