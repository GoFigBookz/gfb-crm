#!/bin/bash
# CHEAP INSTALL SCRIPT for Enterprise Bookkeeper CRM
# One-click setup for cheap VPS ($3-5/month) or home server
# Usage: curl -fsSL https://your-domain.com/cheap-install.sh | bash

set -e

APP_DIR="/opt/bookkeeper-crm"
DATA_DIR="$APP_DIR/data"
DOMAIN="${1:-}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Enterprise Bookkeeper CRM - CHEAP INSTALLER            ║"
echo "║   Single container + SQLite = $3-5/month hosting         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use: sudo su -)"
    exit 1
fi

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
    echo "✓ ARM64 detected (Raspberry Pi / ARM server)"
elif [ "$ARCH" = "x86_64" ]; then
    echo "✓ x86_64 detected (standard VPS)"
else
    echo "✓ Architecture: $ARCH"
fi

# Step 1: Install Docker
echo ""
echo "[1/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker $(whoami) 2>/dev/null || true
    systemctl enable docker
    systemctl start docker
    echo "✓ Docker installed"
else
    echo "✓ Docker already installed"
fi

# Step 2: Install Docker Compose
echo ""
echo "[2/8] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo "✓ Docker Compose installed"
else
    echo "✓ Docker Compose already installed"
fi

# Step 3: Create directories
echo ""
echo "[3/8] Creating application directories..."
mkdir -p $APP_DIR
mkdir -p $DATA_DIR
mkdir -p $APP_DIR/uploads
mkdir -p $APP_DIR/backups
mkdir -p $APP_DIR/nginx
echo "✓ Directories created at $APP_DIR"

# Step 4: Download docker-compose
echo ""
echo "[4/8] Downloading CRM configuration..."
cd $APP_DIR

# Create docker-compose.cheap.yml locally
cat > docker-compose.yml << 'COMPOSE'
version: "3.8"
services:
  app:
    image: node:20-alpine
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:./data/crm.db
      - VITE_APP_URL=http://localhost:3000
      - APP_SECRET=auto-generated-secret-replace-me
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
      - ./backups:/app/backups
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
COMPOSE

echo "✓ Configuration written"

# Step 5: Create .env
echo ""
echo "[5/8] Creating environment file..."
SECRET=$(openssl rand -base64 32 2>/dev/null || dd if=/dev/urandom bs=32 count=1 2>/dev/null | base64)
cat > $APP_DIR/.env << ENV
NODE_ENV=production
DATABASE_URL=file:./data/crm.db
VITE_APP_URL=http://localhost:3000
APP_SECRET=$SECRET
# Add your OAuth credentials below:
# GOOGLE_CLIENT_ID=your-google-client-id
# GOOGLE_CLIENT_SECRET=your-google-secret
# MICROSOFT_CLIENT_ID=your-microsoft-client-id
# MICROSOFT_CLIENT_SECRET=your-microsoft-secret
ENV
echo "✓ Environment file created"

# Step 6: Setup auto-restart
echo ""
echo "[6/8] Setting up auto-restart..."
cat > /etc/systemd/system/bookkeeper-crm.service << 'SERVICE'
[Unit]
Description=Bookkeeper CRM
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/bookkeeper-crm
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable bookkeeper-crm
echo "✓ Auto-restart configured"

# Step 7: Setup daily backup
echo ""
echo "[7/8] Setting up daily backups..."
cat > /usr/local/bin/crm-backup.sh << 'BACKUP'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/bookkeeper-crm/backups"
DATA_DIR="/opt/bookkeeper-crm/data"

# Create backup
mkdir -p $BACKUP_DIR
cp $DATA_DIR/crm.db $BACKUP_DIR/crm_$DATE.db

# Keep only last 30 backups
ls -t $BACKUP_DIR/crm_*.db | tail -n +31 | xargs -r rm

echo "Backup created: crm_$DATE.db"
BACKUP
chmod +x /usr/local/bin/crm-backup.sh

# Add cron job
echo "0 2 * * * root /usr/local/bin/crm-backup.sh >> /var/log/crm-backup.log 2>&1" > /etc/cron.d/bookkeeper-crm
chmod 644 /etc/cron.d/bookkeeper-crm
echo "✓ Daily backups at 2:00 AM"

# Step 8: Setup Nginx + SSL (if domain provided)
echo ""
if [ -n "$DOMAIN" ]; then
    echo "[8/8] Setting up Nginx + SSL for $DOMAIN..."
    
    apt-get update -qq
    apt-get install -y -qq nginx certbot python3-certbot-nginx
    
    cat > /etc/nginx/sites-available/crm << NGINX
server {
    listen 80;
    server_name $DOMAIN;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX
    
    ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx
    
    # Get SSL certificate
    certbot --nginx -d $DOMAIN --agree-tos -n -m admin@$DOMAIN 2>/dev/null || echo "⚠ SSL setup failed - run manually: certbot --nginx -d $DOMAIN"
    
    # Auto-renew cron
    echo "0 3 * * * root certbot renew --quiet --nginx" > /etc/cron.d/certbot-renew
    
    echo "✓ Nginx + SSL configured"
else
    echo "[8/8] Skipping Nginx setup (no domain provided)"
    echo "    To add later: ./install.sh yourdomain.com"
    echo "    Or access directly at http://YOUR_SERVER_IP:3000"
fi

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              INSTALLATION COMPLETE!                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "📁 Location: $APP_DIR"
echo "📊 Database: $DATA_DIR/crm.db (SQLite - single file)"
echo "💾 Backups: $APP_DIR/backups/ (daily at 2 AM)"
echo ""
if [ -n "$DOMAIN" ]; then
    echo "🌐 Website: https://$DOMAIN"
else
    echo "🌐 Website: http://YOUR_SERVER_IP:3000"
fi
echo ""
echo "🔧 Next steps:"
echo "   1. Edit $APP_DIR/.env and add your Google/Microsoft OAuth IDs"
echo "   2. Start the app: cd $APP_DIR && docker-compose up -d"
echo "   3. Or: systemctl start bookkeeper-crm"
echo ""
echo "📋 Useful commands:"
echo "   docker-compose logs -f    # View logs"
echo "   docker-compose down         # Stop"
echo "   docker-compose up -d        # Start"
echo "   crm-backup.sh             # Manual backup"
echo ""
echo "📖 Full guide: CHEAP_DEPLOY.md"
echo ""
