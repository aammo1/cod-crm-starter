# Task 16: Fill the Ozon STATUS_MAP from verified samples

## Status

pending

## Wave

7

## Description

Ozon Express is the only courier. `src/lib/shipping/status-map.ts` currently has `STATUS_MAP = {}`, so every tracking status normalises to `unknown`. That means:
- The CRM never shows delivered, refused or returning parcels.
- Returns and COD tracking don't progress.

This was deliberately left empty, because the AGENTS.md invariant says: "Unknown/unverified tracking statuses never automatically change stock; do not invent verified mappings." This task fills the map **only from real statuses the owner captured** from a live Ozon account. It also confirms the phone format Ozon accepts.

**Blocked until the owner provides `docs/ozon-status-samples.md`** (see `action-required.md`). If that file does not exist, stop immediately, make no changes, and report "blocked: waiting for docs/ozon-status-samples.md".

## Dependencies

**Depends on:** task-15-docs-and-perf-budget.md (scheduling only, so it runs last. There is no technical dependency.)
**Blocks:** None

**Context from dependencies:** None technically. Relevant existing code:
- `src/lib/shipping/status-map.ts`: `STATUS_MAP` plus the normaliser.
- `src/lib/shipping/ozon.ts`: the adapter. Line ~379 has an unverified `06XXXXXXXX` phone format note, and `toOzonPhone` is in `src/lib/phone.ts`.
- `src/lib/shipping/POLICY.md`: the submission and tracking policy.
- `src/lib/services/tracking.ts` and `src/lib/workers/tracking.ts`: the poller. Tracking is the only writer of parcel status.
- `scripts/tracking-workflow.test.mjs`: the tracking tests.
- `scripts/ozon-verify.mjs`: the owner's live verification helper.

The normalised statuses are `delivered`, `refused`, `cancelled`, `return_in_transit`, `in_transit`, `at_facility`, `out_for_delivery`, `unknown`.

## Files to Create

- None. `docs/ozon-status-samples.md` is provided by the owner.

## Files to Modify

- `src/lib/shipping/status-map.ts`: add exactly the verified raw→normalised entries.
- `src/lib/shipping/ozon.ts` and/or `src/lib/phone.ts`: only if the samples file states a different accepted phone format than the current one.
- `scripts/tracking-workflow.test.mjs`: add cases for each new mapping (raw string → normalised), using the existing mock patterns.
- `src/lib/shipping/POLICY.md`: record the verification date and source ("owner-verified, docs/ozon-status-samples.md, YYYY-MM-DD").

## Technical Details

1. Read `docs/ozon-status-samples.md`. Expect lines like `"Livré" → delivered`, `"Refusé" → refused`, `"Retourné" / "En cours de retour" → return_in_transit`, and so on. Use the **exact** raw strings, including accents and case. Check how the normaliser compares strings (exact, trimmed, lowercase) and keep the same approach.
2. Map **only** the statuses listed in the file. Anything else stays `unknown`.
3. Check how each normalised status affects stock and returns in `services/tracking.ts` and `services/returns.ts`. Do not change that logic. If a mapping would cause an automatic stock change that the policy forbids, stop and report instead of mapping it.
4. Phone: if the file confirms a format, set `toOzonPhone` to produce it and update the comment at `ozon.ts:~379` to say it is verified.
5. Run `npm run test:crm` with the external network blocked (`NODE_OPTIONS=--import=$(pwd)/scripts/block-external-network.mjs`) and `DELIVERY_PROVIDER=mock`.

## Acceptance Criteria

- [ ] If the samples file is missing, no changes are made and the task reports that it is blocked.
- [ ] Every entry in `STATUS_MAP` corresponds 1:1 to a line in `docs/ozon-status-samples.md`.
- [ ] New tests cover each mapping. `npm run test:crm` passes.
- [ ] POLICY.md records the verification source and date.
- [ ] No live Ozon calls are made during verification.
