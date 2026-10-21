# Task 15: Adapt the agent order workspace and CRM handlers

## Status
complete

## Wave
6

## Description

Preserve Zehri's familiar order handling UI for generic products, including confirmation, manual orders, edits/history and cancellation. Work in `/home/tal7a/Projects/cod-crm-starter`; the storefront is a separate application and customer checkout remains name/phone only.

## Dependencies

**Depends on:** task-10-order-operations.md
**Blocks:** task-17-crm-assistant.md

**Context from dependencies:** Server operations accept variant IDs, expose generic line snapshots/labels/options and preserve atomic confirmation, stock/revision conflicts and contact-state rules. CRM shared schemas are generic. Address/city collected during agent confirmation; accepted upsells are already persisted immutable lines. API integration task has removed old public checkout paths.

## Files to Create

- A small `src/components/crm/variant-select.tsx` if reusable generic selection is needed.

## Files to Modify

- `src/app/(admin)/crm/orders/` page subtree and `src/app/api/crm/orders/` route subtree.
- `src/app/api/crm/products/[id]/variants/route.ts`
- `src/components/crm/{orders-table,manual-order-form,confirm-order,edit-order,order-edit-history}.tsx`; update `cancel-order.tsx` only if consumed response changed.
- Existing `scripts/order-edits-browser.test.mjs` and CRM-related portion of `scripts/storefront-browser.test.mjs` if retained; remove obsolete storefront scenario assumptions rather than fabricate a bundled storefront.

## Technical Details

1. Replace color/pointure columns/pickers with generic variant label/options/SKU and optional images. Default variant shows `Standard`. All actions submit IDs, not parsed labels; no numeric coercion.
2. Keep orders list filters/search/source/assignment/contact callbacks/archive/bulk actions and revision/history views. Reuse existing components where their model isn't affected. Render historical snapshot values rather than current catalog after edits/archive.
3. Confirmation allows variant replacement under service rules, collects address+city and displays shortages/conflicts without partial success. Pending upsell closes server-side on confirmation; UI must not reopen it. No premature stock reservation on merely opening forms.
4. Manual order forms use generic catalog; server calculates prices. Order editing sends expected revision and generic variant IDs; display stale revision and fulfillment guard errors. Permission/session/origin guards stay on each handler, not just hidden buttons.
5. Variants CRM endpoint returns generic projection suitable for authenticated agent selection, including stock availability as source allowed; never expose it through public storefront endpoint by mistake.
6. French accessible mobile-first UI using existing design. Adapt existing browser scenario scripts as needed, verify local order create/edit/confirm/cancel/history for default/non-size variants, `npm run lint`, `npx tsc --noEmit`. Fulfillment pages/components are parallel task14 ownership.

## Acceptance Criteria

- [ ] Agent can operate arbitrary/default variants through all existing order workflows.
- [ ] Snapshot history, revision conflicts, agent permissions and stock shortages remain visible/correct.
- [ ] No color/size matching in CRM HTTP payloads or variant selectors.
- [ ] Browser regressions target actual CRM/integration example behavior, not a removed shop.
