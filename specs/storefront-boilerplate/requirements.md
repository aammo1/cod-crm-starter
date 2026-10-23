# Requirements: Storefront Boilerplate (store + CRM in one fast app)

## Summary

The owner runs Moroccan cash-on-delivery (COD) e-commerce stores in several niches. Every new niche
currently means rebuilding a store by hand. Three existing projects inform this work:

- **zehri** (`/home/tal7a/Projects/zehri`): the owner's favourite. It is a storefront and CRM in one
  Next.js app with SQLite, and it has every feature the owner needs. It is slow because every catalog
  page is `force-dynamic`, it runs about 3 full catalog hydrations per product view, the layout reads
  the DB, `inlineCss` adds CSS to every response, the image cache is lost on each deploy, and the logo
  is 244 KB.
- **hellobaby** (`/home/tal7a/Projects/hellobaby`): fast. Pages are fully static/SSG, components are
  server components by default, and fonts/images are self-hosted. Its weakness is a 162 KB gz shared
  bundle, because the funnel is imported statically and zod plus `libphonenumber-js/max` are in the
  client bundle. It has no CRM.
- **cod-crm-starter** (this repo): zehri's CRM, extracted, generalised (generic variant options) and
  tested. It is currently CRM-only, and storefronts are expected to live in separate repos.

The owner chose this design:

- One copy of this template per niche.
- One app per niche: storefront and CRM in the same Next.js process and the same SQLite database.
- A storefront that is fast like hellobaby: ISR/cached pages invalidated on demand, no DB work while
  rendering, and a lazy-loaded funnel.
- Branding and copy driven by a single `store.config.ts`, with a `src/custom/` folder for
  hand-made per-product marketing sections.
