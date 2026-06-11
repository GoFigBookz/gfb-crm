# CRM ↔ QBO CONNECTION LAYER — BEST-PRACTICE DESIGN (2026-06-11)

The Account-Selection Brain is built + tested but needs a **real** per-client QBO
connection to run live (the CRM is currently a shell — `qboConnections` holds no
authorized companies). This is the design for that layer, the prerequisite for
going live. Judged against the mandate: cheap, low-touch, accurate, isolated,
build-once.

## Non-negotiables (from Markie)
- **Per-client isolation:** one QBO company (realm) = one connection = one CRM
  client. The brain only ever uses the connection for the client in hand. No
  shared/global QBO client. 2+ or 0 connections for a client = refuse to act.
- Nothing posts without review. CoA locked. OS and CW are separate realms.

## Best practices (Intuit OAuth 2.0, multi-tenant)
1. **Auth Code flow, one connection per realm.** Minimal scope
   `com.intuit.quickbooks.accounting`. (Scaffolding already in `qbo-router.ts`.)
2. **Token lifecycle:** access token ~1h, refresh token ~100 days and **rotates**
   — persist the rotated refresh token on EVERY refresh or you get locked out.
   Refresh proactively (<5 min to expiry). Already implemented; keep it.
3. **Encrypt tokens at rest**, server-side only, never sent to the browser.
   App `client_id`/`client_secret` stay in env/secret store.
4. **Production vs sandbox** base URLs already handled. Use production realms.
5. **Throttle/limits:** ~500 req/min per realm; use the **batch** endpoint for
   bulk, and lean on Vendor Memory so the brain re-reads minimally.
6. **Webhooks over polling** (Intuit change-data-capture): get notified when a
   bill/expense changes instead of scheduled polls — directly serves the cost
   mandate. Verify the webhook signature with the verifier token.
7. **Disconnect/revoke handling:** on `invalid_grant`, mark the connection
   inactive and surface a one-click "reconnect" in the CRM; never silently fail.
8. **Uniqueness constraint:** enforce one active connection per (clientId) and
   per (realmId) at the DB layer — this is the isolation guarantee in schema.

## Two ways to feed the brain live data — pick one
**A. CRM-native QBO OAuth (recommended end state).** Finish the layer already
stubbed in `qbo-router.ts`: register a production Intuit app, add
`QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` + redirect URI, build the per-client
"Connect QuickBooks" flow, authorize each company once → tokens land in
`qboConnections` keyed to the client. The brain runs unchanged. This is the
consolidated rail; removes Make coupling.
  - *Needs from Markie:* the Intuit app keys, and a one-time OAuth authorize per
    company (you click "Connect" while logged into each QBO company).

**B. Bridge to the existing live Make per-realm QBO tools (interim).** The brain
calls the already-connected Make QBO tool for that client (Clark OS `5347484`,
etc.) instead of `qboRequest`. Works TODAY with zero new credentials, lets us
demo the brain on real books immediately — but keeps a Make dependency and a
per-realm tool per client.
  - *Needs from Markie:* nothing new.

**Recommendation:** B now to prove the brain end-to-end on live Clark OS this
week (no waiting on credentials), in parallel with A as the durable layer; cut
over to A and retire the Make QBO tools once every client is authorized. The
brain code doesn't change either way — only the injected connection does.

## What's already done (this session)
- Brain core + I/O + `qboBrain.suggestCoding` (read-only), `vendorMemory` table,
  16/16 pure-logic checks green, isolation boundary that refuses to guess.
