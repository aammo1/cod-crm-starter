# Task 13: Home, boutique, category and product pages, custom sections

## Status

complete

## Wave

5

## Description

This task builds the catalog storefront: the home page (sections ordered by config), `/boutique`, `/boutique/[categorie]` and `/produit/[slug]`. It also adds the `src/custom/` registry for hand-made, per-product marketing sections. zehri hard-coded these with `if (product.slug === "bottines-cadena")`; here they are mapped in config.

These pages are where the speed goal is won or lost. They must be:
- ISR (rendered once, then cached, and invalidated by `revalidateStorefront()`)
- server components by default, with small client islands only for the gallery, option selection and add-to-cart
- built with `next/image` and correct `sizes`/`priority` on the LCP image

This follows hellobaby's approach, which is fast, but uses live CRM data.

## Dependencies

**Depends on:** task-12-storefront-shell.md
**Blocks:** task-14-landing-pages.md, task-15-docs-and-perf-budget.md

**Context from dependencies:**
- **Data (task 03).** `src/lib/storefront/data.ts` (server-only, cached with tag `storefront`, React `cache()`-wrapped, returns empty or null during build) exports:
  - `getCatalog()`
  - `getProduct(slug)`
  - `getCategory(category)`
  - `getBestSellers(limit)`
  - `getCrossSells(excludeIds, limit)`
  - `getShopSettings()`
- **Product shape.** Each product is a `StorefrontProductView`:
  - Product fields: `{ id, slug, name, category, price (int MAD), description, story?, materials?, badge?, images: string[], optionDefinitions: [{name, values[]}], variants: [{ id, productId, sku, label, options:[{name,value}], images[], active, available: boolean }], upsellRef?, isBestSeller, active, packs: [{id, quantity, price, label?, highlight}], landingEnabled }`.
  - Image URLs are under `/api/media/...` or `/images/...`. Check what `toStorefrontProductView` returns.
- **Config (task 02).** `storeConfig` (server-only) has:
  - `home.sections`, an ordered subset of `"hero" | "categories" | "bestSellers" | "guarantees" | "testimonials" | "faq" | "cta"`
  - `home.hero{title, subtitle, image, ctaLabel, ctaHref}`, `home.guarantees[{icon, title, text}]`, `home.testimonials[{name, city?, text, rating}]`, `home.faq[{q, a}]`, `home.cta?`
  - `nav.categories[{slug, label, image?}]`
  - `product.{trustBadges[], reviews[{name, text, rating, productSlug?}], sizeGuides{[category]: {title, headers[], rows[][]}}}`
  - `customSections{[productSlug]: string[]}`

  `t(locale, key)` and `formatPrice` come from `@/config/i18n`.
- **Shell (task 12).** The `(storefront)` layout already provides the header, footer, cart provider, funnel host and pixels.
- **Funnel (task 11).** It provides:
  - `useCart()` / `add(line, qty)` (from `src/stores/cart-provider.tsx`)
  - `openCart()` and `prefetchFunnel()` (from `src/stores/funnel.ts`)
  - `track()` (from `src/lib/storefront/track.ts`)

  Cart line shape: `{ variantId, productId, slug, name, image, optionsLabel, unitPrice, qty, packs }`.

## Files to Create

- `src/app/(storefront)/page.tsx`: home.
- `src/app/(storefront)/boutique/page.tsx`
- `src/app/(storefront)/boutique/[categorie]/page.tsx`
- `src/app/(storefront)/produit/[slug]/page.tsx`
- `src/components/storefront/home/{hero,categories,best-sellers,guarantees,testimonials,faq,cta}.tsx`: server components.
- `src/components/storefront/product/product-card.tsx`: server component.
- `src/components/storefront/product/product-grid.tsx`: server component.
- `src/components/storefront/product/gallery.tsx`: client component, with CSS scroll-snap plus thumbnails and no carousel library.
- `src/components/storefront/product/buy-box.tsx`: client component handling option selection, quantity, pack hint, add-to-cart and "order now".
- `src/components/storefront/product/size-guide.tsx`: server component wrapping a `<dialog>` with a tiny client opener, or `<details>`.
- `src/components/storefront/product/reviews.tsx`, `trust-badges.tsx`, `product-json-ld.tsx`: server components.
- `src/custom/index.ts`: registry `Record<string, ComponentType<{ product: StorefrontProductView; locale: "fr"|"ar" }>>` using `next/dynamic` imports.
- `src/custom/README.md`: how to add a section. Include an example.
- `src/custom/example-feature-grid.tsx`: one generic example section, a 3-column feature grid driven by `product.materials`.

## Files to Modify

- None.

## Technical Details

### Route segment config (all four pages)

```ts
export const revalidate = 300;          // fallback; real freshness comes from revalidateStorefront()
// dynamic routes only:
export const dynamicParams = true;
export function generateStaticParams() { return []; }   // build never opens the DB; render on first request, then ISR
```