- Two selling formats:
  - A catalog store (zehri's funnel).
  - Per-product landing pages `/l/[slug]` with quantity packs and an inline order form.
- One storefront language per store (`fr` or `ar` with RTL). The CRM stays French.
- Meta and TikTok tracking, each with a browser pixel and a server-side event, deduplicated by event ID.
- Ozon Express as the only courier.
- An `npm run new-store` CLI wizard, so a new niche can go live in about half a day.
- Hosting on a Coolify VPS behind the Cloudflare proxy.

## Goals

- Launch a new niche in about half a day:
  1. Create a repo from the template.
  2. Run `npm run new-store`.
  3. Add products in `/admin`.
  4. Deploy on Coolify.
- Storefront pages (`/`, `/boutique`, `/boutique/[categorie]`, `/produit/[slug]`, `/l/[slug]`) are
  served from the ISR cache. No SQLite read happens while a visitor's request is being rendered.
- Admin, stock and order changes refresh storefront pages immediately (`revalidateTag`). A 300 s
  time-based fallback catches anything missed.
- Keep zehri's full funnel: cart drawer, 2-field checkout (name and Moroccan phone), 20 s upsell,
  `/merci`.
- Landing pages with quantity packs (for example 1 = 199 DH, 2 = 349 DH, 3 = 449 DH), edited per
  product in `/admin`. The server always computes pack prices.
- Every store-specific value lives in `store.config.ts`, `.env`, the DB (products, settings) or
  `src/custom/`. No store name is hard-coded in components.
- Meta and TikTok Purchase events are durable server-side through an outbox, and browser and server
  events are deduplicated.

## Non-Goals

- Multi-tenant or shared CRM across niches. Each niche is a separate deployment and DB.
- A bilingual FR/AR toggle within one store, or an Arabic CRM UI.
- Couriers other than Ozon Express (Cathedis, Sendit, Ameex).
- Snapchat, Google Ads or GA4 tracking.
- Online payment. COD only.
- Discount codes, coupons, or bundles of different products. Packs are the same product only.
- Removing `/api/storefront/v1/*`, `integrations/` or `examples/`. They stay working for anyone who
  wants an external storefront later.
- Migrating zehri onto this boilerplate. That is a later, separate project, and zehri gets its own
  speed pass in `zehri/specs/zehri-speed-pass/`.
- Google Sheets or webhook automation. This remains banned.
- Writing new automated test suites. Existing suites must keep passing.

## Acceptance Criteria

- [ ] `npm run new-store` on a fresh clone produces a working, branded store. After `npm run dev`,
      `/` shows that store's name, logo, colours and copy, and `/crm` works after logging in with the
      admin user the wizard created.
- [ ] `DELIVERY_PROVIDER=mock DB_PATH=/tmp/x/crm.db npm run build` succeeds without creating the DB
      file, as the Dockerfile already checks.
- [ ] After `npm run start` and a first visit, repeated GETs of `/`, `/produit/<slug>`, `/l/<slug>` and
      `/boutique` respond with `x-nextjs-cache: HIT` (or `STALE`), never `MISS`/dynamic on every
      request.
- [ ] Changing a product price in `/admin` is visible on `/produit/<slug>` on the next request after a
      reload.
- [ ] The catalog funnel works end to end with mock delivery:
      add to cart → checkout (name and phone) → upsell accept or decline → `/merci` → the order
      appears in `/crm/orders`.
- [ ] The landing funnel works end to end:
      `/l/<slug>` → pick the 2-pack → inline form → upsell → `/merci` → the order total in the CRM
      equals the pack price plus shipping rules.
- [ ] With `locale: "ar"`, the storefront renders `<html lang="ar" dir="rtl">` with an Arabic font and
      Arabic UI strings, and the CRM pages remain French and LTR.
- [ ] With Meta and TikTok configured, one Purchase is queued per platform per order (outbox rows),
      each sharing the event ID with the browser event.
- [ ] Storefront first-load JS is ≤ 120 KB gzipped on `/produit/[slug]` and `/l/[slug]`, as measured
      by `scripts/perf-budget.mjs`.
- [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` pass.

## Assumptions

- Catalogs are small, under about 200 products, so invalidating the whole storefront on any change is
  acceptable and simpler than fine-grained tags.
- The single Node process owns the DB, and in-process workers stay as they are.
- Cloudflare is configured by the owner, per the docs written in task 15.
- TikTok Events API v1.3 (`https://business-api.tiktok.com/open_api/v1.3/event/track/`) is the target.
  The implementer should verify field names against TikTok's current docs when online. Tests run with
  external network blocked.
- Pixel IDs are public and live in `store.config.ts`. Access tokens are secret and live only in env.
- No consent banner is required. This matches zehri today, and the owner can add one later.

## Technical Constraints

- Next.js 15.5.28 App Router, React 19.1, TypeScript, Tailwind v4, shadcn/radix, better-sqlite3 13,
  raw SQL migrations (`migrations/NNN_*.sql`, never rewrite applied ones), zod 3, zustand 5.
- **`"use cache"` is not available.** It needs Next canary/experimental flags. Use `unstable_cache`
  from `next/cache` with the tag `storefront`, plus route segment `revalidate`.
- **The build must never open the DB.** The Dockerfile builds with a non-existent `DB_PATH` and asserts
  that the file was not created. Storefront data loaders return empty data during
  `NEXT_PHASE === "phase-production-build"`. A boot warm-up (task 03) invalidates and re-renders
  after the server starts.
- Storefront server components must not call `cookies()`, `headers()`, `auth()` or `connection()`,
  because any of these makes the route dynamic.
- No zod, `libphonenumber-js` or DB/service modules in client bundles. Client-side phone checks use a
  regex, and the server stays authoritative.
- The funnel overlays (cart drawer, checkout, upsell) load via `next/dynamic` on first open, not in the
  initial bundle.
- The CRM's invariants in `AGENTS.md` still hold:
  - Server-side prices.
  - A checkout of exactly name + phone + variant IDs/quantities.
  - Confirmation is the stock gate: zero availability does not reject a checkout. The storefront shows
    "Épuisé"/"نفد" and disables the button, but the server still accepts active variants.
  - Idempotent receipts.
  - Mock-only verification.
- Pack pricing is the one documented exception to "discount pricing belongs only to upsell" (task 01
  updates `AGENTS.md`).
- Reference code may be **read** from `/home/tal7a/Projects/zehri/src/**` and
  `/home/tal7a/Projects/hellobaby/{app,components,lib}/**` for porting. Never read their `.env*`,
  `data/` or databases, and never modify those repos.
- All storefront text comes from `store.config.ts` (content) or `src/config/i18n.ts` (fixed UI
  strings, fr/ar). CRM copy stays French.
