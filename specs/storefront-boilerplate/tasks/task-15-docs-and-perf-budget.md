# Task 15: New-niche guide, Cloudflare docs, perf budget script

## Status

complete

## Wave

7

## Description

This task closes the loop. It does three things:
1. Writes the owner-facing guide for launching a new niche end to end.
2. Documents the Coolify and Cloudflare setup that provides the edge caching speed win.
3. Adds a `perf-budget` script so speed regressions are caught automatically.

The budget is: storefront routes are not dynamic, and first-load JS is ≤ 120 KB gzipped on product and landing pages. Without the script, the boilerplate would slowly drift back to zehri's performance.

## Dependencies

**Depends on:** task-13-catalog-pages.md, task-14-landing-pages.md, task-10-new-store-cli.md, task-01-update-agents-architecture.md
**Blocks:** task-16-ozon-status-map.md (ordering only)

**Context from dependencies:** By now the repo has:
- The new-store wizard (`npm run new-store`, `scripts/new-store.mjs`, `--answers` mode, `examples/new-store-answers.json`).
- The config at `store.config.ts`, with schema `src/config/schema.ts` and strings `src/config/i18n.ts`.
- Storefront routes:
  - `/`, `/boutique`, `/boutique/[categorie]`, `/produit/[slug]`, `/l/[slug]` (ISR, `revalidate = 300`, invalidated by `revalidateStorefront()`)
  - `/merci` and the content pages `/a-propos`, `/contact`, `/livraison-retours`, `/cgv`, `/confidentialite` (static)
  - `sitemap.xml` and `robots.txt`
- The pack editor in `/admin/produits/[id]` and the landing toggle.
- Browser routes `/api/store/checkout`, `/api/store/orders/[id]/upsell`, `/api/store/cross-sells`, plus the pixel relay `/api/pixel` (Meta and TikTok).
- The boot warm-up via `/api/internal/warmup`.
- The image cache persisted at `/app/data/image-cache`.
- TikTok env variables `TIKTOK_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_TEST_EVENT_CODE`, `TIKTOK_API_BASE`.
- Custom sections in `src/custom/` (with a README).

`AGENTS.md` was updated in task 01 and mentions `npm run perf-budget` as "added by specs/storefront-boilerplate".

## Files to Create

- `docs/new-niche.md`: the step-by-step launch guide (French, since the owner reads French; technical identifiers stay as-is).
- `scripts/perf-budget.mjs`: the post-build budget check.

## Files to Modify

- `docs/operations.md`: add sections "Cloudflare" and "Cache & performance".
- `package.json`: add `"perf-budget": "node scripts/perf-budget.mjs"`.
- `.github/workflows/ci.yml`: run `npm run perf-budget` after the existing build step.
- `README.md`: link to `docs/new-niche.md`.
- `AGENTS.md`: remove the "(added by specs/storefront-boilerplate)" markers now that the commands exist.
- `docs/release-verification.md`: add an empty table for the PageSpeed results (route, LCP mobile, TBT, CLS, date). The owner fills it in.

## Technical Details

### docs/new-niche.md (outline, in French)

1. **Prérequis**: Node 22, a GitHub account, Coolify VPS access, a Cloudflare account, the domain, logo, pixel IDs and tokens, and Ozon access.
2. **Créer le repo**: "Use this template" from `aammo1/cod-crm-starter`, clone it, then `npm install`.
3. **Assistant**: `npm run new-store`. Include a short list of what it asks and what it writes.
4. **Personnaliser**:
   - The text in `store.config.ts` (hero, FAQ, avis, légal).
   - Adding a custom section in `src/custom/` and mapping it in `customSections`.
   - Switching between `fr` and `ar`.
5. **Produits**: `/admin` → new product → options (up to 3 axes) → photos → opening stock in `/crm/stock` → packs and landing page.
6. **Paramètres**: `/crm/parametres` (shipping fee, free-shipping threshold, upsell).
7. **Équipe**: `/crm/equipe` for agents.
8. **Déployer sur Coolify**:
   - New resource from the GitHub repo, build pack Dockerfile.
   - Persistent volume `/app/data`.
   - Env vars from `.env.production.example`.
   - Health check `/api/health`.
   - One single replica (SQLite).
9. **Cloudflare**: link to `docs/operations.md#cloudflare`.
10. **Vérifier**:
    - A test order through the catalog and through the landing page, with `DELIVERY_PROVIDER=mock` first, then Ozon.
    - The Meta and TikTok test events.
    - PageSpeed mobile.
11. **Mise à jour du template**: link to `docs/template-upgrades.md`.

### docs/operations.md: Cloudflare section

