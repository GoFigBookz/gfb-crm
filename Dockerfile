# Multi-stage build for Enterprise Bookkeeper CRM

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY drizzle.config.ts ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY drizzle.config.ts ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/db ./db
COPY --from=builder /app/.env ./.env
COPY --from=builder /app/db/schema.sql ./db/schema.sql
COPY --from=builder /app/db/full-seed.sql ./db/full-seed.sql
COPY --from=builder /app/db/seed.sql ./db/seed.sql
COPY --from=builder /app/db/seed-clients.sql ./db/seed-clients.sql
COPY --from=builder /app/init.sh ./init.sh

# Create data directory for SQLite database and make init executable
RUN mkdir -p /app/data && chmod +x /app/init.sh

# Install sqlite3 for database initialization
RUN apk add --no-cache sqlite

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start with initialization script
CMD ["/app/init.sh"]
