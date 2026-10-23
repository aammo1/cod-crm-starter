# Task 11: Unit test runner, CI coverage and dependency updates

## Status

complete

## Wave

1

## Description

Other tasks add fast unit tests under `scripts/unit/`. This task wires them into `npm test`, extends CI (`.github/workflows/ci.yml`) to run the slower release suites on a schedule/manual trigger plus a Docker build smoke test, adds Dependabot, and adds an assertion that the Next.js internal paths the storefront depends on still exist (`next/dist/shared/lib/get-img-props`, `__NEXT_IMAGE_OPTS`, documented in `docs/template-upgrades.md:77-101`) so a Next bump fails loudly.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-19-backups-offsite-restore.md (next owner of `package.json`)

**Context from dependencies:** None.

## Files to Create

- `scripts/unit/next-internals.test.mjs` — asserts `require.resolve("next/dist/shared/lib/get-img-props")` succeeds and that the `__NEXT_IMAGE_OPTS` usage documented in `docs/template-upgrades.md` is still valid (grep the code that relies on it, e.g. `grep -rn "__NEXT_IMAGE_OPTS\|get-img-props" src`, and assert the corresponding Next files/exports exist).
- `.github/dependabot.yml` — npm weekly (group minor/patch; ignore majors for `next`, `react`, `react-dom`, `zod`, `next-auth`), github-actions weekly.

## Files to Modify

- `package.json` — add `"test:unit": "node --test \"scripts/unit/*.test.mjs\""`, append `npm run test:unit` to the `test` script. (Node 22 supports glob patterns in `--test`.)
- `.github/workflows/ci.yml` — keep the existing `verify` job unchanged except it now runs unit tests via `npm test`. Add:
  - `on: schedule: - cron: "0 3 * * *"` and `workflow_dispatch`.
  - job `release` (runs only on schedule/dispatch, `needs: verify` not required): install Chromium (`sudo apt-get update && sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium`), set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `DELIVERY_PROVIDER: mock`, network block via `NODE_OPTIONS=--import=$GITHUB_WORKSPACE/scripts/block-external-network.mjs` for test steps (not for `npm ci`/apt), then `npm run build`, `npm run test:integration`, `npm run test:fresh-install`, `npm run test:e2e-crm`, `npm run test:order-edits-browser`.
  - job `docker` (on push to main + PRs): `docker build -t store-crm:ci .`, then run the container with ephemeral env (`AUTH_SECRET=$(openssl rand -hex 32)`, `CRM_PUBLIC_URL=http://localhost:3000`, `SECURITY_ALLOWED_ORIGINS=http://localhost:3000`, `DELIVERY_PROVIDER=mock`, `SECURITY_ACCEPT_GLOBAL_BUDGETS=1`, tmpfs/volume for `/app/data` owned by 1001) and poll `curl -fsS http://localhost:3000/api/health` up to 60 s.
  - Set `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.

## Technical Details

- Check each release script's existing env requirements by reading them (`scripts/release-integration.test.mjs`, `scripts/fresh-install.test.mjs`, `scripts/e2e-crm.mjs`, `scripts/order-edits-browser.test.mjs`); some may need `npm run build` first or perform their own build.
- `SECURITY_ACCEPT_GLOBAL_BUDGETS` and required `DELIVERY_PROVIDER` come from task 04 (same wave). Setting them in CI is harmless before task 04 lands.
- The glob must not fail when the directory contains this task's test (it always will, because this task creates `next-internals.test.mjs`).
- Do not pin actions by SHA (cannot be resolved offline) — leave a `# TODO: pin by SHA` comment; it is listed in action-required.md.

## Acceptance Criteria

- [ ] `npm run test:unit` runs every `scripts/unit/*.test.mjs`; `npm test` includes it.
- [ ] `ci.yml` is valid YAML with `verify`, `release` (schedule/dispatch only) and `docker` jobs.
- [ ] `.github/dependabot.yml` exists.
- [ ] `node --test scripts/unit/next-internals.test.mjs` passes locally.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
