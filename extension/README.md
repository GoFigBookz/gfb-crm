# Figs at Work — Chrome extension

Figs works **inside your own Chrome**, in the QuickBooks/Hubdoc tab **you're
already logged into**. You pass the login + picture-check (you're a human); she
does the bookkeeping. Her brain runs on the Figgy server, so she keeps the
reconcile steps, the never-touch-Figgy-Clearing rule, and the review gate.

## Install (one time, ~1 minute)

1. In Chrome go to **chrome://extensions**
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked** and pick this `extension/` folder
4. Pin the green **Figs at Work** icon to your toolbar
5. Click the icon → **Settings** → paste your **access token**
   (get it on **figgy.gofig.ca → Figs at Work → "Chrome extension" card → Copy token**) → **Save**

## Use it

1. Open the client in **QuickBooks Online** and log in like normal (solve any
   picture-check yourself).
2. Click the **Figs** icon, type the task, e.g.
   *"Reconcile Alderson's TD CAD Chequing. Ending balance $X, ending date June 30.
   Prep the feed, check off the matches, get to $0.00, then ask me before Finish."*
3. **Start.** Figs works in your tab. When she reaches anything that changes the
   books (like clicking **Finish now**), she **pauses** and the icon shows **?** —
   open the popup and **Approve** or **Deny**.

She never logs in and never touches a password page — if she lands on a login
screen she stops and asks you to sign in.

## Notes
- One task at a time. **Stop** ends it.
- Needs `ANTHROPIC_API_KEY` set on the Figgy server (Figs' brain).
- This is v1 — if a click misses or a field doesn't fill, Stop and tell Figgy;
  the click/type logic is easy to tune.
