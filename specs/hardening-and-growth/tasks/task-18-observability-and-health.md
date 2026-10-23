# Task 18: Structured logs, per-worker error state and honest health

## Status

complete

## Wave

2

## Description

Logging is ~42 ad-hoc `console.*` calls; there are no request IDs, no `onRequestError` hook and no error tracking. Worker failures log and continue without recording the last error anywhere visible. `/api/health` (`src/app/api/health/route.ts:46-70`) returns OK even when a worker loop has stalled (it reports `lastTickAt` but never compares it with the interval), omits TikTok, does not show the courier provider, and exposes queue counts (`needs_review`, `failed`) publicly.

## Dependencies

**Depends on:** task-04-env-boot-validation.md, task-05-single-process-lease.md
**Blocks:** None

**Context from dependencies:** Task 04 created `src/lib/env.ts` exporting `validateRuntimeEnv()`, `runtimeEnvWarnings()` and `deliveryProviderName()` (`"mock" | "ozon"`), called at the top of `register()` in `src/instrumentation.ts`. Task 05 created `src/lib/services/process-lease.ts` exporting `workerLeaseStatus()` → `{ owned, holder }` and made `startWorkers()` in `src/lib/workers/index.ts` acquire a DB lease before starting workers.

## Files to Create

- `src/lib/log.ts` — tiny JSON logger.
- `src/lib/services/worker-status.ts` — record/read per-worker tick and error state in `app_state`.

## Files to Modify

- `src/instrumentation.ts` — export `onRequestError` (Next 15 instrumentation hook) logging route, method, digest and a redacted message via `log.error`.
- `src/lib/workers/index.ts`, `src/lib/workers/submission.ts`, `src/lib/workers/tracking.ts`, `src/lib/workers/meta.ts`, `src/lib/workers/tiktok.ts` — call `recordWorkerTick(name)` each loop and `recordWorkerError(name, err)` in catches; switch their console calls to `log.*`.
- `src/app/api/health/route.ts` — stall detection, TikTok, provider, warnings, lease; token-gated details.

## Technical Details

### log.ts

```ts
type Level = "debug" | "info" | "warn" | "error";
export const log = {
  info(event: string, fields?: Record<string, unknown>): void, warn(...), error(...), debug(...)
};
// Writes one JSON line: {"ts":"…","level":"info","event":"worker.tick","worker":"submission",…}
```
- `LOG_FORMAT=pretty` (dev default) prints human-readable lines; production default JSON.
- Every string field passes through `redactText` from `src/lib/shipping/redact.ts`. Never log phone numbers, names, addresses, tokens or secrets — add a deny-list of keys (`phone`, `customerPhone`, `name`, `address`, `token`, `password`, `secret`, `authorization`) that are replaced by `"[redacted]"`.
- Server-only.

### worker-status.ts

- `app_state` key `worker_status:<name>` → JSON `{ lastTickAt, lastErrorAt, lastError (redacted, ≤ 300 chars), consecutiveErrors }`.
- `recordWorkerTick` resets `consecutiveErrors`.
- Throttle DB writes for ticks to at most once per 15 s per worker (keep the latest in memory).

### Health

- Public response (no token): `{ status: "ok" | "degraded" | "down", time }` only. HTTP 200 for ok/degraded, 503 for down (DB unreachable).
- With `Authorization: Bearer <HEALTH_DETAILS_TOKEN>` (constant-time compare; disabled when env unset): add `provider` (`deliveryProviderName()`), `warnings` (`runtimeEnvWarnings()`), `lease` (`workerLeaseStatus()`), per-worker `{ enabled, lastTickAt, stale, lastErrorAt, lastError, consecutiveErrors }` for submission, tracking, meta, tiktok, and queue counts.
- `stale` = enabled and `now - lastTickAt > 3 × interval` (read each worker's interval from its module; tracking uses `pollIntervalMs()` from `src/lib/services/tracking.ts`). Any stale enabled worker or `consecutiveErrors >= 5` → `degraded`. Not owning the lease is not degraded (another process owns workers) but report it in details.
- Keep the Docker `HEALTHCHECK` working (it only needs 200).

### Environment Variables

- `HEALTH_DETAILS_TOKEN` — optional, ≥ 32 chars; enables detailed health.
- `LOG_FORMAT` — `json` | `pretty`.

## Acceptance Criteria

- [ ] Public `/api/health` reveals no queue counts.
- [ ] A worker whose loop is stopped for > 3 intervals makes health `degraded` (unit-test the stale computation).
- [ ] Worker errors are visible in detailed health.
- [ ] Logs are single-line JSON in production with no PII.
- [ ] `npm run test:bootstrap` (after build) and `npm run test:crm` pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
