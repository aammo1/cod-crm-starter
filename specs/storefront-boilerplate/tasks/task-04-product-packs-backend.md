# Task 04: Quantity packs schema, service and checkout pricing

## Status

complete

## Wave

1

## Description

In Moroccan COD, single-product landing pages usually sell **quantity packs**: "1 pièce 199 DH / 2 pièces 349 DH / 3 pièces 449 DH". The owner wants this in every niche. This task adds the data model and the **server-side** pricing:
- Packs are stored per product.
- The public catalog DTO exposes them.
- Checkout automatically applies the matching pack price when the total quantity of one product's lines equals a pack quantity.
- The pack is snapshotted on the order.

The client never sends a pack price or a discount. It only sends variant IDs and quantities, exactly as today. The same rule applies in the catalog cart, so "2 for 349" also works there.

This task also adds a per-product `landing_enabled` flag. `/l/[slug]` (task 14) only renders for products where it is enabled.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-08-storefront-checkout-api.md, task-09-admin-packs-editor.md

**Context from dependencies:** None.

## Files to Create

- `migrations/018_product_packs.sql`: new table and columns.
- `src/lib/services/packs.ts`: CRUD (used by the admin in task 09) and the pure pricing function.

## Files to Modify

- `src/lib/commerce-types.ts`: add `ProductPack`; add `packs: ProductPack[]` and `landingEnabled: boolean` to `CommerceProduct` (so it flows to `PublicCommerceProduct` and `StorefrontProductView`); add an optional `packDiscount` to `CommerceTotals`.
- `src/lib/services/catalog.ts`: hydrate `packs` and `landingEnabled` for each product. Use **one** query for all packs of the listed products, with no per-product queries.
- `src/lib/storefront-catalog-dto.ts`: include `packs` and `landingEnabled` in the v1 DTO.
- `src/lib/services/storefront-orders.ts`: apply pack pricing in `checkout()` and persist the snapshot. Keep upsell behaviour identical.
- `src/lib/storefront-order-api.ts`: implement the new `getActivePacks` port method where the catalog port is built.

Also create `src/lib/pack-pricing.ts`: the browser-safe `applyPacks` helper, with no server imports.

## Technical Details

### Migration 018_product_packs.sql

The migration runner splits statements on line-ending semicolons (see `src/lib/migrate.ts`). Keep every statement terminated with `;` at the end of a line, and do not put semicolons inside strings.

```sql
CREATE TABLE product_packs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 2 AND 10),
  price_mad INTEGER NOT NULL CHECK(price_mad > 0),
  label TEXT CHECK(label IS NULL OR length(trim(label)) BETWEEN 1 AND 60),
  highlight INTEGER NOT NULL DEFAULT 0 CHECK(highlight IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_product_packs_active_qty ON product_packs(product_id, quantity) WHERE active = 1;
CREATE INDEX idx_product_packs_product ON product_packs(product_id);
ALTER TABLE products ADD COLUMN landing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(landing_enabled IN (0,1));
ALTER TABLE orders ADD COLUMN pack_snapshot_json TEXT CHECK(pack_snapshot_json IS NULL OR (json_valid(pack_snapshot_json) AND json_type(pack_snapshot_json) = 'array'));
```

The quantity 1 price is always the product's base `price`; there is no row for it.

### Types (commerce-types.ts)

```ts
export interface ProductPack {
  id: string;
  quantity: number;     // 2..10
  price: number;        // integer MAD for the whole pack
  label?: string;       // e.g. "Le plus populaire"
  highlight: boolean;
}
// CommerceProduct gets:  packs: ProductPack[]; landingEnabled: boolean;   (active packs only, ordered by quantity)
// CommerceTotals gets:   packDiscount?: number;   // integer MAD, > 0 only when a pack applied

/** Persisted orders.pack_snapshot_json entries. */
export interface CommercePackApplication {
  productId: string; packId: string; quantity: number; packPrice: number; regularPrice: number; discount: number;
}
```

Export a **pure, browser-safe** helper from `commerce-types.ts`, or from a new browser-safe `src/lib/pack-pricing.ts` that imports nothing server-side. The cart UI (task 11) uses it to preview totals:

```ts
/** For one product: total qty across its lines, and the matching active pack (exact quantity match only). */
export function applyPacks(
  lines: { productId: string; qty: number; unitPrice: number }[],
  packsByProduct: Record<string, ProductPack[]>,
): { discount: number; applications: Omit<CommercePackApplication, "regularPrice"> & { regularPrice: number }[] }
```