- **Never** use `cookies()`, `headers()`, `searchParams` or `connection()` in these pages. Reading `searchParams` makes the page dynamic.
- zehri used `?couleur=` and hellobaby used `ProductColorQuery`; do not use either approach. Initial option selection happens **client-side** in `buy-box` and `gallery` from `location.search` (`?options=Couleur:Noir`), after mount.
- Same for the boutique filter: do not use `?categorie=`. Use `/boutique/[categorie]` routes.
- `notFound()` when `getProduct(slug)` returns null or the product is inactive.
- `generateMetadata` uses the same cached `getProduct` call, so it is deduplicated via React `cache()`. This fixes zehri's double hydration.

### Home

- Render `storeConfig.home.sections` in order:
  - `hero`: a full-width `next/image` with `priority` and `sizes="100vw"`, the title in `font-heading`, and a CTA.
  - `categories`: `nav.categories` cards.
  - `bestSellers`: `getBestSellers(8)` in a product grid.
  - `guarantees`, `testimonials`, `faq`: config content. The FAQ uses `<details>`, so it needs no JS.
  - `cta`: config content.
- If the catalog is empty (fresh store or build time), hide `bestSellers` instead of showing an empty grid.

### Product card

- `next/image` with `sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"`.
- Shows the price, a crossed-out original price when a `badge` indicates a promo (only if the model has one; otherwise just the price), the badge, and a "Épuisé" overlay when no variant is `available`.
- The card is a plain link to `/produit/{slug}`. A quick-add button is **not** included, to save JS; the product page is one tap away.

### Product page layout

- Mobile-first. The order on mobile is: gallery → name/price → buy box → trust badges → description/story → size guide (if `sizeGuides[product.category]` exists) → custom sections → reviews → cross-sells ("Vous aimerez aussi", `getCrossSells([product.id], 4)`).
- **Gallery** (client component):
  - The first image is rendered by the server **inside** the client component's initial HTML with `priority`, `fetchPriority="high"` and `sizes="(max-width: 768px) 100vw, 50vw"`. Other images are lazy.
  - Swipe uses CSS `scroll-snap-type: x mandatory`. Thumbnails scroll to their index.
  - When a variant with its own `images` is selected (listen to a tiny custom event or shared zustand slice from buy-box), switch to that variant's images.
- **Buy box** (client component):
  - Option selectors come from `optionDefinitions`, as buttons or swatches. A value whose every matching variant is unavailable is shown disabled with a strike-through.
  - It resolves the selected variant by matching all option values. If `optionDefinitions` is empty, use the single default variant.
  - Quantity stepper (1–10).
  - Pack hint: if packs exist, show "2 pièces : 349 DH (−49 DH)" chips. Clicking a chip sets the quantity.
  - Buttons:
    - `t("addToCart")` adds the line and calls `openCart()`.
    - `t("orderNow")` adds the line and opens the funnel straight at checkout via `openCheckout()`.
    - Both call `prefetchFunnel()` on pointerenter.
  - If the product has `landingEnabled`, also show a subtle link "Voir l'offre" to `/l/{slug}`.
  - On mount, fire `track("ViewContent", [{id, quantity: 1}])` once.
- **Size guide**: renders a table from config.
- **Custom sections**: `storeConfig.customSections[product.slug]` lists registry keys. Render `registry[key]` for each, skipping unknown keys with a dev-only `console.warn`. The registry uses `next/dynamic` so that unused sections aren't bundled into every product page.
- **JSON-LD** (`product-json-ld.tsx`): a schema.org `Product` with `offers` (`priceCurrency: "MAD"`, `price`, `availability` based on any available variant) and `aggregateRating` only if config reviews exist for that slug.

### Reference code (read only)

- `/home/tal7a/Projects/zehri/src/components/product/*` (product detail, gallery, swatches, size guide) and `src/components/home/*`.
- `/home/tal7a/Projects/hellobaby/components/product/gallery.tsx` (priority on the first image) and `/home/tal7a/Projects/hellobaby/app/produits/[slug]/page.tsx`.

Port the UX, not shoe- or baby-specific logic. Options are generic strings.

## Acceptance Criteria

- [ ] Build route table: `/` is ○ or ISR. `/boutique` is ISR. `/boutique/[categorie]` and `/produit/[slug]` are ● or ISR with `dynamicParams`. None is ƒ.
- [ ] After `npm run start`, warm-up and one visit, `curl -sI http://localhost:3000/produit/<slug>` twice shows `x-nextjs-cache: HIT` on the second request.
- [ ] Changing the product price in `/admin` and reloading `/produit/<slug>` shows the new price, with no restart needed.
- [ ] Option selection disables combinations with no available variant. Add-to-cart puts the right `variantId` in the cart.
- [ ] A product with a custom section mapped in `store.config.ts` renders it. Unmapped products don't load that chunk.
- [ ] No storefront page file uses `searchParams`, `cookies` or `headers`.
- [ ] Lint and typecheck pass.
