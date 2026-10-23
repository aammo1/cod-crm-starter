import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { listStorefront, type StorefrontProductView } from "@/lib/services/catalog";
import { getPublicStoreSettings } from "@/lib/services/store-settings";
import {
  DEFAULT_STORE_SETTINGS,
  STORE_CURRENCY,
  type PublicStoreSettings,
} from "@/lib/store-settings-schema";

/*
 * The only data access path for storefront pages.
 *
 * The build must never open SQLite, so loaders return empty data during
 * `phase-production-build`. Product and landing routes therefore use
 * `generateStaticParams() { return [] }`, `dynamicParams = true` and
 * `revalidate = 300`: they render on first request, are cached as ISR and are
 * invalidated by `revalidateStorefront()` (tag `storefront`). Statically
 * prerendered routes (e.g. `/`) are invalidated once by the boot warm-up.
 * One cached list means one DB hydration per invalidation.
 */

import { STOREFRONT_TAG } from "./tag";
export { STOREFRONT_TAG };
const isBuild = () => process.env.NEXT_PHASE === "phase-production-build";
const opts = { tags: [STOREFRONT_TAG], revalidate: 300 };

const cachedCatalog = unstable_cache(async () => listStorefront(), ["storefront-catalog-v1"], opts);
const cachedSettings = unstable_cache(
  async () => getPublicStoreSettings(),
  ["storefront-settings-v1"],
  opts,
);

const BUILD_SETTINGS: PublicStoreSettings = {
  storeName: DEFAULT_STORE_SETTINGS.storeName,
  currency: STORE_CURRENCY,
  shippingFeeMad: DEFAULT_STORE_SETTINGS.shippingFeeMad,
  freeShippingThresholdMad: DEFAULT_STORE_SETTINGS.freeShippingThresholdMad,
};

/** All active storefront products in listStorefront order. Empty during build. */
export const getCatalog = cache(async (): Promise<StorefrontProductView[]> =>
  isBuild() ? [] : cachedCatalog(),
);

export const getProduct = cache(async (slug: string): Promise<StorefrontProductView | null> => {
  if (isBuild()) return null;
  return (await getCatalog()).find((p) => p.slug === slug) ?? null;
});

export const getCategory = cache(async (category: string): Promise<StorefrontProductView[]> =>
  (await getCatalog()).filter((p) => p.category === category),
);

export const getBestSellers = cache(async (limit = 8): Promise<StorefrontProductView[]> =>
  (await getCatalog()).filter((p) => p.isBestSeller).slice(0, limit),
);

export const getCrossSells = cache(
  async (excludeKey: string, limit = 4): Promise<StorefrontProductView[]> => {
    const exclude = excludeKey ? excludeKey.split(",") : [];
    return (await getCatalog())
      .filter((p) => !exclude.includes(p.id) && p.variants.some((v) => v.available))
      .slice(0, limit);
  },
);

export const getShopSettings = cache(async (): Promise<PublicStoreSettings> =>
  isBuild() ? BUILD_SETTINGS : cachedSettings(),
);
