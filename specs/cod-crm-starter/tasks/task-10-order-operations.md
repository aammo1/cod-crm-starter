# Task 10: Adapt confirmation, manual orders and order editing

## Status
complete

## Wave
5

## Description

Keep Zehri's agent working flow intact on the generic variant model: contact, edit, confirm, cancel, archive and create manual orders. Work in `/home/tal7a/Projects/cod-crm-starter`. This task owns server-side order operations; UI/HTTP rewiring follows separately.

## Dependencies

**Depends on:** task-05-order-persistence.md, task-07-generic-inventory.md
**Blocks:** task-14-fulfillment.md, task-15-order-workspace.md

**Context from dependencies:** Orders have variant-ID/options/SKU/name/price snapshots; durable upsell resolution and atomic close helper are available in DB/service. Inventory supports generic IDs and `MAIN`, with reservation APIs and immutable ledger semantics. Catalog supplies generic active/inactive lookups. Settings expose explicit pricing rules.

## Files to Create

- None required; optional small shared order-line mapping helper owned only here.

## Files to Modify

- `src/lib/services/{confirmation,manual-orders,order-edits,orders,order-lifecycle}.ts`
- `src/lib/manual-order-schema.ts`, CRM sections of `src/lib/api-schemas.ts`
- Existing `scripts/{order-workflow,order-edits,confirmed-test-cleanup}.test.mjs` and their scenario-only fixtures.

## Technical Details

1. Replace joins to color/size with catalog variant ownership/active lookups and generic snapshots. Confirmation request remains `{ lines: [{ lineIndex, variantId }], address, cityId }`; address/city required only here, checkout still two customer fields.
2. Confirmation must run one immediate transaction: validate order state, atomically close pending upsell, select current order+accepted upsell lines, validate active replacements/product ownership, reserve all stock and write submission job/order state. Failure rolls all changes back. Preserve cancellation/release and courier fulfillment-history restrictions.
3. Contact logs never reopen confirmed/cancelled state. Preserve no-answer/callback Casablanca handling, audit histories, reassignment, pagination, search and archive/lifecycle guards.
4. Manual orders retain existing request receipt semantics and source labels but use `{ variantId, qty }`, CRM catalog prices and current safe shipping rules. Preserve optional address/city handling from source and zero-stock policy until confirmation; no generic client prices.
5. Order editing preserves revision conflicts, append-only history, durable submission restrictions and stock deltas. Original snapshots remain unchanged unless explicit permitted agent edit creates an audited revision. Do not reprice historical accepted upsell by current catalog. Preserve original checkout shipping rule snapshot where recalculating that order.
6. Make shared CRM schemas generic without changing integration schemas (task 11 has its own module). No stock direct writes, Ozon calls or UI/route edits here.
7. Adapt owned existing regression scenarios including two-process races/crash recovery where relevant. Run owned scripts with isolated SQLite/mock and `npm run lint`, `npx tsc --noEmit`; report downstream shipping/UI adaptation rather than altering their files in parallel.

## Acceptance Criteria

- [ ] Default/arbitrary variants confirm with correct atomic reservations and one durable submission.
- [ ] Upsell-confirmation race, cancellation and contact logs preserve source invariants.
- [ ] Manual/order-edit workflows preserve idempotency/revisions/history and server prices.
- [ ] No color/size matching remains in order operational identity.

## Notes

This is a bounded server-order concern spanning closely coupled services; split helpers within this ownership if useful, not into conflicting same-wave tasks. `db.ts` is read-only here; report necessary persistence changes for serial integration task 20.
