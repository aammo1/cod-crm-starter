# Task 16: Provide the typed storefront client and Next.js examples

## Status
complete

## Wave
6

## Description

Make future vibe-coded storefronts easy to connect to their independent CRM without copying its internals. Supply a small typed server-side client and copyable Next.js example handlers in `/home/tal7a/Projects/cod-crm-starter`. This is not a new storefront UI or published npm package.

## Dependencies

**Depends on:** task-09-catalog-api.md, task-11-order-api.md
**Blocks:** task-19-deployment-guides.md

**Context from dependencies:** Authenticated API uses Bearer `STOREFRONT_API_KEY`; catalog list/detail expose generic public products, absolute media URLs and safe settings. Order POST requires price-free `{customer:{name,phone},items:[{variantId,qty}],meta?}` plus request key; first201/replay200/different409. It returns ID/totals/offer/deadline/orderToken. Upsell requires key+`X-Order-Token` and accept/variantId or decline; it is server-timed and one unit.

## Files to Create

- `integrations/storefront-client.ts` — self-contained server-only typed client/DTOs/errors.
- `examples/nextjs/lib/crm.ts` — env-configured instance.
- `examples/nextjs/app/api/checkout/route.ts` — public storefront-server adapter example.
- `examples/nextjs/app/api/checkout/upsell/route.ts` — order-scoped upsell adapter example.
- `examples/nextjs/app/catalog-example.tsx` — simple RSC catalog fetch/use example, no store redesign.
- `examples/nextjs/README.md` — concise installation/ownership/boundary instructions.

## Files to Modify

- None in CRM runtime; examples must not become live CRM `/api/checkout` routes.

## Technical Details

1. Client configured `{ baseUrl, apiKey }` from storefront runtime `CRM_BASE_URL`, `CRM_STOREFRONT_KEY`. Require absolute HTTPS in production, never `NEXT_PUBLIC_*` or browser key. Avoid imports of CRM DB/Next internals; explicit `server-only` import and installation note are acceptable. DTOs must remain copyable rather than relying on target's path aliases.
2. Methods: `listCatalog({cursor,limit})`, `getProduct(slug)`, `createOrder(input,{idempotencyKey})`, `resolveUpsell(orderId,input,{idempotencyKey,orderToken})`. Encode path/query safely; no-store availability/order fetches; typed structured error with HTTP/code/retry metadata; bounded timeout. Never log credentials or customer request bodies. Retry transient requests only with the same request key/body; no retry on semantic 4xx.
3. Checkout example accepts name/phone/cart IDs+qty only. Public browser route must have input/body/rate limits and exact own-origin/CSRF policy appropriate to a public anonymous checkout. CRM bearer key by itself does not protect a public proxy from abuse. Never blindly forward arbitrary URLs/headers or trust browser prices. Generate stable checkout-attempt key in browser/session and forward across retries; changing cart/customer starts a new attempt. Do not dedupe by phone alone.
4. Bind returned CRM order ID/token to the initiating browser session using signed server-side/session storage or secure scoped HttpOnly cookie. Browser may receive safe totals/offer, but not CRM API key. Upsell example obtains order token from its bound session, validates order identity and forwards the same per-action key on retries. No arbitrary order ID proxying.
5. Forward only validated existing attribution fields/consent from original storefront request, not caller-controlled infrastructure IP headers. Explain optional Meta integration boundary without implementing another Pixel.
6. Catalog RSC example renders generic option labels/sold-out flags and uses actual API product price; no client-held stock authority. For Next Image explain allowlisting the configured CRM media origin. Checkout presentation can remain Zehri-style two fields/modal in the consuming store; examples do not hardwire shoe variants or include a customer-facing store UI.
7. Verify types and local calls against target mock CRM with a small disposable consumer or documented executable examples; run `npm run lint`, `npx tsc --noEmit`. Keep example imports compilable or explicitly excluded from target build with justified release integration config (task20 owns tsconfig).

## Acceptance Criteria

- [ ] Copyable client covers every v1 endpoint/error and generic DTO without private imports.
- [ ] Example keeps credentials server-only and binds upsell to original checkout session.
- [ ] Stable retry keys, validation/rate/origin handling and media origin are documented/functional.
- [ ] No new storefront or unauthenticated proxy is mounted in CRM runtime.
