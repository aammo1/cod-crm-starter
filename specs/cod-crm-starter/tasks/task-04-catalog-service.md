# Task 04: Generalize catalog validation and persistence

## Status
complete

## Wave
3

## Description

Make the standalone CRM catalog the source of truth for arbitrary product niches, preserving Zehri's catalog CRUD/archive semantics. Work in `/home/tal7a/Projects/cod-crm-starter`. Numeric shoe sizes and required color matrices must become flexible stable variants.

## Dependencies

**Depends on:** task-02-generic-schema.md
**Blocks:** task-07-generic-inventory.md, task-08-catalog-management.md, task-09-catalog-api.md

**Context from dependencies:** Schema/types now provide product galleries/option definitions, variants with ID/SKU/options/label/images, canonical `options_key`, default optionless variant and public DTO types. Operational stock tables still reference stable variant IDs. Parallel order task owns `db.ts` and pricing snapshots; auth task owns security modules.

## Files to Create

- None required; split a small catalog mapper module if needed within this ownership.

## Files to Modify

- `src/lib/services/catalog.ts` — generic read/write/projection functions.
- `src/lib/services/catalog-schemas.ts` — flexible product/variant CRUD validation.
- `src/lib/types.ts`, `src/lib/categories.ts` — replace shoe enums or re-export generic types without broad unrelated deletion.

## Technical Details

1. Consume `commerce-types.ts` and `variant-options.ts`. Product category is a bounded free string; options up to 3 axes/100 combinations, string values, images product-level with optional variant override. Product-level integer MAD price, slug, optional story/materials/badge, upsellRef and best-seller remain.
2. Export stable `listProducts`, `getProductById`, `getProductBySlug`, `createProduct`, `updateProduct`, `archiveProduct`, `restoreProduct`; expose `getVariantById` returning ownership/active state/price/projection needed by order/inventory tasks. `listStorefront` returns generic active published products with boolean availability projection. Include active zero-stock variants; browsing can mark them unavailable.
3. Creates can open initial stock only via existing inventory API. Catalog never inserts/updates balances/movements directly. Use lazy calls or a clean module boundary to avoid catalog/inventory circular init. Editing catalog cannot alter existing stock; opening stock is creation-only.
4. Create/updates transactional. Match existing variant IDs, never regenerate them after option label edits. Reject duplicate slug/SKU/option set and cross-product variant IDs. Removed variants become inactive; historical IDs/foreign keys remain. Reactivation restores old IDs rather than inventing duplicates. Exactly one default variant for products without options; converting option structure must not invalidate referenced histories.
5. Persist options/images, safe upload paths and deterministic ordering. No request-triggered remote image fetching. Read numeric availability from inventory/balances, not a caller-written boolean. Avoid exact stock data in public DTOs.
6. Temporary compatibility mappers may be exported for downstream copied callers, but mark them for removal by task 20; generic model must be primary. Do not edit admin routes/components, `db.ts` or inventory in this task. Check generic create/read/archive/restore with temp DB and `npm run lint`, `npx tsc --noEmit`; later waves finish consumer rewiring.

## Acceptance Criteria

- [ ] Catalog supports `Couleur/Taille`, `Capacité=500 ml`, and optionless products.
- [ ] IDs/SKUs survive edits and archive/restore; old order/inventory references remain valid.
- [ ] No fixed category enum/numeric shoe coercion in the primary catalog contract.
- [ ] Initial balances flow exclusively through inventory service; existing-stock changes rejected.
- [ ] Exported mapper/query signatures are documented for following tasks.
