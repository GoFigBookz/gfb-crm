# GFB CRM - Quick Access Reference

## Current Live URL (Cloudflare Tunnel)
**https://reverse-collaboration-acute-appreciate.trycloudflare.com**

> ⚠️ This URL changes when the server restarts. Check here for the latest.

## Login Credentials
- **Email:** markie@gofig.ca
- **Password:** GoFig2026!

## Deployment Options

### Option 1: Keep Tunnel Running (FREE - Working Now)
- **Current URL:** https://reverse-collaboration-acute-appreciate.trycloudflare.com
- **Status:** ✅ Live, all data loaded (50 clients, 73 tasks)
- **Pros:** Free, instant, working perfectly
- **Cons:** URL changes if server restarts (I can restart it anytime)

### Option 2: Render (FREE - Currently Broken)
- **URL:** https://gfb-crm.onrender.com
- **Status:** ❌ 502 error (can't debug without dashboard access)
- **What we tried:** Fixed Dockerfile, database path, host binding, full seed
- **Needs:** Someone with Render dashboard access to check build logs

### Option 3: Railway ($5/month after 30-day trial)
- **Pros:** No cold starts, reliable, easy GitHub deploy
- **Cons:** Requires credit card, $5/month minimum

### Option 4: VPS/Server (Markie controls)
- **Pros:** Full control, no platform limits
- **Cons:** Requires server management

## Recommendation
**For now:** Keep using the tunnel — it's free and working!
**For permanent:** Fix Render (need dashboard access) OR upgrade to Railway Hobby ($5/mo)

## Files Saved
- `/root/.openclaw/workspace/gfb-crm-extracted/CRM_ACCESS.md` — Quick reference
- GitHub repo has all code + database seed

## How to Restart if Needed
1. I restart the local server: `node dist/boot.js`
2. I restart the tunnel: `cloudflared tunnel --url http://localhost:3456`
3. New URL generated — I send it to you

## GitHub Repository
https://github.com/GoFigBookz/gfb-crm

## Login
- **Email:** markie@gofig.ca
- **Password:** GoFig2026!

## Render Deployment (needs fix)
https://gfb-crm.onrender.com (currently 502 error)

## What's Loaded
- ✅ 50 clients with government registry data
- ✅ 73 recurring task templates (HST, payroll, WSIB, year-end, monthly close)
- ✅ Admin user (markie@gofig.ca)

## Last Updated
2026-05-14
