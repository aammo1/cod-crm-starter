# Task 03: Implement typed store configuration and pure pricing

## Status
pending

## Wave
2

## Description

Make each independent CRM instance configurable while retaining Zehri's COD defaults. Work in `/home/tal7a/Projects/cod-crm-starter`. Safe settings belong to the CRM; Ozon/auth/integration secrets stay in runtime environment variables.

## Dependencies

**Depends on:** task-01-isolated-extraction.md
**Blocks:** task-05-order-persistence.md, task-06-integration-auth.md, task-09-catalog-api.md, task-13-settings-shell.md

**Context from dependencies:** Task 01 copies `app_state` storage, `pricing.ts`, services, auth and workers into a standalone empty CRM. Existing pricing hardcodes shipping 29/free at 400/upsell multiplier 0.7. Parallel task 02 defines generic types/migrations; this task must not edit them or `db.ts`.

## Files to Create

- `src/lib/store-settings-schema.ts` — safe settings validation and types.
- `src/lib/services/store-settings.ts` — `getStoreSettings`, transactional `updateStoreSettings`, safe public projection.

## Files to Modify

- `src/lib/pricing.ts` — pure explicit-rule pricing helpers, preserving MAD formatting.

## Technical Details

1. Settings: `storeName: "COD CRM"`, `shippingFeeMad: 29`, `freeShippingThresholdMad: 400`, `upsellEnabled: true`, `upsellWindowSeconds: 20`, `upsellDiscountPercent: 30`. Use existing `app_state` service; missing state returns defaults with no boot-time seed catalog. Validate bounded nonblank display name; integer nonnegative fees/threshold; window 1–300; discount integer 1–90. Store one validated object atomically, rejecting unknown/secret fields.
2. Currency `MAD`, visible language French, operational timezone `Africa/Casablanca` fixed in v1. Internal warehouse key is `MAIN`, not store display name. Do not mutate historical stock locations in this service.
3. Pure helpers: `shippingFor(subtotal, rules)` and `upsellPriceFor(price, rules)` or equivalent explicit arguments; never import settings service or DB into pricing. Retain optional default arguments for copied callers during transition if needed, but final business paths must pass current/snapshotted rules. Rounding: `Math.round(price * (100 - discountPercent) / 100)`; all amounts safe nonnegative integers.
4. Expose only `{ storeName, currency: "MAD", shippingFeeMad, freeShippingThresholdMad }` to catalog clients. Credentials not part of settings objects or responses. Later settings UI is task 13; no route/UI/env edits here.
5. Document that updates affect new orders/offers, not persisted receipt responses, prices or offer deadlines. On later upsell resolution, shipping must use checkout's stored rule snapshot, not newly changed settings.
6. Verify default and overridden totals, boundary at 400, rounding, invalid settings and persistence using an isolated target DB, then `npm run lint` and `npx tsc --noEmit`. No new dedicated test task is needed.

## Acceptance Criteria

- [ ] Empty store has Zehri-equivalent default totals/upsell rules.
- [ ] Settings persist atomically and expose no environment secrets.
- [ ] Pure pricing functions avoid DB import cycles and accept explicit settings snapshots.
- [ ] Parallel task's migration/types files remain untouched.
