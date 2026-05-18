#!/bin/sh
set -e

echo "[INIT] Checking database..."
if [ ! -f /app/data/crm.db ]; then
  echo "[INIT] Initializing database..."
  sqlite3 /app/data/crm.db < /app/db/schema.sql
  echo "[INIT] Database initialized."
else
  echo "[INIT] Database exists at /app/data/crm.db"
fi

CLIENT_COUNT=$(sqlite3 /app/data/crm.db "SELECT COUNT(*) FROM clients;" 2>/dev/null || echo "0")
echo "[INIT] Current client count: $CLIENT_COUNT"

if [ "$CLIENT_COUNT" = "0" ]; then
  echo "[INIT] Seeding active clients from master list..."
  sqlite3 /app/data/crm.db < /app/db/seed-clients.sql
  FINAL_COUNT=$(sqlite3 /app/data/crm.db "SELECT COUNT(*) FROM clients;")
  echo "[INIT] Seeded $FINAL_COUNT clients successfully!"
else
  echo "[INIT] Clients already exist — skipping seed."
fi

echo "[INIT] Starting CRM server..."
cd /app
exec node /app/dist/boot.js
