#!/bin/sh
# Database initialization script for GFB CRM
# Runs on container startup to ensure database exists

DB_PATH="/app/data/crm.db"

if [ ! -f "$DB_PATH" ]; then
  echo "[INIT] Database not found. Creating schema..."
  
  # Create schema from SQL file
  if [ -f "/app/db/schema.sql" ]; then
    sqlite3 "$DB_PATH" < /app/db/schema.sql
    echo "[INIT] Schema created."
  fi
  
  # Seed admin user
  if [ -f "/app/db/seed.sql" ]; then
    sqlite3 "$DB_PATH" < /app/db/seed.sql
    echo "[INIT] Admin user seeded."
  fi
  
  echo "[INIT] Database ready at $DB_PATH"
else
  echo "[INIT] Database exists at $DB_PATH"
fi

# Start the application
echo "[INIT] Starting CRM server..."
exec NODE_ENV=production node dist/boot.js
