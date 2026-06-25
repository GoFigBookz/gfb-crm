# Enterprise Bookkeeper CRM — runs a PRE-BUILT dist shipped in the repo.
# The app is compiled locally/CI (npm run build) and the resulting dist/ is
# committed, so Railway never runs the frontend build (which was failing / serving
# a stale cache and keeping the OLD version live). Railway only installs runtime
# deps and starts the prebuilt server — deterministic, no build step to break.
FROM node:20-alpine
WORKDIR /app

# Runtime dependencies only (includes the native @libsql/client binding, which
# must be installed on the target platform — can't be bundled/committed).
COPY package*.json ./
RUN npm ci --omit=dev

# Prebuilt server + frontend, plus the SQL/init assets boot needs.
COPY dist ./dist
COPY api ./api
COPY contracts ./contracts
COPY db ./db
COPY init.sh ./init.sh

RUN mkdir -p /app/data && chmod +x /app/init.sh
RUN apk add --no-cache sqlite
# Chromium for the "Figs at Work" browser agent (puppeteer-core drives the system
# Chromium — Playwright's bundled build won't run on Alpine/musl). Additive + only
# launched when FIGGY_BROWSER_AGENT=on, so it never affects the rest of the app.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont || true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EXPOSE 3000
CMD ["/app/init.sh"]
