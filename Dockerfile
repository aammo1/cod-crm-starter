# ---- deps + builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# Keep downloaded packages across builds and tolerate transient registry failures.
RUN --mount=type=cache,id=cod-crm-npm,target=/root/.npm,sharing=locked \
    npm ci --ignore-scripts --prefer-offline --no-audit --no-fund \
      --fetch-retries=5 --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 --fetch-timeout=300000
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No runtime credentials or persisted store data belong in the build. Test the
# bundled musl native binding in memory; never create a build-time SQLite file.
RUN node -e "const db=require('better-sqlite3')(':memory:'); db.exec('SELECT 1'); db.close()"
RUN DELIVERY_PROVIDER=mock DB_PATH=/tmp/crm-build-must-not-exist/crm.db npm run build \
    && test ! -e /tmp/crm-build-must-not-exist

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DB_PATH=/app/data/crm.db UPLOAD_DIR=/app/data/uploads DELIVERY_PROVIDER=mock PORT=3000 AUTH_TRUST_HOST=true
ENV HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
# Include the full package for CLI scripts as well as traced server imports.
# better-sqlite3 13 ships Node >=22 musl prebuilds (no compiler/install script).
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
RUN mkdir -p /app/data/uploads /app/.next/cache \
    && chown -R nextjs:nodejs /app/data /app/.next/cache
USER nextjs
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
