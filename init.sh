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

# Create default admin user if none exists
echo "[INIT] Ensuring admin user exists..."
sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO users (unionId, email, name, role, authProvider, isActive, createdAt, updatedAt) VALUES ('google_105796619971296636840', 'markie@gofig.ca', 'Markie Antle', 'admin', 'google', 1, 1778866324, 1778866324);"
USER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;")
echo "[INIT] $USER_COUNT user(s) in database."

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

PORT="${PORT:-3000}"
echo "[INIT] Starting server on port $PORT..."
export NODE_ENV=production
exec node dist/boot.js
