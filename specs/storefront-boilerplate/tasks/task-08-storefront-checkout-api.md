# Task 08: Same-origin browser checkout and upsell routes with attribution

## Status

pending

## Wave

2

## Description

The storefront lives in the same app as the CRM, so the browser should place orders through **same-origin** routes that call the existing, hardened order service in-process. It does not go through a Bearer-key proxy. This task adds:
- `POST /api/store/checkout`
- `POST /api/store/orders/[id]/upsell`

Both reuse `storefrontOrderService()` from `src/lib/storefront-order-api.ts`, which provides idempotent receipts, server prices, packs (task 04) and upsell offers. Browser protections are added on top:
- An origin check.
- The public request budget.
- A body size limit.
- The order token stored in an **httpOnly cookie** instead of exposing it to JavaScript.

The task also wires Meta and TikTok Purchase attribution into checkout.

## Dependencies

**Depends on:** task-03-storefront-data-cache.md, task-04-product-packs-backend.md, task-05-tiktok-events-backend.md
**Blocks:** task-11-funnel.md

**Context from dependencies:**
- Task 03 added `revalidateStorefront()` (`src/lib/storefront/revalidate.ts`) and cached loaders (`src/lib/storefront/data.ts`: `getCatalog`, `getProduct`, `getCrossSells`, `getShopSettings`). These are server-only.
- Task 04 added quantity packs. Checkout automatically applies an active pack when one product's total quantity equals a pack quantity. The response `totals` may include `packDiscount`, and `orders.pack_snapshot_json` records it. Request shape is unchanged: `{ customer: {name, phone}, items: [{variantId, qty}], meta? }`.
- Task 05 added `src/lib/services/tiktok.ts`, with `tiktokEnabled()`, `tiktokContextFromAttribution(attr, ip, ua)` and `recordTikTokPurchaseContext(db, orderId, context, deadline)`. It also added `src/lib/tiktok-shared.ts`. The worker turns `tiktok_purchases` rows into `CompletePayment` events once the upsell resolves (DB trigger) or the deadline passes.
- Existing v1 routes are the reference implementation: `src/app/api/storefront/v1/orders/route.ts` (Bearer auth, `Idempotency-Key` header, `storefrontCheckoutSchema`, `storefrontOrderService().checkout(key, body)`) and `src/app/api/storefront/v1/orders/[id]/upsell/route.ts` (uses `X-Order-Token`). `storefrontAttributionSchema` (`src/lib/storefront-api-schemas.ts`) is the strict `meta` object `{eventId, sourceUrl, fbp?, fbc?, clientIpAddress?, clientUserAgent?}`. Find where `storefront-orders.ts` inserts into `meta_purchases` from that `meta`.

## Files to Create

- `src/app/api/store/checkout/route.ts`
- `src/app/api/store/orders/[id]/upsell/route.ts`
- `src/app/api/store/cross-sells/route.ts`: GET, cached JSON for the cart drawer.
- `src/lib/storefront/browser-guard.ts`: a shared same-origin check, budget and body reading for `/api/store/*`.

## Files to Modify

- `src/lib/storefront-api-schemas.ts`: add optional `ttp` and `ttclid` to `storefrontAttributionSchema` (strict, regex `/^[\w.-]+$/`, max 256 and 512).
- `src/lib/services/storefront-orders.ts`: where the Meta purchase context is recorded at checkout, also call `recordTikTokPurchaseContext(...)` in the **same transaction**, when `tiktokEnabled()` and `meta` is present. Use the same `eventId`, so browser `ttq` and server events are deduplicated.

## Technical Details

### browser-guard.ts

```ts
import "server-only";
export async function guardStoreRequest(request: Request, budgetKey: "store-checkout" | "store-upsell", maxBytes = 16_384)
  : Promise<{ ok: true; body: unknown } | { ok: false; response: Response }>
```

