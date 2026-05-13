# FREE HOME HOSTING with Cloudflare Tunnel
# Zero cost. No port forwarding needed. Works behind any router.

## What You Need
- Any old computer or Raspberry Pi
- Internet connection
- GoDaddy domain (you have this!)
- Free Cloudflare account

## Cost: $0/month forever

---

## Step 1: Prepare Your Home Computer

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Create CRM directory
mkdir -p ~/bookkeeper-crm && cd ~/bookkeeper-crm

# 3. Download the cheap docker-compose
curl -O https://raw.githubusercontent.com/YOUR-REPO/main/docker-compose.cheap.yml
mv docker-compose.cheap.yml docker-compose.yml

# 4. Create .env
cat > .env << 'EOF'
NODE_ENV=production
DATABASE_URL=file:./data/crm.db
VITE_APP_URL=https://crm.yourdomain.com
APP_SECRET=your-secret-key-here
EOF

# 5. Start the CRM
docker-compose up -d
```

---

## Step 2: Setup Cloudflare Tunnel

### Create a Cloudflare Account
1. Go to https://dash.cloudflare.com
2. Sign up (free)
3. Add your domain (from GoDaddy)
4. Change GoDaddy nameservers to Cloudflare's (they'll give you 2 nameservers)

### Install Cloudflared Tunnel

```bash
# Install cloudflared
docker run -d \
  --name cloudflared \
  --restart unless-stopped \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run \
  --token YOUR_TUNNEL_TOKEN
```

### Get Your Tunnel Token

1. In Cloudflare dashboard:
   - Go to **Zero Trust** → **Networks** → **Tunnels**
   - Click **Create a tunnel**
   - Choose **Cloudflared**
   - Name it: `bookkeeper-crm`

2. They'll give you a command like:
```bash
cloudflared tunnel run --token eyJh...
```

3. Copy the token after `--token`

4. Run the Docker command above with your token

### Add Your Domain

In the Cloudflare dashboard:
1. Go to your tunnel → **Public Hostnames**
2. Add:
   - Subdomain: `crm` (or `app`, or `@` for root)
   - Domain: yourdomain.com
   - Path: (leave empty)
   - Service: `http://localhost:3000`

3. Save

---

## Step 3: Done!

Your CRM is now live at:
- `https://crm.yourdomain.com`
- **SSL certificate** included (automatic)
- **DDoS protection** included
- **No ports opened** on your router
- **Works from anywhere** in the world

---

## Why This is Completely Free

| Component | Cost |
|-----------|------|
| Cloudflare account | $0 |
| Cloudflare Tunnel | $0 (unlimited bandwidth) |
| SSL certificate | $0 (auto-renewing) |
| DDoS protection | $0 |
| Using your home internet | $0 (already paying) |
| Old computer / Raspberry Pi | $0-35 (one-time) |
| **Total monthly cost** | **$0** |

---

## Home Server Options

### Option A: Old Computer (Best)
- Any desktop/laptop from 2012+
- 4GB RAM minimum
- Linux (Ubuntu) or Windows + WSL2
- Runs 24/7 or wake-on-demand

### Option B: Raspberry Pi 4 ($35 one-time)
- 2GB or 4GB RAM model
- MicroSD card for storage
- Uses ~5W power ($3/year electricity)
- Perfect for single bookkeeper

### Option C: Raspberry Pi Zero 2 W ($15 one-time)
- 512MB RAM
- Works but slower
- Ultra low power

---

## Backup from Home Server

```bash
# Automatic daily backup to Google Drive
# Install rclone: https://rclone.org

# 1. Setup rclone with Google Drive
rclone config

# 2. Add to crontab
crontab -e

# Add:
0 2 * * * docker cp bookkeeper-crm:/app/data/crm.db /tmp/crm.db && rclone copy /tmp/crm.db gdrive:backups/
```

---

## Troubleshooting

### "Tunnel not connecting"
```bash
# Check cloudflared logs
docker logs cloudflared

# Restart
docker restart cloudflared
```

### "CRM not starting"
```bash
# Check CRM logs
cd ~/bookkeeper-crm
docker-compose logs -f
```

### "Domain not working"
- Make sure GoDaddy nameservers point to Cloudflare
- In Cloudflare DNS, make sure the tunnel CNAME exists
- Wait 5-10 minutes for DNS propagation

---

## Performance Expectations

| Setup | RAM Usage | CPU Usage | Speed |
|-------|-----------|-----------|-------|
| Old PC (4GB) | ~300MB | Low | Fast |
| Raspberry Pi 4 (4GB) | ~300MB | Low | Good |
| Raspberry Pi 4 (2GB) | ~300MB | Medium | Acceptable |
| Raspberry Pi Zero 2W | ~300MB | Higher | Slower |

---

## FAQ

**Q: Is my data safe on a home server?**
A: Yes, with daily backups. SQLite database is a single file—easy to backup.

**Q: Will my internet speed matter?**
A: For 1-2 users, any broadband works. Upload speed affects file uploads.

**Q: Can I access it when away from home?**
A: Yes! That's the point of Cloudflare Tunnel—it works from anywhere.

**Q: What if my internet goes down?**
A: CRM goes offline. But with a VPS ($3-5/month), you get 99.9% uptime.

**Q: Can I move from home to VPS later?**
A: Yes! Just copy the `crm.db` file and `docker-compose.yml` to the new server.

---

## Next Steps

1. ✅ Start with home + Cloudflare Tunnel ($0)
2. ✅ Test for a month
3. ✅ If happy, stay on $0 plan forever
4. ⬆️ If you need more reliability, upgrade to $3-5/month VPS
5. ⬆️ Move your database file (`crm.db`) to the new server
