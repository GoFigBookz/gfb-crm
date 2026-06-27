# Morning Figgy — voice-triggered daily briefing (BACKLOG)

Markie (2026-06-27): "Morning, Figgy. What do I have today? Any important client emails?
Any QuickBooks issues? Who owes me documents? What's the weather at the trailer? Remind
me about my Phoenix Rising goals." On the **phone** (no speakers — less clutter), voice
triggered like a digital assistant.

## Part 1 — the briefing (easy; mostly wiring existing tools)
A single `morning_brief` that composes, in order, data Figgy already has:
1. **Today** — agenda (calendar + due tasks) → `get_agenda`
2. **Important client emails** — the email triage / "is this a task" flags
3. **QuickBooks issues** — `system_health` / Jinx (connection health, sync errors)
4. **Who owes documents** — clients with open client-requests
5. **Weather at the trailer** — saved location + `web_search` (or a weather API)
6. **Phoenix Rising goals** — reminders from the private space
Output: one spoken digest (TTS already in the assistant). Optionally auto-push each
morning (cron + PushNotification) instead of on-demand.
Effort: small. No new integrations — it's an aggregator skill over existing tools.

## Part 2 — the voice trigger ("Hey Figgy", hands-free)
The honest landscape, because this is the constrained part:

- **Google Home / "Hey Google, ask Figgy" is dead.** Google shut down Conversational
  Actions (custom third-party Assistant apps) in **June 2023**. You cannot put a custom
  Q&A brain into Google Home anymore. Google Home stays for *home automation*; Figgy
  lives on the phone. (This matches Markie's "better on my phone" call.)

- **Browsers/PWAs can't run an always-on background wake-word** (locked phone, app
  closed) — privacy + battery. So "always listening for Hey Figgy with the phone in your
  pocket" needs either the OS assistant or a native wrapper. Options, best-first:

  1. **In-app wake word (recommended first build).** While the Figgy PWA is open/foreground,
     run a custom wake word **"Hey Figgy"** entirely in-browser with **Picovoice Porcupine**
     (WASM, on-device, no audio leaves the phone; custom keyword via their console). On
     wake → start the existing hands-free conversation → speak the morning brief. Gives the
     digital-assistant feel whenever the app is up (e.g. phone on the desk in the morning).
     Cost: Porcupine has a free tier; ~1 small JS dependency.

  2. **OS launch-by-voice (no native app needed).**
     - **iOS — Siri Shortcut.** Create a Shortcut named "Morning Figgy" → "Hey Siri,
       Morning Figgy" opens the Figgy PWA at a deep link (e.g. `/assistant?brief=1`) that
       auto-runs + reads the brief. True voice trigger from a locked phone, zero native code.
     - **Android — App shortcut / Assistant routine / homescreen action** that opens the
       same deep link. ("Hey Google" can't route to a custom app post-2023, but a Routine
       can *open* the app.)

  3. **Native wrapper (later, if wanted).** The PWA is already TWA-ready for Play Store
     (`docs/ANDROID_APP.md`). A native Android wrapper could add a foreground service +
     Porcupine for true always-on "Hey Figgy" even when the app's closed — but that's a
     real native build + battery trade-off. Only if #1/#2 aren't enough.

- **Driving / hands-free-while-moving** (Markie's separate want): the cleanest is the
  **SMS channel** — text "morning brief" and get it back (Twilio), which also reads aloud
  via the car. Pairs well with #2 (Siri/Assistant launch).

## Recommended sequence when un-backlogged
1. `morning_brief` aggregator skill + spoken output (the content).
2. Deep link `/assistant?brief=1` that auto-runs it.
3. Picovoice "Hey Figgy" in-app wake word (hands-free while open).
4. iOS Siri Shortcut + Android shortcut to launch by voice from a locked phone.
5. (Optional) morning auto-push; SMS channel for driving.

Net: ~90% of the "digital assistant" feel on the phone with **no** dependence on the
dead Google Actions platform, and no clutter/speakers.
