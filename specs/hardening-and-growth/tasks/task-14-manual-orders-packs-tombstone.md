# Task 14: Manual orders apply packs; deleted manual orders keep their idempotency record

## Status

complete

## Wave

2

## Description

`src/lib/services/manual-orders.ts:199-205` computes `subtotal + shipping` without `applyPacks`, so a phone order of 3 units costs more than the same order on the storefront. Also `src/lib/services/order-lifecycle.ts:47` deletes the `manual_order_requests` row when an order is deleted, so replaying the same manual request id creates a new order — breaking the "never delete receipts" invariant.

## Dependencies

**Depends on:** task-01-pack-pricing-fix.md
**Blocks:** task-29-auto-assignment.md

**Context from dependencies:** Task 01 fixed `applyPacks(lines, packsByProduct)` in `src/lib/pack-pricing.ts` (per-line regular price sum). Checkout (`src/lib/services/storefront-orders.ts:179-194`) uses it like this: lines stay at regular unit price; the saving is the order-level fixed discount; `pack_snapshot_json` stores `applications`; shipping is `shippingFor(subtotal - discount, settings)`; totals via `totals(subtotal, shipping, discount)` from `src/lib/pricing.ts`.

## Files to Modify

- `src/lib/services/manual-orders.ts` — apply packs exactly like checkout (same columns: `discount_type='fixed'`, `discount_value`, `discount_amount`, `pack_snapshot_json`).
- `src/components/crm/manual-order-form.tsx` — show the pack discount in the total preview (preview only; server is authoritative). Use the packs data the form already has or load it from the existing products API; do not trust the preview server-side.
- `src/lib/services/order-lifecycle.ts` — keep a tombstone instead of deleting the manual request row.
- `scripts/manual-order.test.mjs`, `scripts/order-lifecycle.test.mjs` — regression tests.

## Technical Details

1. Prefer extracting a small shared server helper (e.g. `priceOrderLines(lines, settings)` returning `{ subtotal, discount, applications, shipping, total }`) inside `manual-orders.ts` or a new `src/lib/services/order-pricing.ts`, and use it from manual orders. Do **not** modify `storefront-orders.ts` in this task (task 26 owns it next).
2. If a manual order includes an explicit agent discount (check whether the manual-order schema supports one), agent discount takes precedence and packs are not stacked; document the rule in a code comment. Never stack pack + manual discount.
3. **Tombstone**: instead of `DELETE FROM manual_order_requests`, keep the row and mark it (add nothing to applied migrations — check the table's columns in `migrations/009_manual_order_requests.sql`; if there is a nullable column suitable for an order reference, set the order reference to NULL only if the FK requires it). If the schema forces deletion due to an FK to `orders(id)` with no `ON DELETE`, store the tombstone in `app_state` under `manual_request_tombstone:<requestId>` with `{ deletedOrderId, deletedAt }` and make `createManualOrder` reject a replay of a tombstoned request id with 409 `Cette demande a déjà créé une commande, supprimée depuis.` Choose the approach that requires no migration rewrite.

## Acceptance Criteria

- [ ] Manual order for a pack quantity gets the pack discount and snapshot, identical to checkout totals for the same cart.
- [ ] Replaying the request id of a deleted manual order does not create a new order.
- [ ] `npm run test:crm` passes with new cases.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
