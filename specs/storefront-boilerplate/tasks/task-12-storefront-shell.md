# Task 12: Storefront layout, header, footer, static pages, sitemap

## Status

pending

## Wave

4

## Description

This task builds the storefront frame that every public page shares: the `(storefront)` route-group layout with the announcement bar, header (logo, category nav, cart button), mobile menu, footer, WhatsApp floating button, pixels and the funnel host. It also adds the static content pages (about, contact, shipping and returns, terms, privacy), `sitemap.ts` and `robots.ts`.

The layout must stay **static**. That means:
- no DB reads
- no `cookies()`, `headers()` or `auth()`
- no per-request data of any kind

zehri's layout read cross-sells from the DB, which froze stale stock into its static pages. This task must not repeat that. Everything comes from `store.config.ts` and the cached loaders.

## Dependencies

**Depends on:** task-11-funnel.md, task-07-browser-tracking.md, task-03-storefront-data-cache.md
**Blocks:** task-13-catalog-pages.md, task-14-landing-pages.md

**Context from dependencies:**
- **Config (task 02).**
  - `src/config/index.ts` (server-only) exports `storeConfig`, `isRtl`, `htmlDir` and `whatsappLink(message?)`.
  - `storeConfig` includes `name`, `slug`, `locale`, `brand.{logo, logoWidth, logoHeight}`, `contact.{whatsapp, phone, email?, city, hours?}`, `announcement[]`, `nav.categories[{slug, label, image?}]`, `legal.{about, shipping, terms, privacy}` (plain text paragraphs separated by blank lines), `seo`, `domain` and `landing.index`.
  - `src/config/i18n.ts` exports `t(locale, key, vars)` and `formatPrice`.
- **Theme (task 06).** The root layout already renders `<html lang dir>` and theme CSS variables. Tailwind utilities `bg-store-*`, `text-store-*`, `border-store-border`, `rounded-store` and `font-heading` exist. Use logical spacing (`ms/me/ps/pe/start/end`).
- **Funnel (task 11).**
  - `src/stores/cart.ts` provides `CartProvider({storeSlug})` and the cart hooks.
  - `src/stores/funnel.ts` provides `openCart()` and `prefetchFunnel()`.
  - `src/components/storefront/funnel/funnel-host.tsx` provides `<FunnelHost locale storeSlug whatsapp shippingFeeMad freeShippingThresholdMad />`.
  - `src/app/(storefront)/merci/page.tsx` already exists.
- **Tracking (task 07).** `src/components/storefront/tracking/pixels.tsx` provides `<Pixels metaPixelId? tiktokPixelId? />` (client component, lazy loading).
- **Data (task 03).** `src/lib/storefront/data.ts` exports `getShopSettings()`, which returns public settings including `shippingFeeMad` and `freeShippingThresholdMad`, and `getCatalog()`. Both are cached under the `storefront` tag and return empty or default values during build.

## Files to Create

- `src/app/(storefront)/layout.tsx`
- `src/components/storefront/layout/announcement-bar.tsx`: server component, with an optional tiny CSS-only rotation.
- `src/components/storefront/layout/header.tsx`: server component with client islands.
- `src/components/storefront/layout/cart-button.tsx`: client component showing the count badge (after mount) and calling `openCart()` on click and `prefetchFunnel()` on hover.
- `src/components/storefront/layout/mobile-menu.tsx`: client component; the native `<details>` or a tiny custom drawer is preferred over radix to save JS.
- `src/components/storefront/layout/footer.tsx`: server component.
- `src/components/storefront/layout/whatsapp-button.tsx`: server component rendering a plain `<a>` link to `wa.me` (no JS needed).
- `src/components/storefront/content-page.tsx`: renders a title and paragraphs from config text.
- `src/app/(storefront)/a-propos/page.tsx`, `contact/page.tsx`, `livraison-retours/page.tsx`, `cgv/page.tsx`, `confidentialite/page.tsx`
- `src/app/sitemap.ts`, `src/app/robots.ts`

## Files to Modify

- None.

## Technical Details

### Layout

