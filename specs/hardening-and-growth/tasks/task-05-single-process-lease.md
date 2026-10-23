# Task 05: Enforce one worker owner per database

## Status

complete

## Wave

1

## Description

AGENTS.md says "One process owner per DB", but nothing enforces it: `startWorkers()` in `src/lib/workers/index.ts` only guards with a `globalThis` flag per process. Two containers on the same volume (or a rolling deploy) would both run the parcel submission worker. Also `setStatus` in `src/lib/workers/submission.ts:36-51` updates a submission with no `AND status = 'submitting'` guard, so a late response from a stale process can overwrite an agent's resolution after `resolveStaleSubmitting` moved the row to `needs_review`.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-18-observability-and-health.md

**Context from dependencies:** None.

## Files to Create

- `src/lib/services/process-lease.ts` — DB-backed worker lease.
- `scripts/unit/process-lease.test.mjs` — tests.

## Files to Modify

- `src/lib/workers/index.ts` — acquire the lease before starting workers; heartbeat; release on `SIGTERM`/`SIGINT`/`beforeExit`.
- `src/lib/workers/submission.ts` — guarded status transitions.

## Technical Details

### Lease design (process-lease.ts)

- Store in `app_state` (key/value table, see `src/lib/services/app-state.ts` for helpers and `migrations/004_app_state.sql`) under key `worker_lease`, value JSON `{ ownerId, pid, hostname, acquiredAt, heartbeatAt }`.
- `ownerId = randomUUID()` per process.
- `acquireWorkerLease(now)`: in a `db.transaction(...).immediate()`, read the row; acquire if absent, owned by me, or `heartbeatAt` older than `LEASE_TTL_MS = 90_000`. Return `{ acquired: boolean, holder }`.
- `heartbeatWorkerLease()` every 30 s (unref'd interval): update only `WHERE` value's `ownerId` matches (read-check-write in an immediate transaction). If lost, stop the worker timers (clear the `globalThis.__crm*Worker` intervals) and log an error.
- `releaseWorkerLease()` deletes the row if owned by me.
- If not acquired at boot: log `[workers] un autre processus détient déjà les workers (pid …, host …) — workers non démarrés dans ce processus.` and retry acquisition every 60 s (a crashed owner's lease expires after 90 s). Do **not** steal a live lease.
- Export `workerLeaseStatus()` → `{ owned: boolean, holder: {...} | null }` for health (task 18).

### Submission guard

In `src/lib/workers/submission.ts`, every transition from an in-flight request result must be `UPDATE courier_submissions SET … WHERE id = ? AND status = 'submitting'`. If `changes === 0`, log `[submission] résultat ignoré pour <id> : statut modifié entre-temps` (redacted, no credentials) and do not apply side effects (tracking number, order updates). Read the current code carefully: parcel creation is only by this worker, and uncertain outcomes must still go to `needs_review` — do not change retry/backoff semantics.

### Tests

- Two "processes" (two owner IDs, same temp DB) → only first acquires; second acquires after TTL expiry; heartbeat by non-owner fails.
- Release lets another acquire immediately.
- Guarded update: simulate status changed to `needs_review` before the result lands → row unchanged. Extend `scripts/submission-resolution.test.mjs` if that's simpler for the guard.

## Acceptance Criteria

- [ ] Only one process per DB runs workers; the other logs and retries.
- [ ] A stale in-flight result cannot overwrite a changed submission status.
- [ ] `npm run test:crm` and new unit tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
