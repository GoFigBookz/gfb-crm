# Go Fig Bookz — Android (and iPhone) app

The CRM is a PWA (Progressive Web App). That means it installs to a phone as a
real, full-screen app — **no app store required** — and can ALSO be wrapped into
a Play Store / App Store package if you want a store listing.

## Two ways to "get the app"

### 1) Install it now (fastest, no store) — recommended to start
**Android (Chrome):** open https://figgy.gofig.ca → tap **⋮** → **Install app**
(or "Add to Home screen"). You get the green **Fig** icon; it opens full-screen
straight to the chat, with mic + location working.

**iPhone (Safari):** open the site → **Share** → **Add to Home Screen**.

This works because the app now ships a web manifest (`/manifest.webmanifest`),
an app icon (`/icon.svg`), and a service worker (`/sw.js`) — the three things
Chrome requires to treat it as an installable app.

### 2) Publish to the Google Play Store (TWA)
A **Trusted Web Activity (TWA)** wraps the exact same PWA in a thin Android
shell that's publishable to Play. Steps (run on a machine with Node + JDK):

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://figgy.gofig.ca/manifest.webmanifest
bubblewrap build            # produces app-release-signed.apk + .aab
```

Bubblewrap will create a signing key and print its **SHA-256 fingerprint**.
Put that fingerprint in `public/.well-known/assetlinks.json` (template already
in the repo), redeploy, then upload the `.aab` to the Play Console. The
asset-links file is what removes the browser address bar (makes it a true app).

> Note: producing/uploading the store package needs YOUR Google Play developer
> account + signing key, so that step is done on your side (or in a follow-up
> with the fingerprint). The app itself is already TWA-ready.

### iPhone / App Store (later)
Same PWA installs via Safari today. A true App Store listing would use a wrapper
(e.g. Capacitor) — parked until after Android, per your call.
