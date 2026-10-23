# Task 03: Cached storefront loaders, revalidation and boot warm-up

## Status

complete

## Wave

1

## Description

This task is the core speed fix. zehri is slow because every catalog page is `force-dynamic` and re-runs SQLite catalog hydration (1 + 2N queries, about 3 times per product view) on every visit. Here we create the **only** data access path for storefront pages: loaders wrapped in `unstable_cache` with the tag `storefront`. Combined with route-level ISR (tasks 13/14), pages render once and are then served from cache. Any CRM action that changes catalog, prices, packs, settings or availability calls `revalidateStorefront()`, so the next visitor gets fresh HTML.

Two constraints shape the design:
1. **The build must never open SQLite.** The Dockerfile builds with a non-existent `DB_PATH` and asserts the file was not created.
2. Pages prerendered at build time (for example `/`) would therefore contain an empty catalog. A boot warm-up therefore invalidates the cache right after the server starts.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-08-storefront-checkout-api.md, task-09-admin-packs-editor.md, task-12-storefront-shell.md (and indirectly 13/14)

**Context from dependencies:** None. Task 04 (same wave) adds `packs` to the product DTO and a `landingEnabled` flag. Write the loaders against `StorefrontProductView` from `@/lib/services/catalog` so the new fields flow through automatically. Do not hand-pick fields.

## Files to Create

- `src/lib/storefront/data.ts`: cached loaders (server-only).
- `src/lib/storefront/revalidate.ts`: `revalidateStorefront()`.
- `src/app/api/internal/warmup/route.ts`: authenticated invalidation endpoint for the boot warm-up.
- `src/lib/storefront/warmup.ts`: the function that calls the endpoint after boot.

## Files to Modify

Replace every `revalidatePath("/", "layout")` with `revalidateStorefront()`, and add the call where it is missing, after a **successful** mutation in:
- `src/app/api/admin/products/route.ts`, `src/app/api/admin/products/[id]/route.ts`, `.../[id]/archive/route.ts`, `.../[id]/restore/route.ts`
- `src/app/api/crm/stock/adjust/route.ts`, `stock/opening/route.ts`, `stock/batch/route.ts`
- `src/app/api/catalog-agent/route.ts` (and `catalog-agent/upload/route.ts` only if it changes product images)
- `src/app/api/crm/settings/route.ts` (shipping, free-shipping threshold and upsell settings affect the storefront)
- `src/app/api/crm/orders/[id]/confirm/route.ts` (reserves stock, so availability changes)
- `src/app/api/crm/orders/[id]/cancel/route.ts` (may release a reservation)
- `src/app/api/crm/orders/[id]/edit/route.ts` and `src/app/api/crm/orders/[id]/lines/route.ts` (may change reservations)
- `src/app/api/crm/returns/[id]/inspect/route.ts` (sellable returns add stock)
- `src/app/api/crm/products/[id]/variants/route.ts` (variant changes)
- `src/instrumentation.ts`: after `startWorkers()`, call `scheduleStorefrontWarmup()`.

## Technical Details

### src/lib/storefront/data.ts

```ts
import "server-only";
import { unstable_cache } from "next/cache";
import { listStorefront, getStorefrontProduct, type StorefrontProductView } from "@/lib/services/catalog";
import { getPublicStoreSettings } from "@/lib/services/store-settings";

export const STOREFRONT_TAG = "storefront";
const isBuild = () => process.env.NEXT_PHASE === "phase-production-build";
const opts = { tags: [STOREFRONT_TAG], revalidate: 300 };

const cachedCatalog = unstable_cache(async () => listStorefront(), ["storefront-catalog-v1"], opts);
const cachedSettings = unstable_cache(async () => getPublicStoreSettings(/* check its signature */), ["storefront-settings-v1"], opts);

/** All active storefront products, display order as listStorefront returns. Empty during build. */
export async function getCatalog(): Promise<StorefrontProductView[]> {
  return isBuild() ? [] : cachedCatalog();
}
export async function getProduct(slug: string) {
  if (isBuild()) return null;
  return (await cachedCatalog()).find((p) => p.slug === slug) ?? null;   // one cached list, no per-slug queries
}
export async function getCategory(category: string) { return (await getCatalog()).filter((p) => p.category === category); }
export async function getBestSellers(limit = 8) { return (await getCatalog()).filter((p) => p.isBestSeller).slice(0, limit); }
export async function getCrossSells(excludeIds: string[], limit = 4) {
  return (await getCatalog()).filter((p) => !excludeIds.includes(p.id) && p.variants.some((v) => v.available)).slice(0, limit);
}
export async function getShopSettings() { return isBuild() ? DEFAULTS_FROM_SCHEMA : cachedSettings(); }
```

