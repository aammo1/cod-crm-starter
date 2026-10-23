# Task 34: Code consistency cleanup

## Status

complete

## Wave

7

## Description

Low-risk maintainability fixes deferred to the end so they don't collide with feature work: `cn` is imported two ways (18 files import from the `"cn"` package directly, 8 via `@/lib/utils`); `src/components/crm/manual-order-form.tsx` is ~1,040 lines; three scripts (`scripts/sync-cities.mjs`, `scripts/ozon-verify.mjs`, `scripts/purge-confirmed-tests.mjs`) are not wired into npm and appear only in `docs/extraction-manifest.md`.

## Dependencies

**Depends on:** task-33-consent-and-snap-pixel.md (and transitively all earlier tasks)
**Blocks:** task-35-docs-and-env-sync.md

**Context from dependencies:** All feature tasks are complete; no other task is editing source files now.

## Files to Modify

- Every file importing `cn` from `"cn"` (`grep -rln 'from "cn"' src`) — import from `@/lib/utils` instead (`src/lib/utils.ts:1` re-exports it). Behavior identical.
- `src/components/crm/manual-order-form.tsx` — split into sub-components in `src/components/crm/manual-order/` (e.g. `customer-fields.tsx`, `line-items.tsx`, `totals-preview.tsx`, `shipping-fields.tsx`), keeping the default export path and props unchanged. Pure refactor: no behavior or copy changes.
- `package.json` — add `"cities:sync": "node scripts/sync-cities.mjs"`, `"ozon:verify": "node scripts/ozon-verify.mjs"`, `"purge-confirmed-tests": "node scripts/purge-confirmed-tests.mjs"` **only after reading each script** and confirming it is safe/intended for operators (ozon-verify calls the live courier — the npm script must print a warning and require an explicit `--live` flag if the script doesn't already; never run it). If a script is obsolete, delete it and remove it from `docs/extraction-manifest.md` instead.

## Technical Details

- Add an ESLint `no-restricted-imports` rule in the ESLint config forbidding `"cn"` outside `src/lib/utils.ts` to prevent regressions.
- For the form split, run `npm run test:crm` (manual-order tests) and `npm run test:e2e-crm` if possible.

## Acceptance Criteria

- [ ] `grep -rn 'from "cn"' src` only matches `src/lib/utils.ts`.
- [ ] Manual order form behaves identically; file under ~300 lines.
- [ ] Scripts are either wired with safe npm names or removed.
- [ ] Lint, typecheck, build, perf-budget and tests pass.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
