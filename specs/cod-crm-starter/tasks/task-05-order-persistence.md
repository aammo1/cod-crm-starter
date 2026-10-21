# Task 05: Implement transactional checkout receipts and durable upsells

## Status
complete

## Wave
3

## Description

Build the durable commerce core for the separate COD CRM: price-free generic variant checkout, permanent idempotency receipts and server-enforced optional upsells. Work only in `/home/tal7a/Projects/cod-crm-starter`. This task owns transactional persistence, not HTTP routes or catalog changes.

## Dependencies

**Depends on:** task-02-generic-schema.md, task-03-store-configuration.md
**Blocks:** task-07-generic-inventory.md, task-10-order-operations.md, task-11-order-api.md

**Context from dependencies:** Generic types define variant/order snapshots and migrations supply durable request receipt/order nonce/offer storage. Settings service defaults to shipping 29/free 400, upsell enabled 20 seconds/30% off; pure pricing receives explicit rules. Catalog is being generalized in parallel: implement against an injected typed catalog port, not its unfinished runtime exports. Copied `db.ts` currently creates orders/resolves product-level shoe upsells and optional Meta durable side effects.

## Files to Create

- `src/lib/services/storefront-orders.ts` — checkout/upsell orchestration and canonical request hashing.
- `src/lib/services/request-receipts.ts` — transactional scoped receipt helpers.
- `src/lib/order-token.ts` — server-only HMAC token derivation/validation.

## Files to Modify

- `src/lib/db.ts` — generic order JSON, persisted offer/deadline/rules, transaction-compatible APIs and atomic closure helper.
- `scripts/order-lifecycle.test.mjs` — adapt only this existing scenario owner here; other order fixtures belong to task 10.

## Technical Details

1. Generic line snapshot `{ product_id, variant_id, sku, name, variant_label, options, quantity, unit_price, line_total }`. Resolve catalog variant/product ownership, active state and server prices. Existing active variants with zero availability **are accepted at checkout**; reserve/check stock only during confirmation. No price input.
2. Normalize Moroccan phone with existing helper; trim name, aggregate/sort items by variant ID, enforce 1–10 combined qty/variant and 1–50 lines. Canonical hash includes normalized customer/items and validated optional attribution; never mutable catalog prices/settings. Schema validation before hashing; no arbitrary meta objects.
3. In an immediate SQLite transaction: look up `(checkout, requestKey)` first; return same stored snapshot on same hash, 409 on different hash; otherwise resolve catalog, capture settings, create order/offer/nonce and existing durable Meta/event jobs, then write receipt. No network calls inside transaction. Concurrent connections/processes must not create duplicates, orphan receipts or partial orders. Busy/conflict responses must be retryable with the same key. Receipts do not expire into a new order.
4. Store initial response snapshot: order ID/totals/offer. Derive `orderToken` using HMAC with `AUTH_SECRET` and persisted random per-order nonce/order ID; verify constant-time. Keep nonce/response storage private, do not persist plaintext token in receipt JSON or log tokens. Reconstruct token for replays; document AUTH_SECRET rotation invalidates outstanding tokens. No token fallback if secrets missing.
5. Pick upsell as Zehri does: `upsellRef` if available/not in cart, otherwise available best seller not in cart. Persist immutable offered product/prices/allowed variants, offer ID, rules and deadline. No offer when disabled/unavailable; close pending state immediately. Discounted addition is one unit, variant selected from that offered product.
6. Resolution requires order token at service boundary, request key/hash scope `upsell:<orderId>`, action `accept` plus variantId or `decline`. In one immediate transaction, replay receipt before checking current deadline; for new actions verify pending status/confirmation/deadline and variant ownership. A committed accept/decline cannot change on opposite requests. Expired/confirmed/cancelled orders never mutate. Return stable response `{ orderId, upsellStatus, totals }`. Confirmation's closure helper must use same transaction semantics. Shipping recalculation uses original checkout rules, not changed settings.
7. Preserve optional Meta purchase dedup/outbox behavior in copied `db.ts`; use supplied validated attribution context, not CRM request IP. No Ozon calls or inventory writes. Export helpers/errors with explicit status/code for HTTP task.
8. Adapt owned lifecycle regression scenario to generic types and new closure behavior; verify concurrent retry and expiry cases through meaningful service checks. Run `npm run lint`, `npx tsc --noEmit` and relevant lifecycle script with isolated DB/mock environment. Downstream suites may await consumer adaptation.

### Catalog port for same-wave independence

Define/export a synchronous `StorefrontCatalogPort` in the owned `storefront-orders.ts`, using shared types. It supplies `getVariantById(id)` with variant/product active flags and product-level CRM price, `getProductById(id)` with persisted generic variant choices/upsellRef, and `listUpsellCandidates()` for active best-sellers. Accept this port as a service factory/dependency argument; task 11 binds the completed catalog exports. All port calls happen against the same SQLite connection within the transaction, not network/cache snapshots. Owned service checks may bind generic SQL readers over the migrated fixture DB. Do not import a not-yet-written task-04 function or add shoe compatibility logic to satisfy it. Export port method/return types clearly so task 11 can wire the adapter without reading this task file.

## Acceptance Criteria

- [ ] Atomic order+offer+event+receipt persistence; identical replay survives catalog/settings changes.
- [ ] Same key/different input conflicts; concurrent identical requests produce one order.
- [ ] Server-time expiry and confirmation races cannot append a late/duplicate discount.
- [ ] Snapshots preserve history and original shipping rules; token stored/replayed without plaintext leakage.
- [ ] No route/catalog/security file overlap with parallel tasks.
