# Connect QuickBooks — the keystone that gives the accounting agents their hands

Once QBO is connected, these agents flip from **advisors** to **doers**:
- **Fig** → posts sales receipts (Stripe/Square/Jobber/TouchBistro) + codes & posts bills/expenses
- **Sage** → prepares HST/WSIB/payroll from the live books
- **Wren** → runs tie-outs and the month-end workpaper
- **Tess** → pulls the client's numbers for T1/T2 prep
- **Jade** → real cash-flow / margin / KPI analysis

Everything else (review chain, "nothing posts without Markie") stays exactly as is.

## What Markie does (one-time, ~15 min)

1. **Create a production QuickBooks app** at https://developer.intuit.com
   → My Apps → Create app → "QuickBooks Online and Payments" → scope
   **com.intuit.quickbooks.accounting**.
2. In the app's **Keys & credentials (Production)**, copy the **Client ID** and
   **Client Secret**.
3. Add the **Redirect URI**:
   `https://figgy.gofig.ca/api/qbo/callback`
4. On Railway (the CRM's host), set these environment variables:
   - `QBO_CLIENT_ID` = (from step 2)
   - `QBO_CLIENT_SECRET` = (from step 2)
   - `FIGGY_TOKEN_KEY` = any long random string (encrypts the saved tokens)
5. Redeploy (Railway does this automatically when the vars are saved).

## Then, per company (Clark OS, Clark CW, …)

1. In the CRM → **Integrations → QuickBooks → Connect** (or visit
   `https://figgy.gofig.ca/api/qbo/connect?clientId=<the client's id>`).
2. Log into that company's QuickBooks and approve.
3. Done — that realm is now live and the agents can act on it. The old Make
   bridge for that realm can be retired once it's authorized.

## Notes
- The native OAuth rail is already built (`api/qbo-oauth.ts`): tokens encrypted
  at rest, refresh-token rotation, keep-alive so a quiet client never lapses,
  and a one-click "Reconnect" if a token ever goes stale.
- Per-client isolation is guaranteed — each QBO call goes through one connection
  whose realmId is fixed, so one client's data can never bleed into another's.
- Posting still respects the review chain: Fig proposes → Sage/Wren check →
  Markie approves. Nothing hits the books silently.