```tsx
// src/app/(storefront)/layout.tsx  — NO dynamic export, NO cookies/headers.
import { storeConfig } from "@/config";
import { getShopSettings } from "@/lib/storefront/data";
export const revalidate = 300;
export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const settings = await getShopSettings();
  const c = storeConfig;
  return (
    <CartProvider storeSlug={c.slug}>
      <div className="min-h-dvh bg-store-bg text-store-fg">
        {c.announcement.length > 0 && <AnnouncementBar messages={c.announcement} />}
        <Header />
        <main>{children}</main>
        <Footer />
        <WhatsAppButton />
        <FunnelHost locale={c.locale} storeSlug={c.slug} whatsapp={c.contact.whatsapp}
          shippingFeeMad={settings.shippingFeeMad} freeShippingThresholdMad={settings.freeShippingThresholdMad} />
        <Pixels metaPixelId={c.tracking.metaPixelId} tiktokPixelId={c.tracking.tiktokPixelId} />
      </div>
    </CartProvider>
  );
}
```

Check the actual field names returned by `getShopSettings()` and adapt.

### Header

- Logo: `next/image` with `src={brand.logo}`, `width={logoWidth}`, `height={logoHeight}`, `priority`, `sizes={`${logoWidth}px`}`, and `alt={name}`, linking to `/`.
- Desktop nav: links to `/boutique` (`t("shop")`) and each `nav.categories` entry → `/boutique/{slug}`.
- Mobile: a hamburger opens `mobile-menu`, with the cart button at the end.
- Make it sticky with a solid background. **No** `backdrop-blur`: zehri removed it because it was expensive on mobile.

### Footer

- Store name, city and hours, plus a phone link (`tel:`) and a WhatsApp link.
- Legal links: `/a-propos`, `/contact`, `/livraison-retours`, `/cgv`, `/confidentialite`, labelled with `t()`.
- A small "Paiement à la livraison" / "الدفع عند الاستلام" badge (`t("cod")`).
- © year: compute it at build/render time with `new Date().getFullYear()`. ISR refreshes it.
- **No** link to `/crm` or `/login`.

### WhatsApp button

A fixed button at the bottom on the end side (`end-4 bottom-4`). It links to `whatsappLink()` with `target="_blank" rel="noopener"` and has an inline SVG icon and an `aria-label`. It needs no client JS.

### Content pages

- Each page is a server component with `export const revalidate = false` (fully static), because its content comes only from config.
- Use `<ContentPage title={t(locale,"about")} text={storeConfig.legal.about} />`, splitting `text` on blank lines into `<p>` elements. Do not use a markdown library.
- The contact page shows the phone, WhatsApp, email and city, with no form. Orders go through the funnel, and questions go through WhatsApp; this saves JS and spam handling.
- Set metadata titles.

### sitemap.ts and robots.ts

- `sitemap.ts`:
  - `export const revalidate = 3600`.
  - Uses `getCatalog()` (cached).
  - Entries: `/`, `/boutique`, each category, each `/produit/{slug}`, and each `/l/{slug}` for products with `landingEnabled` (only if `storeConfig.landing.index`).
  - Base URL is `storeConfig.domain`.
  - During build `getCatalog()` returns `[]`. That is fine, because revalidation fills it in.
- `robots.ts`: allow `/` and disallow `/crm`, `/admin`, `/login`, `/api/` and `/merci`. Include the sitemap URL.

### Performance rules (must follow)

- Use server components by default. The only client components here are `cart-button`, `mobile-menu`, `CartProvider` (from task 11), `FunnelHost` and `Pixels`.
- No new dependencies.
- No icon library imports in server components beyond `lucide-react` icons, which are tree-shaken per icon. Avoid them in client components where an inline SVG is trivial.

## Acceptance Criteria

- [ ] `npm run build` (mock, non-existent `DB_PATH`) succeeds. In the route table, `/a-propos`, `/contact`, `/livraison-retours`, `/cgv`, `/confidentialite` and `/merci` are static (○), and no storefront route is ƒ (dynamic).
- [ ] `grep -rn "cookies()\|headers()\|from \"@/lib/db\"\|force-dynamic" "src/app/(storefront)" src/components/storefront` returns nothing.
- [ ] The cart count updates after adding items, and clicking it opens the drawer, which is loaded lazily.
- [ ] With `locale: "ar"`, the header and footer mirror correctly: the logo is on the right and the WhatsApp button is bottom-left.
- [ ] `/robots.txt` disallows the CRM paths. `/sitemap.xml` lists products once the server has warmed up.
- [ ] Lint and typecheck pass.
