# CHEAPEST HOSTING GUIDE - Enterprise Bookkeeper CRM

> **Goal:** Run this CRM for the least amount of money possible. Options range from **FREE** to **$5/month**.

---

## 🏆 OPTION 1: FREE - Home Server + Cloudflare Tunnel (Recommended for Testing)

**Cost:** $0/month | **Requirements:** Old computer or Raspberry Pi

### What You Need
- Any old computer (even 10+ years old)
- Or a Raspberry Pi ($35 one-time purchase)
- Internet connection
- GoDaddy domain (you already have this!)

### Setup

```bash
# 1. Install Docker on your home machine
curl -fsSL https://get.docker.com | sh

# 2. Download the CRM
cd /opt
wget https://your-domain.com/crm.tar.gz

# 3. Use the CHEAP docker-compose
cd /opt/bookkeeper-crm
cp docker-compose.cheap.yml docker-compose.yml

# 4. Start it
docker-compose up -d

# 5. Install Cloudflare Tunnel (creates secure tunnel to your domain)
docker run -d \
  --name cloudflared \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run \
  --token YOUR_CLOUDFLARE_TOKEN
```

### Why This Works
- Cloudflare Tunnel creates a secure HTTPS connection from their edge to your home server
- No need to open ports on your router
- No need for a public IP
- SSL certificate handled automatically
- **Completely free**

---

## 🥈 OPTION 2: $3-5/month - Cheapest VPS

**Cost:** $3-5/month | **Best for:** Production use with your GoDaddy domain

### Recommended Providers (from cheapest to best value)

| Provider | Price | RAM | Why |
|----------|-------|-----|-----|
| **RackNerd** | $10-12/YEAR | 1GB | Cheapest annual plans |
| **VirMach** | $1-2/month | 512MB | Ultra cheap |
| **LetBox** | $3/month | 1GB | Good storage |
| **Hetzner CX11** | ~$4.50/month | 2GB | Best performance/price |
| **DigitalOcean** | $6/month | 1GB | Reliable, good support |
| **Vultr** | $5/month | 1GB | Simple, fast deploy |
| **Linode** | $5/month | 1GB | Long-running provider |

### One-Line Deploy Script

```bash
# Run this on your fresh Ubuntu server (copy-paste entire thing)
curl -fsSL https://raw.githubusercontent.com/YOUR-REPO/main/cheap-install.sh | bash
```

Or manually:

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker

# 2. Create app directory
mkdir -p /opt/bookkeeper-crm && cd /opt/bookkeeper-crm

# 3. Download compose file
curl -O https://raw.githubusercontent.com/YOUR-REPO/main/docker-compose.cheap.yml
mv docker-compose.cheap.yml docker-compose.yml

# 4. Create .env
cat > .env << 'EOF'
NODE_ENV=production
DATABASE_URL=file:./data/crm.db
VITE_APP_URL=https://your-godaddy-domain.com
APP_SECRET=your-super-secret-key-min-32-chars-long!!
GOOGLE_CLIENT_ID=your-google-id
GOOGLE_CLIENT_SECRET=your-google-secret
MICROSOFT_CLIENT_ID=your-microsoft-id
MICROSOFT_CLIENT_SECRET=your-microsoft-secret
EOF

# 5. Start
docker-compose up -d

