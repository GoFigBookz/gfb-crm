# Enterprise Bookkeeper CRM - Self-Hosting Guide

## Overview
This is a comprehensive CRM system designed for bookkeepers, with multi-account support for Gmail, Outlook, Google Drive, OneDrive, and Calendar integration. Built for self-hosting on your own infrastructure.

## Features
- **Multi-Account Gmail Support** - Connect up to 3 (or more) Gmail accounts
- **Multi-Account Outlook Support** - Connect multiple Outlook accounts
- **Multi-Account Google Drive** - Connect 2-3+ Google Drive accounts
- **Multi-Account OneDrive** - Connect multiple OneDrive accounts
- **Unified Inbox** - All emails in one place
- **Unified Calendar** - All events across all accounts
- **Unified File Browser** - All files from all cloud storage
- **AI Agent Integration** - Webhook endpoints for your AI agents
- **Client Management** - Complete CRM with tasks, invoices, interactions
- **Recurring Tasks** - Auto-generated based on frequency
- **Bookkeeper-Friendly UI** - Clean, professional interface

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
- A server (can be VPS, cloud instance, or local machine)

### Step 1: Clone and Configure
```bash
git clone <your-repo-url>
cd enterprise-bookkeeper-crm
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Required: Database
DATABASE_URL=mysql://root:your_password@db:3306/bookkeeper_crm

# Required: Kimi OAuth
VITE_KIMI_AUTH_URL=https://portal.your-domain.com
VITE_APP_ID=your-app-id
APP_SECRET=your-super-secret-key

# Optional but recommended: Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional but recommended: Microsoft OAuth
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

### Step 2: Start with Docker Compose
```bash
docker-compose up -d
```

This will start:
- The CRM application on port 3000
- MySQL database
- Redis for caching (optional)

### Step 3: Access the Application
Open `http://your-server-ip:3000` in your browser.

## Manual Installation (without Docker)

### Prerequisites
- Node.js 20+
- MySQL 8.0+
- npm or yarn

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### Step 3: Setup Database
```bash
npm run db:push
```

### Step 4: Build and Start
```bash
npm run build
npm start
```

## Setting Up OAuth Providers

### Google OAuth (for Gmail, Drive, Calendar, Tasks)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable APIs: Gmail API, Calendar API, Drive API, Tasks API
4. Go to Credentials → Create OAuth 2.0 Client ID
5. Add authorized redirect URI: `http://your-domain/api/oauth/google/callback`
6. Copy Client ID and Secret to `.env`

### Microsoft OAuth (for Outlook, OneDrive, Calendar)
1. Go to [Azure Portal](https://portal.azure.com/)
2. Go to Azure Active Directory → App registrations
3. Register new application
4. Add API permissions: Microsoft Graph (Mail.ReadWrite, Calendars.ReadWrite, Files.ReadWrite)
5. Add redirect URI: `http://your-domain/api/oauth/microsoft/callback`
6. Copy Application ID and Secret to `.env`

## AI Agent Integration

Your AI agents can interact with the CRM via the tRPC API or webhook endpoints:

### Webhook Endpoint
```
POST /api/trpc/aiAgent.webhook
```

Request body:
```json
{
  "agentId": 1,
  "secret": "your-webhook-secret",
  "status": "completed",
  "output": "Task completed successfully",
  "actionsTaken": [
    {
      "action": "create_task",
      "target": "Client ABC",
      "result": "Task #123 created",
      "timestamp": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### API Endpoints for AI Agents
- `client.list` - Get all clients
- `task.list` - Get all tasks
- `task.create` - Create a task
- `invoice.list` - Get all invoices
- `email.list` - Get emails from unified inbox
- `calendar.list` - Get calendar events

## Architecture

```
┌─────────────────────────────────────────────┐
│           Enterprise Bookkeeper CRM          │
│                                              │
│  Frontend: React + TypeScript + Tailwind    │
│  Backend: Hono + tRPC + Drizzle ORM        │
│  Database: MySQL 8.0                        │
│                                              │
├─────────────────────────────────────────────┤
│  Connected Services:                         │
│  • Gmail (multiple accounts)                │
│  • Outlook (multiple accounts)              │
│  • Google Drive (multiple accounts)         │
│  • OneDrive (multiple accounts)             │
│  • Google Calendar                          │
│  • Outlook Calendar                         │
│  • AI Agents (via webhooks)                 │
└─────────────────────────────────────────────┘
```

## Security Considerations
- Change default passwords
- Use HTTPS in production (with reverse proxy like Nginx)
- Keep OAuth credentials secure
- Regularly update dependencies
- Backup your database regularly

## Support
For issues or feature requests, please create an issue in the repository.