- Reject with 403 unless `sec-fetch-site` is `same-origin` (or absent **and** the `Origin` header equals `CRM_PUBLIC_URL`'s origin). Reuse `browserMutationAllowed` from `src/lib/browser-mutation.ts` if it fits; read it first. It implements the `SECURITY_ALLOWED_ORIGINS` exact-origin check used by middleware.
- Rate-limit with `publicRequestBudget(request, budgetKey)` from `src/lib/services/security-budgets.ts`. Return 429 with `Retry-After` when limited. Check whether the budget function needs new key names registered; follow the existing pattern there.
- Read the body with `readLimitedJson(request, maxBytes)` and map `RequestBodyError` to its status.
- Return JSON errors shaped `{ error: { code, message } }`, matching `storefrontError`. Messages are in French; the UI translates by `code`.

### POST /api/store/checkout

Request body from the browser:
```json
{ "requestKey": "<uuid from sessionStorage, stable across retries>",
  "customer": { "name": "…", "phone": "06…" },
  "items": [{ "variantId": "…", "qty": 2 }],
  "attribution": { "eventId": "<uuid>", "sourceUrl": "https://store/produit/x", "fbp": "…", "fbc": "…", "ttp": "…", "ttclid": "…" } }
```

1. Use `guardStoreRequest`. Validate `requestKey` with `storefrontRequestKeySchema`.
2. Build `meta` **on the server**. Take `eventId`, `sourceUrl` and the cookie IDs from `attribution`. Set `clientIpAddress = trustedClientIp(request)` (only from the verified proxy header, never raw XFF) and `clientUserAgent = request.headers.get("user-agent")?.slice(0, 1024)`. Drop `meta` entirely when `attribution` is missing or invalid; checkout must still succeed.
3. Validate `{ customer, items, meta }` with `storefrontCheckoutSchema`, then call `storefrontOrderService().checkout(requestKey, body)`. Wrap it with the same error mapping as v1 (`storefrontOrderApiError`).
4. On 200/201:
   - Set the cookie `store_order` = `${orderId}.${orderToken}` with `HttpOnly; Secure (when https); SameSite=Strict; Path=/api/store; Max-Age=3600`.
   - Return JSON `{ orderId, totals, upsellOffer }`. **Never** return `orderToken`.
   - Send `Cache-Control: no-store`.
5. Call `revalidateStorefront()`? **No.** A new order does not change public availability; confirmation does. Do not call it.

### POST /api/store/orders/[id]/upsell

- Body: `{ requestKey, action: "accept", variantId } | { requestKey, action: "decline" }`.
- Read the `store_order` cookie. The `orderId` part must equal `[id]`; otherwise return 403 `ORDER_TOKEN_REQUIRED`.
- Call the same service method the v1 upsell route calls, passing the token from the cookie. Replicate its argument order and idempotency scope `upsell:<orderId>`.
- On success, return `{ orderId, upsellStatus, totals }`.
- Deadlines, 409 and replay semantics are inherited from the service. Do not re-implement them.

### GET /api/store/cross-sells?exclude=id1,id2

- Returns up to 4 products from `getCrossSells(exclude)`, mapped to `{ id, slug, name, price, image, variantId (first available), packs }`.
- Sends `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- Has `export const revalidate = 60` and **no** `force-dynamic`. Parse `exclude` safely (max 20 IDs, each ≤ 200 characters).

This replaces zehri's pattern of computing cross-sells in the layout, which froze stock into static pages at build time.

### storefront-orders.ts wiring

- Locate the Meta purchase insert. Immediately after it, inside the same transaction:
  `if (tiktokEnabled() && request.meta) recordTikTokPurchaseContext(db, id, tiktokContextFromAttribution(request.meta, request.meta.clientIpAddress, request.meta.clientUserAgent), deadline)`.
  Reuse the same `deadline` value Meta uses.
- The canonical request hash must be computed over the same canonicalised body as before. Adding optional `ttp`/`ttclid` changes the hash only when they are present, which is acceptable. Do not change `canonicalCheckout` semantics otherwise.

### Middleware

`src/middleware.ts` matches only `/admin`, `/crm`, `/api/admin` and `/api/crm`. Leave it alone; `/api/store/*` does its own guard.

## Acceptance Criteria

- [ ] With `DELIVERY_PROVIDER=mock` and a temporary DB: POST `/api/store/checkout` with a same-origin header and a valid body returns 201 with `{orderId, totals, upsellOffer}`, sets `store_order` as an HttpOnly cookie, and the JSON contains no `orderToken`.
- [ ] Repeating it with the same `requestKey` returns 200 with an identical body and no new order row.
- [ ] A cross-site request (`sec-fetch-site: cross-site`) returns 403.
- [ ] Upsell accept with the cookie returns 200. Without the cookie it returns 403. After the deadline the service's 409 is propagated.
- [ ] With TikTok and Meta enabled and attribution present, one order creates one `meta_purchases` row and one `tiktok_purchases` row with the same `event_id`.
- [ ] A 2-unit order on a product with a 2-pack returns `totals.packDiscount`.
- [ ] `/api/store/cross-sells` responds without a DB query on repeated calls (cache hit).
- [ ] `npm test`, lint and typecheck pass. The v1 routes are unchanged and still pass their tests.