# 6. Setup SSL with Let's Encrypt (free!)
sudo apt install nginx certbot python3-certbot-nginx -y
sudo tee /etc/nginx/sites-available/crm << 'NGINX'
server {
    listen 80;
    server_name your-godaddy-domain.com www.your-godaddy-domain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
sudo certbot --nginx -d your-godaddy-domain.com -d www.your-godaddy-domain.com --agree-tos -n -m your-email@example.com
```

---

## 🥉 OPTION 3: FREE TIER - Cloud Platforms

**Cost:** $0/month (with limits) | **Best for:** Small-scale, learning

### Railway.app (Free Tier)
- 500 hours/month free (good for development)
- SQLite works fine
- Auto-deploy from GitHub
- **Limit:** Sleeps after inactivity

### Render.com (Free Tier)
- Web services: Free forever (sleeps after 15 min)
- 512MB RAM, shared CPU
- Custom domain supported
- **Limit:** Spins down, slow wake-up

### Fly.io (Free Tier)
- $5/month credit = ~1 small VM always-on
- SQLite supported with volumes
- Global edge network
- **Good option** if you want always-free-ish

### Deploy to Railway (Free)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create project
railway init

# 4. Deploy
railway up

# 5. Add domain
railway domain
```

---

## 🔧 OPTION 4: Super Minimal - No Docker

**Cost:** $0-3/month | **Best for:** Absolute minimal resource usage

Run directly with Node.js (uses even less RAM than Docker):

```bash
# On any server with Node.js 20+
git clone <repo>
cd bookkeeper-crm
npm install
npm run build

# Use SQLite version
mv db/sqlite-schema.ts db/schema.ts
npm install better-sqlite3

# Start with PM2 (keeps it running)
npm install -g pm2
pm2 start npm --name "crm" -- start
pm2 save
pm2 startup
```

**RAM Usage:** ~150MB (vs 500MB+ with MySQL/Docker)

---

## 📊 Cost Comparison Summary

| Option | Monthly Cost | RAM Needed | Best For |
|--------|-------------|------------|----------|
| Home + Cloudflare Tunnel | **$0** | 512MB | Testing, personal use |
| Raspberry Pi + Tunnel | **$0** | 1GB | Permanent home setup |
| VirMach VPS | **$1-2** | 512MB | Budget production |
| RackNerd VPS | **$1-2** | 1GB | Annual payment |
| Hetzner CX11 | **$4.50** | 2GB | Best performance/price |
| DigitalOcean | **$6** | 1GB | Reliable, good support |
| Railway Free | **$0** | 512MB | Development only |
| Render Free | **$0** | 512MB | Sporadic use |
| Fly.io | **$0-3** | 256MB | Always-on light usage |

---

## 🚀 Recommended Path

### For Learning/Testing:
1. Use the **interactive demo** (already live)
2. Run **home server + Cloudflare Tunnel** ($0)

### For Real Business Use:
1. Buy **RackNerd or Hetzner** VPS ($2-5/month)
2. Point GoDaddy domain to VPS IP
3. Use the **cheap docker-compose** (SQLite, single container)
4. Add **Let's Encrypt SSL** (free)

### When You Grow:
1. Upgrade to bigger VPS
2. Switch from SQLite to MySQL
3. Add backup automation

---

## 📁 Files for Cheap Deployment

| File | Purpose |
|------|---------|
| `docker-compose.cheap.yml` | Single-container, SQLite version |
| `db/sqlite-schema.ts` | SQLite database schema |
| `cheap-install.sh` | One-line server setup script |
| `CHEAP_DEPLOY.md` | This guide |

---

## 🔐 GoDaddy DNS Setup (All Options)

In your GoDaddy Domain Manager:

1. **DNS Management**
2. Add these records:

```
Type: A     Name: @     Value: YOUR_SERVER_IP      TTL: 600
Type: A     Name: crm   Value: YOUR_SERVER_IP      TTL: 600
Type: CNAME Name: www   Value: yourdomain.com      TTL: 600
```

For **Cloudflare Tunnel** (home hosting):
```
Type: CNAME  Name: @    Value: YOUR_TUNNEL_ID.cfargotunnel.com  TTL: Auto
```

---

## 💾 Backup Strategy (Important!)

SQLite makes backups super easy:

```bash
# Daily backup to Google Drive or any cloud
crontab -e

# Add this line for daily 2am backup:
0 2 * * * cp /opt/bookkeeper-crm/data/crm.db /backups/crm-$(date +\%Y\%m\%d).db

# Or sync to Dropbox/rclone target:
0 2 * * * rclone copy /opt/bookkeeper-crm/data/crm.db remote:backups/
```

Your entire database is a single file! Copy it anywhere.

---

## ✅ Checklist Before Going Live

- [ ] Domain pointing to server (GoDaddy DNS)
- [ ] SSL certificate working (https://)
- [ ] Google OAuth credentials added
- [ ] Microsoft OAuth credentials added
- [ ] Admin user created
- [ ] First client added
- [ ] Backup cron job set up
- [ ] Server auto-restart configured (PM2 or systemd)

---

## 🆘 Need Help?

The **cheapest possible** way to get started:
1. Open the demo: https://kfqbxth3ghdts.kimi.show
2. Test all features
3. When ready, use **Option 2** ($3-5 VPS) for production
4. Your entire data file can be moved anywhere—no vendor lock-in!
