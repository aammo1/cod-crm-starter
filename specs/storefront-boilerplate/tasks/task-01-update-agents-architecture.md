# Task 01: Update AGENTS.md and README for the in-repo storefront

## Status

complete

## Wave

1

## Description

`AGENTS.md` currently says this template is "CRM-only" and that storefronts live in separate repos. The owner has decided to run **one app per niche** instead: the existing CRM plus a fast, config-driven storefront in the same Next.js app and SQLite DB. Every later task's coder agent reads `AGENTS.md` first. If it still says CRM-only, agents will refuse to build the storefront or will build it wrongly. This task rewrites the architecture and boundary sections so they match the new design, while keeping every CRM invariant.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-15-docs-and-perf-budget.md

**Context from dependencies:** None.

## Files to Create

- None

## Files to Modify

- `AGENTS.md`: rewrite the intro, "Ownership and integration boundaries" and the parts of "Invariants" listed below.
- `README.md`: update the one-paragraph description and the quick-start so they mention the storefront and `npm run new-store`. Keep the rest.

## Technical Details

### Implementation Steps

1. **Intro.** Replace "CRM-only, single-store Moroccan COD template" with:
   "Single-store Moroccan COD template: storefront + CRM in one Next.js app and one SQLite DB, one copy per niche. Storefront locale is `fr` or `ar` (RTL) from `store.config.ts`; CRM UI is always French; prices integer MAD." Keep the sentence that each generated store owns its repo, deployment, SQLite, media, users, stock and secrets, with no multi-tenancy.
2. **Spec references.** Add `specs/storefront-boilerplate/requirements.md` next to the existing spec reference.
3. **Ownership and integration boundaries.** Add these bullets. Keep all existing bullets; the v1 API is still supported for external storefronts.
   - `store.config.ts` (repo root) + `src/config/`: the single source of per-niche branding, copy, locale, nav, pixel IDs and custom-section mapping. Validated with zod at import, so an invalid config fails the build. `src/config/i18n.ts` holds the fixed UI strings for fr and ar.
   - `src/app/(storefront)/`: public pages. They read data **only** via `src/lib/storefront/data.ts` (cached loaders tagged `storefront`). They never call `cookies()`, `headers()`, `auth()` or `connection()`, and never import `@/lib/db` or services directly.
   - `src/lib/storefront/revalidate.ts`: `revalidateStorefront()` must be called by every route that changes catalog, prices, packs, settings or availability (admin products, stock, catalog-agent, settings, confirm, cancel, returns inspect, order edit).
   - `src/app/api/store/`: same-origin browser checkout and upsell. These routes call the order service in-process and are protected by origin checks, budgets and an httpOnly order cookie.
   - `src/components/storefront/`: storefront UI. Funnel overlays are loaded with `next/dynamic` only when they are opened.
   - `src/custom/`: hand-made per-product marketing sections registered in `src/custom/index.ts` and mapped by slug in `store.config.ts`.
   - `scripts/new-store.mjs`: the new-niche wizard.
4. **Replace the paragraph** "The CRM owns catalog IDs… Never import CRM database/services into a storefront…" with:
   "The CRM owns catalog IDs/SKUs, variants, images, prices, packs, shipping, offers, stock and orders. The in-repo storefront owns presentation, cart and customer interaction. It reads the catalog only through the cached storefront loaders and places orders only through `/api/store/*`. External storefronts (optional) still use v1 from their server and must never import CRM DB/services. Never trust a client price or send one in checkout. Keep secrets in runtime server env, never `NEXT_PUBLIC_*`. Pixel IDs are public and live in `store.config.ts`; access tokens are env-only."
5. **Invariants.**
   - Replace "Discount pricing belongs only to upsell" with: "Discount pricing comes only from (a) the upsell (stored rules/offer/deadline) and (b) product quantity packs, which the server applies automatically from the persisted pack table and snapshots onto the order. Never accept a pack price or discount from the client."
   - Replace "All visible copy French" with: "CRM/admin copy French. Storefront copy comes from `store.config.ts` and `src/config/i18n.ts` in the configured locale (fr or ar)."
   - Add: "The build never opens SQLite. Storefront loaders return empty data during `NEXT_PHASE=phase-production-build`, and a boot warm-up revalidates after start."
   - Add: "Storefront client bundles must not include zod, libphonenumber-js, DB or service modules. First-load JS budget is ≤ 120 KB gzipped on product and landing pages (`scripts/perf-budget.mjs`)."
   - Add: "Reference code may be read from the zehri and hellobaby repos for porting; never read their env/data/DB and never modify them."
6. **Ready prompt for a storefront coding agent.** Keep it, but add above it: "Only for an optional external storefront; the default is the in-repo storefront."
7. **Commands.** Add `npm run new-store` (wizard, task 10) and `npm run perf-budget` (after build, task 15). Mark both "(added by specs/storefront-boilerplate)" so it is clear they may not exist yet.
8. **README.md.** Change the description to "Storefront + CRM boilerplate for Moroccan COD niches". Add a 5-line quick start: use the template, run `npm install`, run `npm run new-store`, run `npm run dev`, then add products at `/admin`.

## Acceptance Criteria

- [ ] `AGENTS.md` no longer says "CRM-only" and explicitly allows the in-repo storefront under `src/app/(storefront)/`.
- [ ] Every original CRM invariant is still present, except the two that were deliberately rewritten (discount/packs, French copy).
- [ ] The new rules (no DB at build, no dynamic APIs in storefront pages, `revalidateStorefront`, the bundle budget, pixel IDs in config and tokens in env) are present.
- [ ] `README.md` mentions the storefront and the new-store quick start.

## Notes

This is documentation only. Do not change code.
