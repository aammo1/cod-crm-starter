# Task 13: Order edits keep original prices and recompute pack discounts

## Status

complete

## Wave

2

## Description

`editOrder` in `src/lib/services/order-edits.ts` has two money bugs. (1) Line ~109 uses `variant.price` (current catalog price) for **every** non-upsell line, so any edit (even toggling free shipping) silently reprices untouched lines if the admin changed a price after checkout. (2) Checkout stores the pack saving as an order-level fixed discount (`storefront-orders.ts:179-194`: `discount_type='fixed'`, plus `pack_snapshot_json`), and `editOrder` re-applies that fixed `discountValue` as is (~lines 131-136). Reducing a "3 for 299" order (regular 447, discount 148) to 2 units yields 298 − 148 = 150 MAD; raising quantity to a pack size never gets the pack price.

## Dependencies

**Depends on:** task-01-pack-pricing-fix.md
**Blocks:** task-28-city-tariffs.md

**Context from dependencies:** Task 01 fixed `applyPacks(lines, packsByProduct)` in `src/lib/pack-pricing.ts` so `regularPrice` is the sum of `qty * unitPrice` per line; it returns `{ discount, applications: { productId, packId, quantity, packPrice, regularPrice, discount }[] }`.

## Files to Modify

- `src/lib/services/order-edits.ts` — price preservation and pack recomputation.
- `src/lib/order-edit-schema.ts` — add an explicit discount mode if needed (see below).
- `src/components/crm/edit-order.tsx` — show "Remise pack (automatique)" vs manual discount; let the agent switch to a manual discount explicitly.
- `scripts/order-edits.test.mjs` — regression tests.

## Technical Details

1. **Price preservation**: build a map of original non-upsell lines by `variant_id` → `unit_price` from `before.snapshot.items`. For a submitted line whose variant existed in the original order, use the original `unit_price` (for any quantity). Only variants not in the original order take `variant.price`. Upsell lines keep current behavior (original upsell unit price, cannot be extended/transferred).
2. **Pack mode**: an order is in pack mode when `pack_snapshot_json` is non-null and its discount was not manually changed. Add an input field `discountMode: "pack" | "manual"` to the edit schema (default `"pack"` when the order currently has a pack snapshot, else `"manual"`; the UI sends it explicitly).
   - `pack`: ignore submitted `discountType/discountValue`; recompute with `applyPacks(nonUpsellLines.map(l => ({ productId, qty, unitPrice })), getActivePacks(productIds))` using the **current** `product_packs` (server-only, never from the client — find the loader used by checkout: `deps.catalog.getActivePacks` / `src/lib/services/packs.ts`). Store `discount_type='fixed'`, `discount_value = discount_amount = discount`, and rewrite `pack_snapshot_json` (`NULL` when no pack applies).
   - `manual`: existing behavior (fixed/percent/none validated against regular subtotal) and set `pack_snapshot_json = NULL`.
3. Shipping: keep using `orderShippingRules(orderId)` with `subtotal - discount` as checkout does (`shippingFor(subtotal - discount, settings)`).
4. History: the edit history must record before/after totals as today; include the discount mode change.
5. Keep all existing guards (stock checks only on increases, max 10 per variant, status restrictions, `revalidateStorefront()` call if present in the route).

### Tests (append to scripts/order-edits.test.mjs)

- Admin raises catalog price after checkout; agent edits only shipping → line prices unchanged.
- Pack order 3×149 with pack 3=399 → reduce to 2 → total = 2×149 + shipping, no pack discount, snapshot null.
- Order of 2 → increase to 3 in pack mode → pack discount applied and snapshotted.
- Manual mode overrides pack and clears snapshot.

## Acceptance Criteria

- [ ] Untouched lines never change price on edit.
- [ ] Pack discount always matches the edited quantities in pack mode.
- [ ] Client cannot supply a pack price/discount in pack mode.
- [ ] `npm run test:crm` passes, including new cases; `npm run test:order-edits-browser` still passes if runnable locally.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
