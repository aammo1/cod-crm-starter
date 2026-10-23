# Task 01: Fix pack pricing for mixed variant prices

## Status

complete

## Wave

1

## Description

Quantity packs ("3 for 299 MAD") are applied per product by `applyPacks` in `src/lib/pack-pricing.ts`. It sums quantities across a product's variant lines but keeps only the **first line's** unit price, then computes `regularPrice = qty * firstUnitPrice`. If variants of one product have different prices (e.g. size L costs more), the regular price, discount and order total are wrong. This is browser-safe shared code used by checkout (`src/lib/services/storefront-orders.ts`) and by the storefront for previews, and later tasks (13 order edits, 14 manual orders) will reuse it.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-13-order-edit-repricing.md, task-14-manual-orders-packs-tombstone.md

**Context from dependencies:** None.

## Files to Create

- `scripts/unit/pack-pricing.test.mjs` — unit tests for `applyPacks`.

## Files to Modify

- `src/lib/pack-pricing.ts` — compute `regularPrice` as the sum of `qty * unitPrice` over every line of the product.

## Technical Details

### Implementation Steps

1. Replace the `{ qty, unitPrice }` accumulator with `{ qty, regularPrice }` where `regularPrice += line.qty * line.unitPrice`.
2. Keep the rest: exact quantity match only (`pack.quantity === qty`), skip when `pack.price >= regularPrice`, `discount = regularPrice - pack.price`, same `CommercePackApplication` shape (`productId, packId, quantity, packPrice, regularPrice, discount`).
3. Keep the module browser-safe (no server imports, no zod).

### Code Snippet

```ts
const byProduct = new Map<string, { qty: number; regularPrice: number }>();
for (const line of lines) {
  const cur = byProduct.get(line.productId) ?? { qty: 0, regularPrice: 0 };
  byProduct.set(line.productId, { qty: cur.qty + line.qty, regularPrice: cur.regularPrice + line.qty * line.unitPrice });
}
```

### Tests (scripts/unit/pack-pricing.test.mjs)

- Single variant, exact pack match → discount = qty*price − packPrice.
- Two variants of one product at 149 and 179, qty 2+1, pack qty 3 at 399 → regularPrice 477, discount 78.
- No pack for that quantity → no application.
- Pack price ≥ regular → no application.
- Two products each with packs → two applications, discounts summed.
- Integer results only.

## Acceptance Criteria

- [ ] Mixed-price variants produce `regularPrice` equal to the true line sum.
- [ ] Existing checkout tests still pass (`npm run test:crm`).
- [ ] `node --test scripts/unit/pack-pricing.test.mjs` passes.

## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
