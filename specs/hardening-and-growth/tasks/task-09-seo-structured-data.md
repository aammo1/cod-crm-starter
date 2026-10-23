# Task 09: SEO metadata and structured data

## Status

complete

## Wave

1

## Description

`src/components/storefront/product/product-json-ld.tsx` emits one `sku` and one price with no `AggregateOffer`, no `priceValidUntil`, `shippingDetails` or `hasMerchantReturnPolicy`, and builds `aggregateRating` (lines ~25-32) from hand-written reviews in `store.config.ts` — this violates Google's self-serving review policy and risks a manual action. Product and landing pages set an `openGraph` object that replaces the layout's (losing `siteName` and the fallback `ogImage`); there is no `og:locale`, `og:type` or Twitter card; landing pages lack a canonical; the sitemap has no `lastModified`. Organization/WebSite and BreadcrumbList JSON-LD are absent.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-24-accent-foreground-theme.md (shares `l/[slug]/page.tsx` and storefront `layout.tsx`)

**Context from dependencies:** None.

## Files to Create

- `src/lib/storefront/seo.ts` — pure helpers: `baseOpenGraph()`, `ogLocale(locale)` (`fr` → `fr_MA`, `ar` → `ar_MA`), `absoluteUrl(path)` from the configured domain, `jsonLdScript(obj)` safe serializer (escape `<` as `<`).
- `src/components/storefront/seo/site-json-ld.tsx` — Organization + WebSite JSON-LD (name, url, logo from brand assets, `sameAs` from config social links if present).
- `src/components/storefront/seo/breadcrumb-json-ld.tsx` — BreadcrumbList.

## Files to Modify

- `src/components/storefront/product/product-json-ld.tsx` — `AggregateOffer` when variants have different prices (`lowPrice`, `highPrice`, `offerCount`), else `Offer`; `priceCurrency: "MAD"`; `availability` from variant availability; `priceValidUntil` = now + 1 year (ISO date); `shippingDetails` (`OfferShippingDetails` with `shippingDestination.addressCountry: "MA"`, rate from store settings if available to the loader, else omit rate); `hasMerchantReturnPolicy` (`applicableCountry: "MA"`, link to `/livraison-retours`). **Remove `aggregateRating` and `review`** unless `store.config.ts` adds an explicit `seo.emitReviewSchema: true` — do not add that flag; just remove.
- `src/app/(storefront)/produit/[slug]/page.tsx` — merge base OG (siteName, locale, type `product`/`website`, images fallback), add `twitter: { card: "summary_large_image" }`, canonical, breadcrumbs.
- `src/app/(storefront)/l/[slug]/page.tsx` — same, plus canonical. Do **not** touch the CTA button classes on ~line 85 (task 24 owns them).
- `src/app/(storefront)/layout.tsx` — root metadata: `openGraph.locale`, `twitter.card`, render `SiteJsonLd` once. Do not touch the `themeCss` line (~64).
- `src/app/sitemap.ts` — `lastModified` per product (use product `updatedAt` if the storefront DTO exposes it; otherwise omit) and static pages.

## Technical Details

- Data access: only through `src/lib/storefront/data.ts` loaders — no DB/service imports in pages. If a needed field (e.g. `updatedAt`) is not in the storefront DTO, skip it rather than widening the DTO in this task.
- JSON-LD rendered as `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(obj) }} />`.
- Keep pages static/ISR (perf-budget asserts it); no `headers()/cookies()`.
- Validate output manually with structured examples in a comment; no network calls to validators.

## Acceptance Criteria

- [ ] No `aggregateRating`/`review` in emitted JSON-LD.
- [ ] Product with variants at 149 and 179 MAD emits `AggregateOffer` lowPrice 149 / highPrice 179.
- [ ] Product and landing HTML contain `og:site_name`, `og:locale` (`fr_MA`/`ar_MA`), `twitter:card`, canonical.
- [ ] Organization/WebSite and BreadcrumbList JSON-LD present.
- [ ] `DELIVERY_PROVIDER=mock npm run build` and `npm run perf-budget` pass (still static/ISR, ≤ 122,880 B).
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
