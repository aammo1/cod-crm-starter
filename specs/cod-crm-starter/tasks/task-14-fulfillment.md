# Task 14: Generalize shipping descriptions, tracking and returns

## Status
complete

## Wave
6

## Description

Preserve Zehri's Ozon fulfillment workflow for every product niche, including reconciliation and return-stock attribution. Work in the new independent CRM workspace `/home/tal7a/Projects/cod-crm-starter`, using mock shipping for all implementation verification.

## Dependencies

**Depends on:** task-10-order-operations.md, task-07-generic-inventory.md
**Blocks:** task-17-crm-assistant.md, task-18-catalog-agent.md, task-19-deployment-guides.md

**Context from dependencies:** Order/confirmation services now use variant-ID/SKU/options snapshots and atomically reserve/close upsells/queue submissions. Inventory owns all ledger writes and supports historical inactive variants. Existing Ozon provider, BL durable claims, poller and return services are copied from Zehri and must keep their behavior.

## Files to Create

- `src/lib/order-item-label.ts` if a shared generic shipment description formatter is needed.

## Files to Modify

- `src/lib/services/{submissions,submission-resolution,expeditions,delivery-notes,bl-documents,tracking,returns}.ts` **only where generic item/branding adaptation is needed**.
- `src/lib/shipping/` adapter description mapping and `src/lib/workers/` payload consumers where they depend on item shape; leave transport/retry policies intact.
- `src/app/(admin)/crm/{expeditions,retours}/page.tsx`, `src/components/crm/return-inspect.tsx` where generic display needed.
- Existing `scripts/{bl-workflow,returns-workflow,tracking-workflow,mock-flow,submission-resolution}.test.mjs` and their scenario fixtures.

## Technical Details

1. Parcel/BL descriptions use persisted product name + generic variant label/options + qty, bounded to existing provider limits, never color/size identity. Use snapshots for histories, not current catalog display. Return lines retain exact variant IDs/quantities originally dispatched, including archived variants.
2. Preserve submission worker as sole creator of Ozon parcels. Order/confirmation and API cannot call courier network. Durable submissions before success, claims, ambiguous-result review/reconciliation, no blind retries or automatic BL lease takeover. Explicit agent BL creation/handoff; tracking only by poller.
3. Keep Ozon redaction helpers for credential-bearing URL paths. No logging raw URLs/errors with keys. Initial live status map remains unverified; unknown statuses must never mutate stock. Preserve location and reserve/dispatch/return dedup movement references.
4. Sellable/damaged inspection quantities cannot exceed received lines; returns credit only through inventory service, preserve quarantine/ledger attribution and concurrent inspection guard. Keep source dashboard monetary/state meanings.
5. Shipment/UI visible text French; preserve CRM layout, read-only BL archives, PDF/print behavior and agent actions. Rename brand labels only if hardcoded in owned documents; do not redesign BL process.
6. Adapt owned scenario fixtures to generic variants while preserving existing race/crash/reconciliation assertions. Run their scripts (or full `npm run test:crm` if consumers ready), `npm run lint`, `npx tsc --noEmit`. Mock only: no live parcel, BL, handoff or live verification calls.

## Acceptance Criteria

- [ ] Generic/default products reach mock parcel/BL/tracking/return flow with correct descriptions.
- [ ] Historical variant attribution, quarantine and stock dedup remain correct.
- [ ] Durable claims/reconciliation/redaction/unknown-status invariants preserved.
- [ ] No actual courier calls occur during verification.

## Notes

This is a cross-cutting mechanical item-shape adaptation across a tightly coupled fulfillment boundary, not permission to rewrite provider/BL architecture. Leave unchanged files untouched. Order pages/components and API client are parallel owners.
