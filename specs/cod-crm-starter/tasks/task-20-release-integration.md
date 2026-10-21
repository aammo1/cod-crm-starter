# Task 20: Complete the fresh-install release integration

## Status
pending

## Wave
8

## Description

Close remaining cross-module integration gaps so the extracted CRM is a cohesive reusable application, ready for public publication. This is a serial runtime/package integration task with required verification, not a standalone testing feature. Work only in `/home/tal7a/Projects/cod-crm-starter`.

## Dependencies

**Depends on:** task-12-stock-workspace.md, task-17-crm-assistant.md, task-18-catalog-agent.md, task-19-deployment-guides.md; all earlier waves must be complete.
**Blocks:** task-21-public-template.md

**Context from dependencies:** Generic schema/catalog/orders/inventory/fulfillment/UI and v1 integration/client/docs now exist. Existing optional assistant, catalog-agent and Meta were preserved. Some transitional shoe adapters, copied fixture/script assumptions or shared dashboard/worker dependencies may still need final serial closure. No agents are writing target files in parallel now.

## Files to Create

- `docs/release-verification.md` — factual commands/results, mock journey and fresh-install evidence, no secrets/PII.

## Files to Modify

- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, worker/runtime wiring and `src/lib/services/dashboard.ts` as needed for assembled runtime.
- Remaining consumer/fixture/helper files **only for demonstrated integration gaps**, documenting exact paths in the release report; do not refactor unrelated features.
- `docs/extraction-manifest.md` — reconcile final retained/omitted capabilities.

## Technical Details

1. Audit runtime consumers of color/size/category enums, source domains, `ZEHRI` stock location and hidden source data paths. Remove transitional compatibility adapters after consumers migrated. Variant IDs/options/snapshot labels must be authoritative. Retain historical fixtures if clearly intentional, not runtime shoe requirements.
2. Integrate dashboard aggregation, instrumentation/worker startup/health and optional Meta outbox with generic data. All routes remain node runtime where SQLite/native modules are used; lazy DB no build-time shared writes. CRM has no public storefront/Pixel mount or unauthenticated legacy checkout bypass.
3. Package scripts must describe runnable checks, not silently remove critical assertions. Adapt remaining shared loaders/helpers and dashboard accuracy fixture in serial, ensure two-process race/crash suites still meaningful. If old storefront-only suite no longer applies, retarget to available CRM/example checks and explain that change rather than leaving a broken command.
4. In a fresh temp SQLite/media setup with `DELIVERY_PROVIDER=mock`, verify empty startup/admin creation, default/non-size/two-axis catalog, create/stock/edit/archive/restore, catalog API, price-free checkout and 201/200/409 keys, upsell accept/decline/expiry, confirmation race, reserve/parcel/BL/handoff/tracking/return inspection and ledger. Ensure API receipts survive restarting process and changed settings/catalog. No real Ozon/Meta/AI calls.
5. Required commands in target: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:crm`, `npm run test:catalog-agent`, `npm run test:security`, `npm run test:meta`, `npm run test:assistant`. Run relevant retained browser checks if environment supports them; report blockers and fix release-critical failures rather than claiming success. Verify client examples separately if excluded from CRM build. Broaden/repeat checks only after changes/failures justify it.
6. Inspect public file allowlist and Git ignored content. No `.env.local`, SQLite/WAL/SHM, backups/uploads, credentials, customer/order exports, audit screenshots or source Git history in release tree. Real keys never logged. A fresh clone must install/build without private assets/services.
7. Update copied spec statuses as implementation actually completes; coordinate the source spec index rather than falsely marking source app changed. Do not commit/push here; task21 creates initial release commit after reviewing status/diff/log.

## Acceptance Criteria

- [ ] Entire generic/default COD journey and restart/retry semantics work in isolated mock installation.
- [ ] Required checks pass with factual results recorded; no release-critical gap hidden by deleted assertions.
- [ ] No runtime shoe/brand/domain/database coupling or unsafe legacy API remains.
- [ ] Clean public-ready file tree and runnable examples/docs consistent with application.
