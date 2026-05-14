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

echo "[INIT] Starting CRM server..."
cd /app
exec node /app/dist/boot.js
