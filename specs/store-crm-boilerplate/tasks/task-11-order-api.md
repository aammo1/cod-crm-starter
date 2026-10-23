# Task 11: Expose retry-safe storefront checkout and upsell APIs

## Status
complete

## Wave
5

## Description

Connect custom storefront checkout to the independent CRM's durable commerce services. Target `/home/tal7a/Projects/cod-crm-starter`; all credentials remain server-side. This task is HTTP/schema ownership, not stock or persistence implementation.

## Dependencies

**Depends on:** task-05-order-persistence.md, task-06-integration-auth.md, task-07-generic-inventory.md
**Blocks:** task-16-storefront-client.md

**Context from dependencies:** Services canonicalize generic variants/phones, calculate prices, atomically commit orders/offers/jobs/receipts and derive token-safe response replays. `storefront-orders.ts` exposes an injected synchronous `StorefrontCatalogPort`: `getVariantById` (ownership/active/product price), `getProductById` (generic variants/upsellRef), `listUpsellCandidates` (active best sellers). Bind those methods to completed generic catalog services on the same SQLite connection; no network/cache reads inside checkout transaction. Inventory remains confirmation-only. Integration auth fails closed on missing/invalid `STOREFRONT_API_KEY`, and generic error helpers exist. Task 10 owns CRM `api-schemas.ts`; define a separate strict integration schema here.

## Files to Create

- `src/lib/storefront-api-schemas.ts`
- `src/app/api/storefront/v1/orders/route.ts`
- `src/app/api/storefront/v1/orders/[id]/upsell/route.ts`

## Files to Modify

- Remove legacy `src/app/api/orders/route.ts` and `src/app/api/orders/[id]/upsell/route.ts` after ensuring CRM callers don't depend on them; there is no bundled storefront.
- `src/lib/services/meta.ts`, `src/lib/meta-shared.ts`, `scripts/meta-workflow.test.mjs` only as needed for safe trusted integration attribution/dedup; no other wave-5 task owns them.

## Technical Details

1. Runtime nodejs, dynamic/no-store; authenticate before reading bounded JSON. Keep existing `readLimitedJson` handling (32 KiB checkout, small upsell), safe French errors `{ error: { code, message } }`; do not return raw exceptions/tokens in logs.
2. Checkout `POST /api/storefront/v1/orders` requires `Idempotency-Key` safe ASCII pattern `[A-Za-z0-9._:-]{8,128}`. Strict body `{ customer: { name, phone }, items: [{ variantId, qty }], meta? }`. Reject prices/unknown top-level pricing fields. Qty int 1–10 per aggregated variant, max50 input lines. Moroccan phone helper, name validation; no address/city required.
3. Response 201 first/200 same-key replay: `{ orderId, totals: { itemsSubtotal, shipping, total, currency:"MAD" }, upsellOffer: null | { offerId, productId, name, image, originalPrice, upsellPrice, expiresAt, variants: [{ variantId, label, options, available }] }, orderToken }`. Availability boolean and images absolute canonical CRM URLs. Same key changed canonical body 409. Service replays before mutable catalog validation/per-phone new-order quota; global auth abuse limits still apply. Wrap budget callback inside service's new-order branch if needed; do not consume quota before receipt lookup.
4. Upsell `POST /api/storefront/v1/orders/[id]/upsell` requires same bearer key, `Idempotency-Key`, `X-Order-Token`. Strict body `{action:"accept",variantId}` or `{action:"decline"}`. Return `{orderId,upsellStatus,totals}`. No order read/list/customer endpoint added. Invalid token/key cannot enumerate customer data.
5. Map service errors 400 validation/401 auth/404 unavailable/409 key-state conflict/429 rate/503 transient contention as appropriate, preserving retry headers. The server deadline and atomic confirmation closure remain authoritative. An active zero-stock checkout is accepted; don't introduce a stock hard gate here.
6. Preserve optional Meta attribution/dedup using validated storefront-originated context (allowlisted browser attribution/cookie context and consent semantics already present), not connection IP/user agent of the CRM's storefront server. Never trust arbitrary forwarded IP headers; document trusted context format. Keep Meta side effects durable and optional; CRM must work with no Meta env. Adapt existing meta regression scenario only where transport changed.
7. Verify local valid/default/non-size checkout, repeated and changed key, bad auth/token, expiry and confirmed-order conflict. Run `npm run test:meta`, `npm run lint`, `npx tsc --noEmit` with isolated mock setup.

## Acceptance Criteria

- [ ] HTTP contract matches client types, is price-free/authenticated and never returns CRM/private data.
- [ ] Retry semantics persist across process restart and do not consume new-order phone budgets.
- [ ] Upsell is offered-product-bound, token-gated, one-unit and deadline-enforced.
- [ ] Legacy unauthenticated checkout paths removed; Meta behavior remains optional/deduplicated.
