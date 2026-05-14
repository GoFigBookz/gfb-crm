# Multi-stage build for Enterprise Bookkeeper CRM
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY drizzle.config.ts ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY drizzle.config.ts ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/db ./db
COPY --from=builder /app/db/schema.sql ./db/schema.sql
COPY --from=builder /app/db/full-seed.sql ./db/full-seed.sql
COPY --from=builder /app/db/seed.sql ./db/seed.sql
COPY --from=builder /app/init.sh ./init.sh
RUN mkdir -p /app/data && chmod +x /app/init.sh
RUN apk add --no-cache sqlite
EXPOSE 3000
CMD ["/app/init.sh"]
