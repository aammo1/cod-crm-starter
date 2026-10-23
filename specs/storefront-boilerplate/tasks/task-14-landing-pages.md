# Task 14: Landing pages `/l/[slug]` with packs and an inline order form

## Status

pending

## Wave

6

## Description

Ad traffic (Meta and TikTok) for Moroccan COD converts best on **single-product landing pages**. These pages have a long marketing layout, quantity packs ("1 pièce 199 DH / 2 pièces 349 DH / 3 pièces 449 DH") and the order form **on the page**, with no cart step. This task builds `/l/[slug]` for products where the admin enabled the landing page (task 09).

The page reuses the checkout hook and the upsell modal from the funnel, so idempotency, attribution, upsell and `/merci` behave exactly as they do in the catalog flow. Like the product page, it is ISR, and its first-load JS must stay within budget.

## Dependencies

**Depends on:** task-13-catalog-pages.md, task-12-storefront-shell.md, task-09-admin-packs-editor.md
**Blocks:** task-15-docs-and-perf-budget.md

**Context from dependencies:**
- **Products.** Products carry:
  - `packs: [{id, quantity (2..10), price (whole pack, int MAD), label?, highlight}]`
  - `landingEnabled: boolean`

  These are set in `/admin` (task 09). The server applies a pack automatically when one product's total quantity equals a pack quantity. The client only sends `items: [{variantId, qty}]` and never a price. `src/lib/pack-pricing.ts` exports a browser-safe `applyPacks()` for previews.
- **Data (task 03).** `src/lib/storefront/data.ts` provides `getProduct(slug)` (cached, null during build) and `getShopSettings()`.
- **Funnel (task 11).**
  - `src/components/storefront/funnel/use-checkout.ts` provides `useCheckout()`, with `submit({name, phone, items})`. It handles the request key, attribution and the browser Purchase pixel, and stores the pending order in sessionStorage. It returns `{orderId, totals, upsellOffer}` or a typed error.
  - The upsell flow is entered by setting the funnel store stage to `"upsell"` with the offer (`src/stores/funnel.ts`), and `<FunnelHost>` (mounted in the layout by task 12) renders the lazy upsell modal.
  - `src/components/storefront/funnel/phone.ts` provides the client phone validation.
- **Product components (task 13).**
  - `src/components/storefront/product/gallery.tsx` (client, priority on the first image)
  - `trust-badges.tsx`, `reviews.tsx`, `product-json-ld.tsx`
  - The custom-section registry `src/custom/index.ts`, mapped by `storeConfig.customSections[slug]`

  Reuse them; do not duplicate them.
- **Config.** `storeConfig.landing.{stickyCta, index}`. UI strings come from `t(locale, …)`: `packs`, `pieces`, `save`, `bestValue`, `differentOptions`, `unit`, `orderNow`, `confirmOrder`, `fullName`, `phone`, `cod`, and the others.

## Files to Create

- `src/app/(storefront)/l/[slug]/page.tsx`
- `src/components/storefront/landing/landing-hero.tsx`: server component with the title, price "à partir de", rating stars and the gallery.
- `src/components/storefront/landing/pack-selector.tsx`: client component.
- `src/components/storefront/landing/inline-order-form.tsx`: client component with the pack selector, per-unit options, name/phone, total and submit.
- `src/components/storefront/landing/sticky-cta.tsx`: client component, a mobile bottom bar that scrolls to the form.
- `src/components/storefront/landing/landing-faq.tsx`: server component using config `home.faq` with `<details>`.

## Files to Modify

- None.

## Technical Details

### Route

```ts
export const revalidate = 300;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
```

- `notFound()` unless `product` exists, is active and has `landingEnabled`.
- Metadata: title `${product.name}`, description from `product.description` (≤ 160 characters), the `og:image` set to the first image, and `robots: { index: storeConfig.landing.index }`.
- **No** `searchParams`, `cookies` or `headers`. UTM, fbclid and ttclid are captured client-side by `<Pixels>` (task 07).

