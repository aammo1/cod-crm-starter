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
RUN npm run build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DB_PATH=/app/data/crm.db AUTH_TRUST_HOST=true
ENV HOSTNAME="0.0.0.0"
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/lib/services/inventory-test-cleanup.mjs ./src/lib/services/inventory-test-cleanup.mjs
RUN mkdir -p /app/data /app/data/uploads
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