- Group by `productId` and sum `qty`. If an active pack with `quantity === sum` exists, then `regularPrice = sum * unitPrice` and `discount = max(0, regularPrice - pack.price)`.
- If `pack.price >= regularPrice`, there is no discount (ignore the pack).
- Exact match only: 3 units with packs {2, 3} uses the 3-pack; 4 units with packs {2, 3} uses no pack. Keep it simple and predictable.

### Checkout pricing (storefront-orders.ts)

Read `checkout()` carefully. It builds line `items` via `snapshot(v, productName, price, qty)` and computes `subtotal = items.reduce(line_total)` and then `totals(subtotal, shippingFor(subtotal, settings))`.

- Keep line items at the regular unit price, so that `line_total = quantity × unit_price` stays true everywhere: edits, BL and Meta all rely on it.
- Load active packs for the products in the request, using the same DB connection (`deps.db`/`db`), inside the transaction. Add a `getActivePacks(productIds)` method to `StorefrontCatalogPort` and implement it in the place that builds the port (see `src/lib/storefront-order-api.ts`).
- Compute `{ discount, applications } = applyPacks(...)`.
- Store the discount using the **existing order-level discount columns** from migration 015: `discount_type = 'fixed'`, `discount_value = discount`, `discount_amount = discount`. Also store `pack_snapshot_json = JSON.stringify(applications)`.
- Read `src/lib/services/order-edits.ts` to confirm how `discount_*` is used when an agent edits the order, so that an agent edit keeps the discount amount. If edits recompute the discount from type and value, a fixed value stays fixed, which is acceptable. Document this in a comment.
- **Shipping:** compute it on the discounted subtotal: `shippingFor(subtotal - discount, settings)`.
- **Totals:** `total = subtotal - discount + shipping`, with `packDiscount: discount` when it is > 0. Check how `totals()` and `insertStorefrontOrder` persist `subtotal`/`total`, and make `orders.total` the amount the customer pays. The Meta trigger snapshots `NEW.total`, so tracked value equals the paid amount.
- **Upsell:** unchanged. The upsell product is excluded from packs, because packs only consider the checkout lines. When an upsell is accepted, the existing code adds the line and recomputes totals. Make sure that path subtracts the stored `discount_amount` when recomputing `total`. Inspect the code around `const subtotal = order.subtotal + item.line_total;` and fix it if it ignores the discount.
- **Receipts:** the request hash is unchanged, because the request is unchanged. A replay returns the stored response, which already includes the discounted totals.
- **Manual orders** (`manual-orders.ts`): out of scope. Agents can already set discounts manually.

### packs.ts service

- `listPacks(productId)`
- `replacePacks(productId, packs: {quantity, price, label?, highlight?}[])`: inside an immediate transaction, deactivate all current packs (`active = 0`, not delete, because order snapshots reference IDs) and insert the new set with `randomUUID()` IDs. Validate: quantities are unique and between 2 and 10, at most 4 packs, prices are integers, and each `price < quantity × product.price`. Reject otherwise with a French error message.
- `setLandingEnabled(productId, enabled)`.
- `getActivePacksFor(productIds, db?)`: a single `SELECT … WHERE active = 1 AND product_id IN (…)` grouped in JS.

Export a zod schema `packsInputSchema` from the same file, or from `src/lib/services/catalog-schemas.ts` if that is the existing convention.

## Acceptance Criteria

- [ ] A fresh DB migrates through 018. `_migrations` lists `018_product_packs.sql`.
- [ ] `listStorefront()` returns `packs` (active, sorted by quantity) and `landingEnabled` for each product, with one extra query in total rather than one per product.
- [ ] Checkout with 2 units of a product that has a 2-pack at 349 (base 199) stores `subtotal = 398`, `discount_amount = 49`, `pack_snapshot_json` with one application, and `total = 349 + shipping(349)`. The response `totals.packDiscount` is 49.
- [ ] Checkout with 1 unit or with a non-matching quantity applies no discount, and the stored values are identical to before this task.
- [ ] Accepting an upsell on a pack order keeps the pack discount in `total`.
- [ ] `npm test` passes. If an existing assertion on `CommerceProduct` or DTO shapes fails only because of the new fields, update that fixture minimally and say so in your summary.
- [ ] `npm run lint` and `npx tsc --noEmit` pass.

## Notes

`AGENTS.md` is updated in task 01 to allow pack pricing as the only discount besides the upsell. The client must never send pack IDs or prices. Pricing is derived only from quantities and DB packs.
