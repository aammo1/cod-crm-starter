# Task 09: Expose the authenticated published catalog API

## Status
complete

## Wave
4

## Description

Allow separately built storefront servers to read their CRM-owned catalog safely. This is a server-to-server integration surface in `/home/tal7a/Projects/cod-crm-starter`; do not expose stock internals or CRM sessions to the browser.

## Dependencies

**Depends on:** task-03-store-configuration.md, task-04-catalog-service.md, task-06-integration-auth.md
**Blocks:** task-16-storefront-client.md

**Context from dependencies:** Catalog services expose active generic products and stable variants with option labels/images and numeric internal availability. `requireStorefrontApi(request)` enforces a runtime `STOREFRONT_API_KEY` bearer credential (minimum 32 characters), disabled when unset, and returns French structured errors. Safe store settings are projected separately from secrets.

## Files to Create

- `src/app/api/storefront/v1/catalog/route.ts`
- `src/app/api/storefront/v1/catalog/[slug]/route.ts`
- `src/lib/storefront-catalog-dto.ts` — pure public mapper with absolute media URL handling.

## Files to Modify

- None outside these new files.

## Technical Details

1. Both routes are `runtime = "nodejs"`, bearer-authenticated and dynamic/no-store so stock/config changes aren't silently stale. No permissive CORS; no auth credential query param.
2. `GET /api/storefront/v1/catalog?cursor=...&limit=...` returns `{ products, nextCursor, settings: { storeName, currency: "MAD", shippingFeeMad, freeShippingThresholdMad } }`; default 50/max100, stable ID cursor, bounded/validated cursor/limit. Do not fetch entire catalog then expose an unbounded response.
3. `GET /api/storefront/v1/catalog/[slug]` returns `{ product }` for active product or structured 404. Active products with no available stock remain readable; active variants expose boolean `available`, not physical/reserved/quarantine counts. Inactive products/variants omitted.
4. Public product fields: ID/slug/name/category/price/currency/description/images/options/variants plus optional public marketing fields. Public variant `{ id, sku, label, options, images, available }`. No cost/internal user/supplier/receipt/stock movement/secret fields. DTOs match `commerce-types.ts` and client task.
5. Resolve `/api/media/*` stored paths using configured `CRM_PUBLIC_URL` absolute origin, not a caller-controlled Host header. Preserve valid safe image URLs only according to existing upload policy. API must not fetch remote media.
6. Return `{ error: { code, message } }` with French messages, no SQL/raw stack. Verify pagination, archive filtering, sold-out/default variants and key failures using local target requests, then `npm run lint`, `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] Versioned catalog/detail endpoints expose stable generic DTOs and safe settings.
- [ ] Pagination bounded and repeatable; inactive data not published.
- [ ] Media URLs work from a separate storefront origin.
- [ ] No exact stock counts, private CRM fields or secrets leave endpoints.
