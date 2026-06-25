---
name: design
description: >-
  Brand + visual design for the Go Fig Bookz / Figgy app. Use for any logo, icon,
  branded SVG/asset, color, typography, or UI visual-polish task. Encodes the Go
  Fig Bookz brand (flowing calligraphy + signature swoosh + lime green + the Figs
  mascot) and the render-to-verify workflow so design lands on-brand the first time.
---

# Design — Go Fig Bookz / Figgy

Markie cares about the look and iterates on it. Match the brand, make it flow, and
verify before shipping. This skill is the single source of truth for that.

## The brand (the real reference)
The authoritative firm logo is **`public/assets/logo.jpg`** ("Go Fig Bookz",
shown on the landing + login pages). ALWAYS open and look at it before any logo
work — don't design from memory. Its signature traits:
- **Flowing brush calligraphy** wordmark — elegant, connected, hand-lettered (thin↔thick
  contrast, long flourishes on capitals). NOT a fat casual script, NOT geometric.
- **The signature swoosh** — a long graceful sweeping line under the words that lifts
  at both ends. This is the most recognizable brand element; include it on branded marks.
- **Lime green** — the "Bookz" green. Black is used for "Go Fig"; the app skews fully green.
- "BOOKKEEPING" set below in spaced uppercase sans (tracking-wide).

## Figgy assets (what you maintain)
- `public/figgy-logo.svg` — the **Figgy wordmark** (sidebar/header). "Figgy" in flowing
  calligraphy; an **oversized F** whose flourish flows over the front of the word; the
  **Figs mascot as the dot of the i**; the swoosh under the word; lime gradient.
- `public/figgy-mark.svg` — the collapsed icon (just the Figs mascot).
- `public/assets/logo.jpg` — the real firm logo (reference; used on landing/login).
- `public/phoenix-rising.svg`, `public/icon*.png`, `apple-touch-icon.png` — other marks.
- The Vite build copies `public/` → `dist/public/`. After editing an SVG in `public/`,
  ALSO `cp` it to `dist/public/` (prebuilt dist is committed) so the deploy serves it.

## Color tokens (use these greens)
- Wordmark gradient: `#8bc53f` → `#6fae2e` → `#4d7c0f` (light lime → mid → deep olive).
- Swoosh gradient: `#8bc53f` → `#5e9e22`.
- Mascot accents: leaf `#84cc16`/`#a3e635`, outline `#4d7c0f`, eyes `#1e293b`.
- App primary throughout the UI is lime (`lime-600` / `#65a30d`). Stay in this family.

## Typography
Flowing-calligraphy stack (leads with elegant connected scripts, falls back gracefully):
`'Allura','Great Vibes','Alex Brush','Snell Roundhand','Apple Chancery','Segoe Script','Brush Script MT',cursive`
- Caveat: an SVG used as `<img>` will NOT load an external `@font-face`, so the font
  FALLS BACK on machines without it. For anything that must look identical everywhere,
  draw it as a **font-independent path** (the swoosh, the F flourish) rather than text.
- To truly match the brand font, embed it as a base64 `@font-face` data-URI (needs the
  font file). If you can't fetch it, say so and ship the closest flowing fallback.

## Workflow (do this every time)
1. **Look at `public/assets/logo.jpg` first.** Read it as an image; design against it.
2. Build the asset as **SVG**, hero/structural elements as **paths** (deterministic),
   text only where a font fallback is acceptable.
3. **Render-to-verify when possible** — don't ship a logo blind. Headless Chromium is at
   `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (or `…_headless_shell-1194/…/headless_shell`).
   Render the SVG on a dark + light background to a PNG and LOOK at it. If the sandbox
   chromium won't launch, SAY you couldn't preview it and that it may need a nudge.
4. **Validate XML**: `python3 -c "import xml.dom.minidom; xml.dom.minidom.parse('public/figgy-logo.svg')"`.
5. `cp public/<asset>.svg dist/public/<asset>.svg`, commit, PR → main, merge (deploy rule).

## Principles Markie has stated
- **Flow, don't be stiff.** Stiffness comes from geometric letterforms + disjoint fallbacks.
  One connected flowing script reads smoother than a path-F bolted to text.
- **Keep the Figs mascot as the dot of the i** in the wordmark.
- **The F is an oversized initial** whose flourish flows OVER the front of "Figgy"
  (not necessarily the whole word — "a little over" unless he says more).
- He gives directional nudges ("bigger", "more", "less", "flow more") — make the smallest
  change that satisfies it; don't redesign the whole thing on a nudge.
- When you can't match exactly (no font, can't render), be honest about the limit and
  offer the concrete unblock (the font name / file).
