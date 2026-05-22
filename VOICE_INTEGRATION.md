# GFB CRM Voice Integration Guide

## What You Can Do

### 1. Morning Briefing (Automated)
Every weekday at 8:30 AM EST, the CRM will generate a morning briefing with:
- Overdue tasks count
- Tasks due today
- High priority items
- Top 3 priorities with names

**Access it in the CRM:** Go to `/morning-briefing` or click "Morning Briefing" in the sidebar.

**Enable speech:** Click the "Speak" toggle on the briefing page to have it read aloud.

### 2. Voice Task Creation via API

You can create tasks by sending a POST request to the voice webhook:

```bash
curl -X POST https://figgy.gofig.ca/api/trpc/voice.createTask \
  -H "Content-Type: application/json" \
  -H "X-Voice-Token: gfb-voice-2026" \
  -d '{
    "text": "Call John about QBO tomorrow at 2pm",
    "userEmail": "markie@gofig.ca"
  }'
```

**Natural language supported:**
- "tomorrow" → sets due date to tomorrow
- "today" → sets due date to today
- "next week" → sets due date to next week
- "urgent" / "asap" / "important" → sets high priority

### 3. Morning Briefing via API

```bash
curl -X POST https://figgy.gofig.ca/api/trpc/voice.morningBriefing \
  -H "Content-Type: application/json" \
  -H "X-Voice-Token: gfb-voice-2026" \
  -d '{
    "userEmail": "markie@gofig.ca"
  }'
```

Returns a spoken summary and task breakdown.

## Setting Up with Gemini/Google Assistant on Your Phone

### Option A: Google Apps Script (Recommended)
1. Open Google Apps Script (script.google.com)
2. Create a new project
3. Paste the following code:

```javascript
function addTask() {
  const text = "Call John about QBO tomorrow"; // This would come from voice input
  const token = "gfb-voice-2026";
  
  const response = UrlFetchApp.fetch(
    "https://figgy.gofig.ca/api/trpc/voice.createTask",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Voice-Token": token
      },
      payload: JSON.stringify({
        text: text,
        userEmail: "markie@gofig.ca"
      })
    }
  );
  
  const result = JSON.parse(response.getContentText());
  return result.result.data.message;
}
```

4. Set up a Google Assistant routine that triggers this script
5. Say "Hey Google, add to my task list: Call John about QBO"

### Option B: Shortcuts App (iPhone)
1. Open Shortcuts app
2. Create new shortcut named "Add Task"
3. Add "Ask for Input" action (text, prompt: "What task?")
4. Add "Get Contents of URL" action:
   - URL: `https://figgy.gofig.ca/api/trpc/voice.createTask`
   - Method: POST
   - Headers: `Content-Type: application/json`, `X-Voice-Token: gfb-voice-2026`
   - Body: JSON with `text` and `userEmail`
5. Add "Show Notification" to confirm

### Option C: Tasker (Android)
1. Install Tasker
2. Create a new task "Add CRM Task"
3. Add HTTP Request action:
   - Method: POST
   - URL: `https://figgy.gofig.ca/api/trpc/voice.createTask`
   - Headers: `Content-Type: application/json`, `X-Voice-Token: gfb-voice-2026`
   - Body: JSON
4. Trigger with voice command

## Security Note

The default token is `gfb-voice-2026`. **Change this in production** by setting the `VOICE_WEBHOOK_TOKEN` environment variable in Railway.

To change it:
1. Go to Railway dashboard
2. Select your CRM service
3. Go to Variables
4. Add `VOICE_WEBHOOK_TOKEN` with a new random string
5. Redeploy

## Troubleshooting

**"Invalid voice token" error:**
- Check that the token in your request matches the `VOICE_WEBHOOK_TOKEN` env var
- Default is `gfb-voice-2026`

**"User not found" error:**
- Make sure `userEmail` matches an existing user in the CRM
- Default admin is `markie@gofig.ca`

**Tasks not appearing:**
- Check that the CRM database is initialized
- The `init.sh` script seeds the admin user on first boot
