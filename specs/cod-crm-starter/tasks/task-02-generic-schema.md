# Task 02: Define generic variant persistence and shared types

## Status
complete

## Wave
2

## Description

Replace shoe-only persistence assumptions in the new CRM starter with stable arbitrary variants. This foundation supports independent COD CRMs for shoes, cosmetics, gadgets or products without options. Work only in `/home/tal7a/Projects/cod-crm-starter`; source Zehri is not migrated.

## Dependencies

**Depends on:** task-01-isolated-extraction.md
**Blocks:** task-04-catalog-service.md, task-05-order-persistence.md

**Context from dependencies:** Task 01 creates an isolated Next.js/SQLite CRM with copied migrations 001–015, empty DB, Auth.js and existing operational services. Current `variants` references `product_colors` and requires a size; orders store color/size in JSON. Later tasks will adapt services to the types/schema defined here.

## Files to Create

- `src/lib/commerce-types.ts` — browser-safe generic product/variant, order snapshot, settings/API DTO interfaces.
- `src/lib/variant-options.ts` — canonical option validation, combination key and display label helpers.

## Files to Modify

- `migrations/001_init.sql`, `migrations/002_catalog_images.sql`, and a new `migrations/016_starter_commerce.sql` only as needed to establish the fresh starter schema; no other service write ownership.
- `scripts/` shared database fixture helper, if one exists, **only** for generic model schema setup; task-specific scenario fixtures remain with their owners. Record its exact path for downstream agents.

## Technical Details

1. New shared model: `VariantOption = { name: string; value: string }`; `CommerceVariant = { id, productId, sku, label, options: VariantOption[], images: string[], active: boolean, available: number }`. Product has ID/slug/name/free string category, integer MAD product-level price, description, optional story/materials/badge, images, ordered option definitions and variants, upsellRef/best-seller/active flags. Define internal versus public DTOs; public availability boolean, no exact stock balances.
2. Order item snapshot: `{ product_id, variant_id, sku, name, variant_label, options, quantity, unit_price, line_total }`. Define immutable upsell-offer/response types needed by later code: offered product, prices, allowed variants, deadline and receipt shape. Do not make active generic fields depend on color or numeric size.
3. Validate option names/values as trimmed nonempty bounded strings; cap at 3 axes/100 variants per product in v1. Reject duplicate axis names case-insensitively and duplicate normalized combinations. Preserve display order separately; canonical normalized sorted pairs form `options_key`. Optionless product has one default variant with `options: []`, label `Standard`; key represents the empty set. IDs/SKUs are stable across edits; archived rows not deleted.
4. New lineage allows modifying the copied baseline to make legacy `color_id`/size nullable or transitional, add generic JSON/key/label/image fields, and introduce product gallery/option-definition storage. Preserve all operational FK/index/CHECK constraints, every later migration, delivery claims, edit/archive/history, returns and Meta tables. Default stock location is `MAIN`, including schema defaults. Do not rewrite Zehri source migrations or claim compatibility with a live Zehri DB.
5. Add durable request receipts with unique `(scope, request_key)`, canonical hash, committed response snapshot, order association and created timestamp. Add per-order upsell offer ID/deadline and token nonce/verifier storage. Exact schema must support one immediate transaction saving order/offer/jobs/receipt; token plaintext must not appear in unencrypted receipt JSON. Reserve separate scopes for checkout and per-order upsell. No TTL that permits old keys to create duplicates.
6. Avoid DB runtime imports in shared types. Do not edit `db.ts`, catalog, pricing or settings service in this wave. If a bridge is needed, keep old exported types intact until owners move them. Document schema names in comments/types for consumers.
7. Verify fresh migration chain, `PRAGMA foreign_key_check`, receipt uniqueness, non-shoe/default variants, `npm run lint`, `npx tsc --noEmit`. Use target-local temp SQLite. Update only owned shared fixture setup if necessary.

## Acceptance Criteria

- [ ] Fresh schema retains operational constraints and admits arbitrary strings/no-option variants without fake colors/sizes.
- [ ] Shared generic types and deterministic key/label helpers exist with explicit limits.
- [ ] Receipts support concurrent unique insertion and token-safe replay reconstruction.
- [ ] Migration rerun is idempotent through `_migrations`; no production migration/data access occurs.
- [ ] No write overlap with parallel configuration task (`pricing.ts`, settings service).
