# Task 04: Fail-fast environment validation and explicit courier provider

## Status

complete

## Wave

1

## Description

Required production settings (`AUTH_SECRET`, `CRM_PUBLIC_URL`, `SECURITY_ALLOWED_ORIGINS`) are only enforced by Compose `:?` checks; plain `node server.js` starts and fails later at request time (e.g. `src/lib/order-token.ts:12-13`). The image defaults to `DELIVERY_PROVIDER=mock` (`Dockerfile:21`, `docker-compose.yml:21`), so a live store that forgets the variable takes orders that never become parcels. Without `SECURITY_TRUSTED_IP_HEADER` only global rate-limit buckets exist, so one client can block all checkouts and logins. TikTok env vars exist in `.env.example` and `src/lib/services/tiktok.ts` but are missing from `docker-compose.yml`. Add a validated env module checked at boot.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-18-observability-and-health.md

**Context from dependencies:** None.

## Files to Create

- `src/lib/env.ts` — zod schema + `validateRuntimeEnv()` + `deliveryProviderName()` helper + `runtimeEnvWarnings()`.
- `scripts/unit/env.test.mjs` — unit tests.

## Files to Modify

- `src/instrumentation.ts` — call `validateRuntimeEnv()` at the top of the `nodejs` branch, before starting workers.
- `Dockerfile` — remove `DELIVERY_PROVIDER=mock` from the runtime `ENV` line (keep it on the build `RUN` line at line 15).
- `docker-compose.yml` — `DELIVERY_PROVIDER: ${DELIVERY_PROVIDER:?set mock or ozon}`; add `SECURITY_TRUSTED_IP_HEADER`, `SECURITY_ACCEPT_GLOBAL_BUDGETS`, and all `TIKTOK_*` variables used in `src/lib/services/tiktok.ts`/`.env.example` (pass-through, optional).
- `.env.example` — document `DELIVERY_PROVIDER` (required in production: `mock` or `ozon`), `SECURITY_ACCEPT_GLOBAL_BUDGETS`.
- Any test/verification script that starts the **production** server (`grep -rln "server.js\|next start\|npm run start" scripts/`; at least `scripts/bootstrap.test.mjs`, `scripts/release-integration.test.mjs`, `scripts/fresh-install.test.mjs`, `scripts/e2e-crm.mjs`, `scripts/perf-budget.mjs` if it starts a server) — make sure the spawned env sets `DELIVERY_PROVIDER=mock` and `SECURITY_ACCEPT_GLOBAL_BUDGETS=1` (or a trusted header) so they keep passing.

## Technical Details

### Rules (only when `NODE_ENV === "production"` and not during `NEXT_PHASE === "phase-production-build"`)

- `AUTH_SECRET`: required, ≥ 32 chars.
- `CRM_PUBLIC_URL`: required, absolute `http(s)` URL, no path other than `/`.
- `SECURITY_ALLOWED_ORIGINS`: required, comma list of exact origins (reuse the same parsing rules as the middleware origin check; do not loosen them — read `src/middleware.ts` / `src/lib/browser-mutation.ts` to reuse the parser if exported).
- `DELIVERY_PROVIDER`: required and must be exactly `mock` or `ozon`. Runtime selection semantics stay unchanged elsewhere (only exact `mock` selects mock; this module just refuses to boot when unset/other in production).
- If `DELIVERY_PROVIDER=ozon`: required Ozon credential vars as read by `src/lib/shipping/ozon.ts` (check names there) must be non-empty. Never log their values.
- Either `SECURITY_TRUSTED_IP_HEADER` is non-empty, or `SECURITY_ACCEPT_GLOBAL_BUDGETS=1` is set explicitly (acknowledging global-only rate limits).
- On failure: throw `Error` listing every problem by variable name only (no values), in French, e.g. `Configuration invalide : AUTH_SECRET manquant ; DELIVERY_PROVIDER doit valoir "mock" ou "ozon".`

### Warnings (logged once at boot via `console.warn`, also exported for health):

- `DELIVERY_PROVIDER=mock` with `NODE_ENV=production` → `⚠️ Transporteur fictif (mock) actif en production : aucun colis réel ne sera créé.`
- `SECURITY_ACCEPT_GLOBAL_BUDGETS=1` → warn that one client can exhaust global budgets.

### Fresh-start constraint

AGENTS.md requires "No paid keys or production credentials required for fresh empty startup". `DELIVERY_PROVIDER=mock` + `SECURITY_ACCEPT_GLOBAL_BUDGETS=1` + secrets is a valid production-mode start without paid keys. Development (`npm run dev`) must not require any of this.

### Exports

```ts
export function validateRuntimeEnv(env?: NodeJS.ProcessEnv): void;
export function runtimeEnvWarnings(env?: NodeJS.ProcessEnv): string[];
export function deliveryProviderName(env?: NodeJS.ProcessEnv): "mock" | "ozon"; // "mock" only for exact "mock"
```

`src/lib/env.ts` is server-only (`import "server-only"` is fine if tests can load it; otherwise omit and never import from client code).

### Tests

Cover: dev mode no-op; production missing each var; invalid provider; mock warning; ozon without creds; trusted header vs acknowledgment; build phase skipped; error message contains names but never values.

## Acceptance Criteria

- [ ] Production boot without required vars exits with a clear French error naming the variables.
- [ ] The Docker image no longer defaults to mock at runtime; Compose requires `DELIVERY_PROVIDER`.
- [ ] Mock in production logs a loud warning.
- [ ] TikTok vars are passed through in Compose.
- [ ] `npm run dev`, `DELIVERY_PROVIDER=mock npm run build`, `npm run test:bootstrap` still work.
- [ ] `node --test scripts/unit/env.test.mjs` passes.

## Notes

Task 18 will surface `deliveryProviderName()` and `runtimeEnvWarnings()` in `/api/health`; task 16 relies on the trusted-IP-or-acknowledgment rule. Task 35 updates `docs/operations.md`.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.

