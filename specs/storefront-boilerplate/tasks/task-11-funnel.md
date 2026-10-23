# Task 11: Cart store, lazy drawer/checkout/upsell, merci page

## Status

pending

## Wave

3

## Description

This task ports zehri's conversion funnel to the boilerplate:

1. Cart drawer with a free-shipping progress bar and cross-sells
2. Checkout modal with exactly two fields, name and Moroccan phone, for cash on delivery
3. One-click upsell with a countdown
4. `/merci` thank-you page

The funnel must be **lightweight**. hellobaby imported its whole funnel statically in the root layout, together with zod and `libphonenumber-js/max`, which produced a 162 KB gz chunk on every page. Here:
- Only a tiny cart store and a `FunnelHost` shell load up front.
- The drawer and modals load with `next/dynamic` the first time they are opened.
- No zod, no libphonenumber and no server modules reach the client.

The same checkout and upsell modals are reused by the landing page (task 14) through a `useCheckout` hook.

## Dependencies

**Depends on:** task-06-app-shell-and-build.md, task-08-storefront-checkout-api.md
**Blocks:** task-12-storefront-shell.md

**Context from dependencies:**
- **Task 06.** The root layout is static and sets `lang`/`dir` from `store.config.ts`. Theme utilities are available: `bg-store-primary`, `text-store-primary-fg`, `bg-store-accent`, `bg-store-bg`, `text-store-fg`, `bg-store-muted`, `border-store-border`, `rounded-store`, `font-heading`. Use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`) so RTL works.
- **Task 08.** It created same-origin routes:
  - `POST /api/store/checkout`. Body `{ requestKey, customer:{name, phone}, items:[{variantId, qty}], attribution? }`. Returns 201/200 `{ orderId, totals:{itemsSubtotal, shipping, total, currency, packDiscount?}, upsellOffer: null | { offerId, productId, name, image, originalPrice, upsellPrice, expiresAt (ISO), variants:[{variantId, label, options:[{name,value}], available}] } }` and sets an httpOnly `store_order` cookie. Errors are `{ error:{ code, message } }` with status 400/403/409/429 (with `Retry-After`)/5xx.
  - `POST /api/store/orders/{orderId}/upsell`. Body `{ requestKey, action:"accept", variantId } | { requestKey, action:"decline" }`. Returns `{ orderId, upsellStatus, totals }`.
  - `GET /api/store/cross-sells?exclude=id1,id2`. Returns `[{ id, slug, name, price, image, variantId, packs }]`.
- **Task 07** (wave 2, already merged). `src/lib/storefront/track.ts` exports `track(name, contents)`, `newEventId()` and `readAttribution()`, which returns `{fbp?, fbc?, ttp?, ttclid?}`.
- **Task 04.** `src/lib/pack-pricing.ts` exports a browser-safe `applyPacks(lines, packsByProduct)` and `ProductPack = {id, quantity, price, label?, highlight}`.
- **Task 02.** `src/config/i18n.ts` exports `t(locale, key, vars)`, `formatPrice(locale, n)` and `UiKey`. It is plain TS and safe in client code. `src/config/index.ts` is **server-only**, so never import it from client components. Pass `locale`, store slug, WhatsApp number and shipping rules as props from server components.

## Files to Create

- `src/stores/cart.ts`: zustand cart, persisted to localStorage under the key `` `${storeSlug}-cart` `` (version 1).
- `src/stores/cart-provider.tsx`: `"use client"` `CartProvider({ storeSlug, children })`, which creates or holds the store for that slug and exposes `useCart(selector)`.
- `src/stores/funnel.ts`: zustand UI state: `stage: "idle" | "cart" | "checkout" | "upsell"`, the current order info and the offer.
- `src/components/storefront/funnel/funnel-host.tsx`: a `"use client"` shell. It renders nothing until `stage !== "idle"`, then dynamically imports the needed overlay.
- `src/components/storefront/funnel/cart-drawer.tsx`
- `src/components/storefront/funnel/checkout-modal.tsx`
- `src/components/storefront/funnel/upsell-modal.tsx`
- `src/components/storefront/funnel/use-checkout.ts`: a hook with `submit({name, phone, items})`, plus the upsell accept/decline helpers.
- `src/components/storefront/funnel/phone.ts`: the client-side phone regex and normaliser.
- `src/components/storefront/funnel/funnel-props.ts`: the `FunnelProps` type `{ locale, storeSlug, whatsapp, shippingFeeMad, freeShippingThresholdMad }`.
- `src/app/(storefront)/merci/page.tsx`: a static thank-you page, plus a client island that reads sessionStorage.

## Files to Modify

- None. The storefront layout that mounts `FunnelHost` is built in task 12.

## Technical Details

### Reference code (read only)

- `/home/tal7a/Projects/zehri/src/components/funnel/*`: cart drawer, checkout modal, upsell, overlays.
- `/home/tal7a/Projects/zehri/src/stores/{cart,funnel}.ts`
- `/home/tal7a/Projects/zehri/src/app/(storefront)/merci/thank-you-content.tsx`
- `/home/tal7a/Projects/hellobaby/components/funnel/*` and `/home/tal7a/Projects/hellobaby/lib/store/cart.ts`: the idempotent `submissionId` in sessionStorage, and cart version migration.

Port behaviour and wording, not shoe-specific code. Never read `.env*` or `data/` in those repos.

### Cart store

```ts
export interface CartLine {
  variantId: string; productId: string; slug: string; name: string; image: string;
  optionsLabel: string;            // e.g. "Noir / 38"
  unitPrice: number;               // display only; server recomputes
  qty: number;                     // 1..10 per variant (server limit: 10 total per variant)
  packs: ProductPack[];            // for preview of pack pricing
}
interface CartState {
  lines: CartLine[];
  add(line: Omit<CartLine, "qty">, qty?: number): void;
  setQty(variantId: string, qty: number): void;
  remove(variantId: string): void;
  clear(): void;
}
export function createCartStore(storeSlug: string) { /* zustand + persist(name: `${storeSlug}-cart`, version: 1) */ }
```

- Expose a context or a module-level singleton initialised with the slug passed from the server layout, for example a `CartProvider storeSlug` component.
- Hydration must not cause a mismatch. Render the cart count only after mount (`useSyncExternalStore` or a mounted flag).
- `add` calls `track("AddToCart", [{id: productId, quantity}])`.

### Totals preview (client)

- `subtotal = Σ unitPrice × qty`
- `{discount} = applyPacks(lines.map(l => ({productId, qty, unitPrice})), packsByProduct)`
- `shipping = (subtotal - discount) >= freeShippingThresholdMad ? 0 : shippingFeeMad`

This is labelled as an estimate only by its use. After checkout, always display the **server** `totals`.

### FunnelHost (keep it tiny)

```tsx
"use client";
const CartDrawer = dynamic(() => import("./cart-drawer"), { ssr: false });
const CheckoutModal = dynamic(() => import("./checkout-modal"), { ssr: false });
const UpsellModal = dynamic(() => import("./upsell-modal"), { ssr: false });
export function FunnelHost(props: FunnelProps) {
  const stage = useFunnel((s) => s.stage);
  if (stage === "idle") return null;
  return <>{stage === "cart" && <CartDrawer {...props} />}{stage === "checkout" && <CheckoutModal {...props} />}{stage === "upsell" && <UpsellModal {...props} />}</>;
}
```

- Also export `openCart()` and `openCheckout(items?)` helpers from `src/stores/funnel.ts`, so buttons anywhere can trigger the funnel without importing the overlays.
- Prefetch on intent: on `pointerenter` or `focus` of any "add to cart" or "order" button, call `import("./checkout-modal")` so the first open feels instant. Export `prefetchFunnel()`.
- Radix `Sheet` and `Dialog` from `src/components/ui` may be used **inside** the lazy overlays only.

### Cart drawer

- It opens from the side that matches the reading direction: `side="right"` for LTR and `"left"` for RTL.
- It shows the lines (image, name, options, qty stepper, remove) and, when packs apply, a pack badge ("Pack ×2 : −49 DH").
- Free-shipping bar: `t("freeShippingProgress", {amount: formatPrice(...)})`, or `t("freeShipping")` once the threshold is reached.
- Cross-sells: fetch `/api/store/cross-sells?exclude=<productIds>` **when the drawer opens**. Show up to 3 with a one-tap add, using the first available variant.
- The footer has the subtotal estimate and `t("checkout")`. Clicking it calls `track("InitiateCheckout", contents)` and sets stage to checkout.

### Checkout modal (2 fields)

- Fields: name (min 2 characters) and phone. The placeholder `06 XX XX XX XX` uses `inputMode="tel"` and `autoComplete="tel"`. The name field uses `autoComplete="name"`.
- Client phone check in `phone.ts`: strip spaces, dots and dashes; accept `^(?:\+212|00212|212|0)([5-7]\d{8})$`; normalise to `0XXXXXXXXX`. The server (`normalizeMaPhone`) is authoritative. Show `t("phoneInvalid")` inline.
- Shows the COD notice `t("cod")` and the order summary with the estimated total.
- Submit goes through `useCheckout().submit(...)`.
- On success:
  - Store `{orderId, totals, items summary}` in `sessionStorage["<slug>-pending-order"]`.
  - If `upsellOffer` is non-null and its `expiresAt` is in the future, set stage to `"upsell"` with the offer.
  - Otherwise clear the cart and `router.push("/merci")`.
- On error, map the code to a message:
  - 429 → `t("retryLater")`
  - `INVALID_VARIANT` → reload the cart and refresh the page data (`router.refresh()`)
  - anything else → `t("genericError")`

  Keep the same `requestKey` for retries; see below.

### useCheckout

- `requestKey`:
  - Generate it with `crypto.randomUUID()` on the first submit.
  - Store it in `sessionStorage["<slug>-checkout-key"]` together with a hash of the payload (a JSON string).
  - Reuse it while the payload is unchanged, so retries and timeouts are idempotent.
  - Generate a new one when the payload changes or after a successful order.
- Attribution: `{ eventId: newEventId(), sourceUrl: location.href, ...readAttribution() }`. The same `eventId` is sent to the browser pixels as `Purchase`: call `window.fbq?.("track","Purchase",{value,currency:"MAD",content_ids,content_type:"product"},{eventID})` and `window.ttq?.track("CompletePayment",{value,currency:"MAD",contents},{event_id})` **after** a 201/200 response, using the server `totals.total`.
- `fetch` uses `credentials: "same-origin"` and a 15 s `AbortController` timeout. On timeout, show `t("genericError")` and let the user press the button again. That retry reuses the same key, so the server returns the original order.
- Upsell: `accept(variantId)` and `decline()` POST to `/api/store/orders/{orderId}/upsell` with their own `requestKey` (a stable UUID per order and action, stored in sessionStorage).

### Upsell modal

- Shows the product image, name, `originalPrice` struck through and `upsellPrice`, and a countdown ring (SVG) driven by `expiresAt`.
- If the offer has more than one variant, show a variant picker. Variants with `available: false` are disabled.
- Accept: call `accept(variantId)`, update the pending order totals in sessionStorage, clear the cart, and go to `/merci`.
- Decline, or the countdown reaching 0: call `decline()` (fire and forget), clear the cart, and go to `/merci`.
- A 409 means the offer has already closed. Go to `/merci` silently.

### /merci

- `src/app/(storefront)/merci/page.tsx` is a **server component** with `export const metadata = { robots: { index: false } }` and no data access. Static copy comes from `t(locale, ...)`, with the locale read from the server-only `storeConfig`.
- A small client island reads `sessionStorage["<slug>-pending-order"]` and shows: order number (first 8 characters of `orderId`, uppercased), lines, total, `t("thankYouText")`, and a WhatsApp button (`https://wa.me/<whatsapp>?text=<prefilled with order number>`). The WhatsApp number comes in as a prop.
- If nothing is pending, show the generic thanks message and a link home.

## Acceptance Criteria

- [ ] No file under `src/components/storefront/funnel/` or `src/stores/` imports `zod`, `libphonenumber-js`, `@/lib/services/*`, `@/lib/db` or `@/config` (index). Importing `@/config/i18n` is allowed.
- [ ] `FunnelHost` with stage `idle` renders `null`. The overlay chunks are separate, so they don't appear in the page's initial JS (check `.next` build output or the network panel).
- [ ] Full mock flow on a test page or the merged storefront: add to cart → drawer → checkout → upsell accept → `/merci`. The order appears in `/crm/orders` with the upsell line.
- [ ] A double click on submit, or a retry after a forced timeout, creates exactly one order.
- [ ] With `locale: "ar"`, the drawer opens from the left and all funnel strings are Arabic.
- [ ] Lint and typecheck pass.

## Notes

The storefront layout that mounts `<CartProvider>` and `<FunnelHost>` is task 12. To verify this task on its own, you may add a temporary page, but delete it before finishing.
