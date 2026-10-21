# Task 08: Build flexible catalog management in the CRM

## Status
pending

## Wave
4

## Description

Retain Zehri's catalog administration as part of the CRM-only starter, replacing shoe grids with flexible options and variants. The owner manages catalog/prices/images here; custom storefronts read them through the integration API. Work in `/home/tal7a/Projects/cod-crm-starter`.

## Dependencies

**Depends on:** task-04-catalog-service.md
**Blocks:** task-13-settings-shell.md, task-18-catalog-agent.md

**Context from dependencies:** Generic catalog handles stable IDs/SKUs, product/variant images, up to 3 option axes/100 variants, optionless default variant, free string category, integer MAD price, archive/restore and inventory-owned initial stock. Product-level price is shared by all variants. Shared helpers canonicalize duplicate combinations and display labels.

## Files to Create

- `src/components/admin/variant-editor.tsx` — option definitions/combinations, stable IDs/SKUs and variant images.

## Files to Modify

- `src/components/admin/{product-form,quantities-grid,archive-button}.tsx` as needed; initial stock editor becomes variant-based.
- `src/app/(admin)/admin/` pages/layout **excluding later shell navigation ownership** — catalog list/new/edit workflows.
- `src/app/api/admin/products/` route subtree — generic CRUD/archive/restore serialization.

## Technical Details

1. Preserve existing CRM visual language, French labels/errors, responsive forms and admin guard. Keep `/admin` catalog routes stable; task 13 adds CRM navigation links. No storefront page UI.
2. Product form: name/slug/category/description, integer MAD price, gallery, optional story/materials/badge/best-seller/upsell reference; ordered options `name` with string values, variant rows with ID/SKU/options/active/images. No default shoe sizes/categories; show `Standard` single variant without options.
3. Preserve IDs submitted from existing rows. Explain archived/removed variants as unavailable rather than deleting referenced histories. Reject collisions and surface server validation. Limit to 3 axes/100 combinations; no unbounded Cartesian expansion. New variant rows may be explicitly generated within bound.
4. Retain `/api/admin/upload` image upload and `/api/media/*` serving; product/variant galleries use stored media paths. Do not add remote URL fetching in admin API. Existing catalog image files may remain under legacy component names if contents are generic.
5. Initial stock input is optional on product creation only and calls catalog/inventory creation APIs. Editing uses stock workspace for corrections; never accept stock edits through product update route. Agent restrictions unchanged.
6. Verify default/non-size/two-option create/edit/archive/restore including images and persistent IDs. Run `npm run lint`, `npx tsc --noEmit` and manual local CRM checks. Do not edit catalog-agent fixtures here; task 18 owns them.

## Acceptance Criteria

- [ ] Catalog admin can fully manage three representative niche models without color/pointure prerequisites.
- [ ] Product edit preserves IDs/history and cannot change existing stock.
- [ ] French mobile-friendly UI retains Zehri's design and role guards.
- [ ] Admin routes use generic strict server schemas and stored media.