- DNS: proxied (orange cloud). SSL/TLS: **Full (strict)**, using Coolify's Let's Encrypt certificate at the origin.
- Cache Rules, in this order:
  1. **Bypass**: URI path starts with `/crm`, `/admin`, `/login`, `/api/` (except the two below), `/merci`; **or** the cookie contains `authjs.session-token`.
  2. **Eligible for cache, respect origin**: `/_next/static/*`, `/_next/image*`, `/api/media/*`, `/brand/*`, `/images/*`. The origin already sends long `Cache-Control` headers.
  3. **Eligible for cache, Edge TTL 60 s, Browser TTL "respect origin"**: storefront HTML for `/`, `/boutique*`, `/produit/*`, `/l/*`, `/a-propos`, `/contact`, `/livraison-retours`, `/cgv`, `/confidentialite`.

     Explain the trade-off: after an admin change the edge can lag by at most 60 s, which is acceptable because confirmation is the stock gate. Alternatively, purge from the Cloudflare dashboard after big catalog changes.
  4. `/api/store/cross-sells`: respect origin (`s-maxage=60`).
- Turn on **Brotli** and **HTTP/3**. Do **not** turn on Rocket Loader, because it breaks the deferred pixel loading. Auto Minify is unnecessary.
- **Client IP**: set `SECURITY_TRUSTED_IP_HEADER=CF-Connecting-IP` **only** if the VPS firewall accepts 80/443 from Cloudflare IP ranges only. Otherwise leave it empty. It affects rate limits and the CAPI IP.
- `CRM_PUBLIC_URL` and `SECURITY_ALLOWED_ORIGINS` must use the public `https://` domain.

### docs/operations.md: Cache & performance section

- How freshness works: ISR plus `revalidateStorefront()` on every admin, stock or order change, a 300 s fallback, and the boot warm-up.
- Why `generateStaticParams` returns `[]`: the build never opens the DB.
- The image cache lives at `/app/data/image-cache`. It is safe to delete, and it rebuilds lazily.
- Budget rules and how to run `npm run build && npm run perf-budget`.
- A list of things that make a route dynamic (`cookies`, `headers`, `searchParams`, `auth`, `connection`, `force-dynamic`), all forbidden in `src/app/(storefront)`.

### scripts/perf-budget.mjs

Run it after `next build`. Use plain Node with `node:zlib` gzip, and no dependencies.

1. Read `.next/prerender-manifest.json` and `.next/app-path-routes-manifest.json`. Also print `next build`'s own route table if it's easier to parse from `.next/server/app-paths-manifest.json`; choose what's reliable on Next 15.5 and document it in a comment.
2. **Static/ISR assertion.**
   - `/` must be in `routes`.
   - `/produit/[slug]`, `/l/[slug]` and `/boutique/[categorie]` must be in `dynamicRoutes`, which means ISR-capable.
   - The content pages and `/merci` must be in `routes`.
   - If any of them is missing, the route was built dynamic, so fail with a clear message naming the route.
3. **JS budget.**
   - For `/(storefront)/produit/[slug]/page` and `/(storefront)/l/[slug]/page`, collect the client JS files from `.next/app-build-manifest.json` (`pages[route]`), plus the root layout and the storefront layout entries.
   - Deduplicate, gzip each file at level 9, and sum.
   - Fail if the sum is > `PERF_BUDGET_KB` (default 120) × 1024.
   - Print a per-route table: route, files, raw KB, gz KB.
   - Also print the top 5 largest chunks, to make regressions easy to find.
4. **Forbidden imports.** Grep the client chunks of those routes for the markers `libphonenumber`, `ZodError`, `better-sqlite3` and `node:crypto`. Fail if any are found.
5. Exit code 0 on success and 1 on any failure.

If `.next` is missing, print "Lancez d'abord `npm run build`" and exit 1.

### CI

In `.github/workflows/ci.yml`, after the build step (which uses the mock provider and a non-existent DB path), add the step `- run: npm run perf-budget`.

## Acceptance Criteria

- [ ] `npm run build && npm run perf-budget` passes on the finished boilerplate and prints the per-route table.
- [ ] Adding `export const dynamic = "force-dynamic"` to the product page makes `perf-budget` fail with a message naming `/produit/[slug]`. Revert it afterwards.
- [ ] Importing `libphonenumber-js` in `buy-box.tsx` makes it fail. Revert it afterwards.
- [ ] `docs/new-niche.md` covers steps 1–11. `docs/operations.md` has the Cloudflare and cache sections.
- [ ] CI runs `perf-budget`.
- [ ] Lint and typecheck pass.

## Notes

The manual items (Cloudflare setup and PageSpeed measurements) are in `action-required.md`. This task documents them; it does not perform them.
