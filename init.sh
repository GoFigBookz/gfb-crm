#!/bin/sh
# GFB CRM Init Script - Auto-detects schema changes and recreates DB if needed
DB_PATH="/app/data/crm.db"
SCHEMA_FILE="/app/db/schema.sql"
SEED_FILE="/app/db/seed-clients.sql"

echo "[INIT] Starting GFB CRM init..."

# Check if database exists and has the full schema (check for a column that only exists in new schema)
NEEDS_RECREATE=0
if [ ! -f "$DB_PATH" ]; then
  echo "[INIT] Database not found. Will create."
  NEEDS_RECREATE=1
else
  # Check if the clients table has the 'hasHST' column (new schema has it, old doesn't)
  HAS_HST=$(sqlite3 "$DB_PATH" "PRAGMA table_info(clients)" | grep -c "hasHST" || echo "0")
  if [ "$HAS_HST" = "0" ]; then
    echo "[INIT] Old schema detected (missing hasHST column). Recreating database..."
    NEEDS_RECREATE=1
  else
    echo "[INIT] Database exists with correct schema."
  fi
fi

if [ "$NEEDS_RECREATE" = "1" ]; then
  rm -f "$DB_PATH"
  if [ -f "$SCHEMA_FILE" ]; then
    sqlite3 "$DB_PATH" < "$SCHEMA_FILE"
    echo "[INIT] Schema created from schema.sql"
  else
    echo "[INIT] WARNING: schema.sql not found."
  fi
fi

# Create default admin user if none exists
echo "[INIT] Ensuring admin user exists..."
sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO users (unionId, email, name, role, authProvider, isActive, createdAt, updatedAt) VALUES ('google_105796619971296636840', 'markie@gofig.ca', 'Markie Antle', 'admin', 'google', 1, 1778866324, 1778866324);"
USER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;")
echo "[INIT] $USER_COUNT user(s) in database."

# Seed clients only on first-time setup
if [ -f "$SEED_FILE" ]; then
  CLIENT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM clients;" 2>/dev/null || echo "0")
  if [ "$CLIENT_COUNT" = "0" ]; then
    echo "[INIT] First-time setup: seeding clients..."
    sqlite3 "$DB_PATH" < "$SEED_FILE"
    COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM clients;")
    echo "[INIT] Seeded $COUNT clients!"
  else
    echo "[INIT] Database already has $CLIENT_COUNT clients. Skipping seed."
  fi
else
  echo "[INIT] WARNING: seed-clients.sql not found."
fi

PORT="${PORT:-3000}"
echo "[INIT] Starting server on port $PORT..."
export NODE_ENV=production
exec node dist/boot.js
