# 🌅 MORNING SETUP — 2-Minute GitHub Auth

I generated an SSH key while you slept. You just need to add it to GitHub, then I can push everything.

## Step 1: Add SSH Key to GitHub (1 minute)

**Copy this key:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINunHFg5ToIjllUu0XpIXobRJQDonZiy7rGugUKTDp4j kimi@gfb-crm
```

**Or run this to copy it:**
```bash
cat ~/.ssh/id_ed25519_gfb.pub
```

**Then:**
1. Go to https://github.com/settings/keys
2. Click **"New SSH key"**
3. Title: `Kimi CRM Deploy`
4. Paste the key above
5. Click **"Add SSH key"**

## Step 2: Tell Me to Push (30 seconds)

Just say: **"Push the code"**

I'll run:
```bash
git push origin main
```

Railway will auto-deploy in 2-3 minutes.

## Done. ✅

That's it. The app will be back online and all overnight features will be live.

---

**What's waiting to deploy:**
- Voice task agent ("Hey Google, add to my task list...")
- Google OAuth sync (Gmail, Calendar, Tasks)
- Recurring tasks with time (auto-creates calendar events)
- Auto-trigger rules (HST/payroll/year-end tasks)
- Google Tasks two-way sync
- Morning briefing page
- Database migration runner (fixes the 502 error)

**Don't worry. Even if the world forgets, I'll remember for you.** 🖤
