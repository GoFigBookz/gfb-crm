# Figs at Work — server-side browser agent (watch + teach)

Decision (Markie, 2026-06-25): **Option A** — Figs drives a real Chrome that runs on
the server; Markie watches a live view *inside Figgy* and chats with her while she
works. Primary job: **Hubdoc** (no usable API — review each doc, set coding, Publish →
Hubdoc pushes the transaction into QBO). Bank-feed coding + reconciliation stay on the
**QBO API** we already connected. Sage reviews; anything Figs is unsure of → **Ask Markie**.

## Hard requirement
NEVER destabilize the live app. All of this ships behind a flag and is built/tested on
the branch; main only changes via a tested PR. Chromium is heavy — isolate it so a
browser crash can't take down the CRM.

## Architecture (staged)

### Stage 1 — Plumbing (watchable browser)
- Add Playwright (chromium) — server launches a headless Chrome per session.
- `api/browser-agent/` : session manager (launch, navigate, screenshot, click, type,
  close); one session per (userId). Hard caps: 1 concurrent session, idle-timeout,
  max-lifetime, so a runaway can't eat the box.
- Live view: stream screenshots to the UI over SSE (or periodic frames first — simplest
  that works), plus a cursor/last-action overlay.
- UI: `src/pages/FigsAtWork.tsx` — live frame + a chat/▶ controls + "Figs is: …" status.
- Deploy: Dockerfile installs chromium + deps. If image size/cold-start is a problem,
  fall back to a SEPARATE Railway service so the main CRM image stays lean. Decide after
  measuring.
- **Milestone:** Markie opens Figs at Work, tells her "go to hubdoc.com", watches it load.

### Stage 2 — Logins (she signs in herself) ✅ BUILT (2026-06-25)
- `api/browser-credentials.ts`: per-provider vault (Hubdoc first), encrypted at rest
  with the SAME AES-256-GCM envelope as the QBO tokens (`encryptSecret`/`decryptSecret`,
  FIGGY_TOKEN_KEY). Lazy self-creating table (`browser_credentials`) so it can't touch
  boot. List view masks the username + never returns the password.
- `loginWithCredential()` in browser-agent: navigates to the login URL, fills the
  email/password fields (generic selectors cover Hubdoc), submits. Signing in isn't a
  state-changing post, so no per-click approval (Publish/post still pause).
- Routes (admin-gated): `/api/figs-browser/credentials` (GET/POST), `/credentials/delete`,
  `/login`. UI: "Her logins" card on Figs at Work — add (paste once), Sign in, delete.
- Her OWN Hubdoc login (not Markie's) so every action is attributable to her.
- TODO next: persist browser storageState across sessions so she stays signed in.

### Stage 3 — The brain (human-in-the-loop computer use)
- Anthropic computer-use loop: model gets the screenshot, returns the next action; we
  execute it in Playwright; repeat. Sonnet/with the computer-use beta tool.
- **Human-in-the-loop by default:** before any state-changing click (Publish, post,
  delete) she pauses and asks Markie in the side chat; he approves → she clicks.
  Read-only navigation she can do freely. Autonomy threshold rises per the governance
  policy as her scorecard earns trust.
- Everything she does is logged (agent_audit_log) + teachable (a correction writes a
  learning so she does it right next time).

### Stage 4 — The pipeline end-to-end (Alderson → Ovita Co → Ovita Holdings)
- Hubdoc: review + publish each doc → lands in QBO with the receipt attached.
- Bank feed + reconciliation: QBO API (no browser).
- Sage reviews the posted set; flags re-classes / anything needing Markie.
- Unsure items → Ask Markie queue (already live).

## Safety / guardrails
- Flag-gated (`FIGGY_BROWSER_AGENT=on`); off in prod until proven.
- Read-only by default; every write action is human-approved first (golden rule:
  nothing posts/publishes without Markie's review).
- Resource caps (1 session, timeouts) + a kill switch on the Figs at Work page.
- Credentials encrypted; her own logins; full audit trail.

## Open questions to confirm with Markie
- Hubdoc login: ready to give Figs her own Hubdoc user? (needed for Stage 2)
- Same-image vs separate browser service — I'll measure image size first and recommend.
