#!/bin/sh
DB_PATH="/app/data/crm.db"
SCHEMA_FILE="/app/db/schema.sql"
SEED_FILE="/app/db/seed-clients.sql"

echo "[INIT] Starting GFB CRM init..."

if [ ! -f "$DB_PATH" ]; then
  echo "[INIT] Database not found. Creating from schema..."
  if [ -f "$SCHEMA_FILE" ]; then
    sqlite3 "$DB_PATH" < "$SCHEMA_FILE"
    echo "[INIT] Schema created."
  else
    echo "[INIT] WARNING: schema.sql not found."
  fi
else
  echo "[INIT] Database exists."
fi

echo "[INIT] Running migrations..."
sqlite3 "$DB_PATH" "ALTER TABLE clients ADD COLUMN industry text DEFAULT 'other';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE clients ADD COLUMN province text DEFAULT 'ON';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE clients ADD COLUMN qboAccountType text DEFAULT 'ca_clients';" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE clients ADD COLUMN figgyEmail text;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE clients ADD COLUMN contactName text;" 2>/dev/null || true
echo "[INIT] Migrations complete."

if [ -f "$SEED_FILE" ]; then
  echo "[INIT] Reseeding clients..."
  sqlite3 "$DB_PATH" "DELETE FROM client_onboarding;" 2>/dev/null || true
  sqlite3 "$DB_PATH" "DELETE FROM clients;" 2>/dev/null || true
  sqlite3 "$DB_PATH" < "$SEED_FILE"
  COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM clients;")
  echo "[INIT] Seeded $COUNT clients!"
else
  echo "[INIT] WARNING: seed-clients.sql not found."
fi

echo "[INIT] Starting server..."
exec NODE_ENV=production node dist/boot.js
