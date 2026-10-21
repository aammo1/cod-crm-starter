# Task 12: Adapt the CRM stock workspace to generic variants

## Status
pending

## Wave
5

## Description

Retain Zehri's stock workflow and design while removing shoe-specific table/grid assumptions. This standalone CRM at `/home/tal7a/Projects/cod-crm-starter` owns stock for one store; all corrections go through inventory services.

## Dependencies

**Depends on:** task-07-generic-inventory.md
**Blocks:** task-20-release-integration.md

**Context from dependencies:** Generic stock projection includes variant ID, SKU, product name, label/options/images and physical/reserved/quarantine/available counts. Stock routes under `/api/crm/stock/{adjust,opening,batch}` accept stable IDs and retain auth/origin rules. `MAIN` is stable warehouse key, independent from display branding.

## Files to Create

- None required.

## Files to Modify

- `src/app/(admin)/crm/stock/page.tsx`
- `src/components/crm/{stock-workspace,stock-product-panel,stock-tables}.tsx`

## Technical Details

1. Show variants as generic label/options plus SKU, with product/variant images. No mandatory color swatch or numeric size columns. Optionless `Standard` works without empty labels or fake values.
2. Preserve balances, ledger/history, search/filter, batches, quarantine and reason-required correction ergonomics. IDs determine action payloads; option text is display only. Existing admin/agent permissions unchanged.
3. Replace color-size matrix batch input with variant rows or dynamic option groups bounded by actual variants. Display precise inventory data only in authenticated CRM. Call existing inventory endpoints; never mutate stock in UI/catalog routes directly.
4. French labels, accessible form controls, mobile layout, clear concurrent-update/error feedback and no design-system replacement. Archived historical rows remain readable where source UI permitted.
5. Verify opening stock/new product, correction with reason, reserve display and quarantine adjustment for default/non-size/two-axis examples. Run `npm run lint`, `npx tsc --noEmit`. No API/service edits in this task.

## Acceptance Criteria

- [ ] All stock screens and actions work for generic/default variants.
- [ ] Full ledger visibility and stock permissions retained.
- [ ] No shoe-grid assumptions or client-side stock writes remain.
