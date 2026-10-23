# Task 07: Generalize inventory lookups and stock input

## Status
complete

## Wave
4

## Description

Retain Zehri's stock ledger/reservation guarantees while replacing color/size joins and warehouse branding with generic variants. This is the only service allowed to write stock. Work in `/home/tal7a/Projects/cod-crm-starter`, an independent French/MAD COD CRM instance.

## Dependencies

**Depends on:** task-04-catalog-service.md, task-05-order-persistence.md
**Blocks:** task-10-order-operations.md, task-11-order-api.md, task-12-stock-workspace.md, task-14-fulfillment.md

**Context from dependencies:** Generic catalog exposes stable variant IDs/SKUs/options/label/images and active/product ownership queries. Order items now snapshot variant IDs/options, receipts and upsells persist atomically. Schema permits arbitrary/default variants while preserving balances/movements/reservations and CHECK/unique constraints.

## Files to Create

- None required.

## Files to Modify

- `src/lib/services/inventory.ts`, `src/lib/services/inventory-schemas.ts`, `src/lib/services/inventory-errors.ts` — generic lookup/display/validation.
- `src/app/api/crm/stock/{adjust,opening,batch}/route.ts` — variant ID based stock actions.
- `scripts/inventory-workflow.test.mjs` — existing stock regression fixtures/scenarios.

## Technical Details

1. Replace `product_colors`/size assumptions in inventory reads, stock batch selectors and shortage descriptions with generic ID/label/options/SKU. `DEFAULT_LOCATION = "MAIN"`, matching new schema; store display-name edits never change ledger location.
2. Preserve `ensureStockBalance`, `openStock`, reserve/release/dispatch/return/adjust APIs or compatible generic exports. Only inventory owns balance/movement writes. Retain transaction nesting, `immediate` race handling, unique movement references, nonnegative constraints and physical/reserved/quarantine relationships.
3. Catalog creates empty balance/initial stock through these APIs. Opening stock creation-only path must remain protected; edits to catalog never become stock correction routes. Stock endpoint auth remains appropriate admin/agent policy from source, with existing origin guards.
4. Aggregate by variant ID for reserves, preserve consumed/released lifecycle, and do not reinterpret option names as identity. Historical inactive variants remain usable for release/return of existing reservations, but cannot be newly sold/confirmed as active replacements.
5. Expose generic stock projection for task 12: IDs, SKU, product name, label/options/images and physical/reserved/quarantine/available; public catalog remains boolean availability. Avoid updating catalog or UI files in this wave.
6. Adapt existing inventory fixture to a default product and a non-size option product, preserve concurrency/rollback assertions; run the owned regression script in isolation, `npm run lint`, `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] All stock paths operate on stable variant IDs without color/size prerequisites.
- [ ] Ledger/race/rollback constraints remain; no new stock writer exists.
- [ ] Zero-stock checkout stays separate from confirmation reservation.
- [ ] Inactive historical variants can be returned/released safely.

## Notes

Files under `src/app/api/crm/stock/` are exclusively this task's HTTP ownership; stock UI belongs to task 12.