### Page structure (mobile-first, single column; two columns ≥ 1024 px with the form sticky on the end side)

1. Landing hero: gallery, name, rating (from config reviews for this slug, if any), "à partir de {lowest per-unit price}", and badge.
2. **Inline order form** (above the fold on desktop, directly after the hero on mobile), with `id="commander"`.
3. Trust badges, and the COD/delivery guarantees from `home.guarantees`.
4. Custom sections for this slug (the long-form marketing), then `product.story` and `description`.
5. Reviews (config).
6. FAQ (config).
7. A repeated CTA button that scrolls to `#commander`.
8. Sticky CTA on mobile when `landing.stickyCta` is true. It shows after the form scrolls out of view (IntersectionObserver), displays "{t('orderNow')} · {price}", and scrolls back to the form.

### Pack selector

- Options:
  - Quantity 1 at the base price.
  - Each active pack, sorted by quantity: `t("pieces",{n})`, the pack price, crossed-out regular price `q × base`, and `t("save",{amount})`.
- The `highlight` pack shows a `t("bestValue")` ribbon or its `label`, and is **preselected** if present; otherwise quantity 1 is preselected.
- Render as large radio cards (accessible `role="radiogroup"`) using theme colours.

### Options for multiple units

- If the product has `optionDefinitions`:
  - Show **one** option selector by default, applied to all units.
  - A link `t("differentOptions")` expands one selector per unit (`t("unit",{n})`). This covers cases like 2 pairs in different sizes.
- Build `items` by grouping identical variants: `[{variantId, qty}]`. The server sums quantities per product to match the pack, so mixed variants still get the pack price. Keep this consistent with `applyPacks`, which groups by `productId`.
- Disable unavailable combinations as the buy box does. If the selected variant becomes unavailable, show `t("soldOut")` on that unit and block submit. Checkout itself would still accept it, because confirmation is the stock gate, but don't sell visibly sold-out options.

### Inline form

- Name and phone (the same validation and attributes as the checkout modal), the COD notice, and the total:
  - Pack or unit subtotal.
  - Shipping, estimated from the `shippingFeeMad` and `freeShippingThresholdMad` props passed from the server page.
  - Bold total.
- Submit:
  - Call `track("InitiateCheckout")` once on the first field focus.
  - On submit, call `useCheckout().submit({name, phone, items})`.
  - On success with an upsell offer, set the funnel stage to `"upsell"` with the offer. `FunnelHost` shows it, and it goes to `/merci` afterwards.
  - On success without an offer, go straight to `/merci`.
  - The landing flow must **not** touch the persisted cart, because it has its own local state.
- Errors are handled as in the checkout modal (`retryLater`, `genericError`, and the invalid-variant refresh).

### Performance

- Server components by default. The client islands are `gallery` (reused), `pack-selector` and `inline-order-form` (one island containing both), and `sticky-cta`.
- `inline-order-form` must not import radix, zod or libphonenumber.
- The upsell modal stays lazy through FunnelHost.

## Acceptance Criteria

- [ ] For a product with packs {2: 349, 3: 449} at a base of 199 and the landing page enabled:
  - `/l/<slug>` renders with the 3 pack cards and the highlighted one preselected.
  - Submitting with the 2-pack creates an order whose CRM total is 349 plus shipping (per settings), and `pack_snapshot_json` is set.
- [ ] For the same product with the landing page disabled, the page returns 404 (after revalidation).
- [ ] Two units with different options (the per-unit toggle) still get the 2-pack price.
- [ ] The upsell appears after submit (when enabled in settings), and accepting it adds the line. `/merci` shows the final total.
- [ ] The second request to `/l/<slug>` is `x-nextjs-cache: HIT`.
- [ ] With `locale: "ar"`, the layout mirrors, the form sits on the left on desktop, and all strings are Arabic.
- [ ] Lint and typecheck pass.