- Read `src/lib/services/catalog.ts` and `src/lib/services/store-settings.ts` for the exact exported names and signatures (`listStorefront`, `getStorefrontProduct`, `toStorefrontProductView`, `getPublicStoreSettings`). Adapt to them. If `getStorefrontProduct(slug)` is cheaper than filtering, you may use it via its own `unstable_cache` keyed by slug. Filtering the single cached list is preferred: one DB hydration per invalidation.
- Results must be JSON-serialisable. `unstable_cache` serialises, and `StorefrontProductView` should already be plain data. Verify this.
- The public DTO exposes `available: boolean` per variant, never exact balances (existing rule).
- During build, return `[]`, `null` and the defaults from `DEFAULT_STORE_SETTINGS` mapped to the public settings shape, without importing `@/lib/db`. `getStoreSettings()` would open the DB, so do not call it during build.
- Also wrap the exported loaders in React `cache()` so one render calls each one at most once. Example: `export const getCatalog = cache(async () => …)`.

### src/lib/storefront/revalidate.ts

```ts
import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { STOREFRONT_TAG } from "./data";

/** Call after any successful mutation that can change what shoppers see. Cheap and idempotent. */
export function revalidateStorefront(): void {
  revalidateTag(STOREFRONT_TAG);
  revalidatePath("/", "layout");   // also drops ISR HTML/RSC for every storefront route
}
```

Call it **after** the mutation commits and **before** returning the response. Never call it inside a DB transaction. If a route has several success branches, call it in each one, or once after the shared success point.

### Boot warm-up

The problem: `/` (and any other static storefront route without params) is prerendered during build with an empty catalog. After the server starts, it must be invalidated once.

- `src/app/api/internal/warmup/route.ts`:
  - `POST` only, `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
  - Require the header `x-warmup-token` to equal `hmacSha256Hex(AUTH_SECRET, "storefront-warmup:v1")`. Compare with `crypto.timingSafeEqual`. Return 404 on mismatch or when `AUTH_SECRET` is unset, so the endpoint is not advertised.
  - On success, call `revalidateStorefront()` and return 204.
  - Middleware does not match `/api/internal`. Keep it that way; this route does its own auth.
- `src/lib/storefront/warmup.ts`: `scheduleStorefrontWarmup()`.
  - Only when `NEXT_RUNTIME === "nodejs"` and `process.env.NODE_ENV === "production"`.
  - Use `setTimeout(…, 2000)`. Then `fetch(\`http://127.0.0.1:${process.env.PORT ?? 3000}/api/internal/warmup\`, { method: "POST", headers: { "x-warmup-token": token } })`.
  - Then GET `/` and `/boutique` on the same loopback origin, so the first real visitor gets a cache hit.
  - Retry up to 5 times with a 2 s backoff if the server isn't listening yet.
  - Log one line on success (`[storefront] warm-up ok`) and on final failure. Never throw.
  - The network-block preload used in tests permits loopback, so this is safe.
- Guard it with a `globalThis.__storefrontWarmupScheduled` flag, like `startWorkers` does.

### Why not generateStaticParams with DB data?

Because the build must not open the DB. Product and landing routes (tasks 13/14) use `generateStaticParams() { return [] }` with `dynamicParams = true` and `revalidate = 300`. They render on first request, are cached as ISR, and are invalidated by `revalidateStorefront()`. Document this in a short comment at the top of `data.ts`.

## Acceptance Criteria

- [ ] `DELIVERY_PROVIDER=mock DB_PATH=/tmp/crm-build-must-not-exist/crm.db npm run build` succeeds, and `/tmp/crm-build-must-not-exist` does not exist afterwards.
- [ ] Repository grep: no `revalidatePath("/", "layout")` remains outside `src/lib/storefront/revalidate.ts`. Every listed route calls `revalidateStorefront()` on success.
- [ ] `POST /api/internal/warmup` without the token returns 404. With the correct token it returns 204.
- [ ] After `npm run start`, the log shows `[storefront] warm-up ok` within about 10 s.
- [ ] `src/lib/storefront/data.ts` and `revalidate.ts` start with `import "server-only"`.
- [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` pass.

## Notes

- The workers (submission and tracking pollers) run outside a request context. Do not call `revalidateTag` from them; the 300 s fallback covers worker-driven changes. Tracking never changes stock automatically anyway.
- `revalidatePath("/", "layout")` also invalidates CRM routes. They are dynamic, so this is harmless.
