#!/bin/sh
set -e
echo "[INIT] Checking database..."
if [ ! -f /app/data/crm.db ]; then
  sqlite3 /app/data/crm.db < /app/db/schema.sql
fi
echo "[INIT] Force reseeding..."
sqlite3 /app/data/crm.db "DELETE FROM client_onboarding;"
sqlite3 /app/data/crm.db "DELETE FROM clients;"
sqlite3 /app/data/crm.db < /app/db/seed-clients.sql
COUNT=$(sqlite3 /app/data/crm.db "SELECT COUNT(*) FROM clients;")
echo "[INIT] Seeded $COUNT clients!"
cd /app && exec node /app/dist/boot.js
