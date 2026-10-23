import type { MetadataRoute } from "next";
import { storeConfig } from "@/config";
import { getCatalog } from "@/lib/storefront/data";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = storeConfig.domain.replace(/\/+$/, "");
  const catalog = await getCatalog();
  const urls = [
    "/",
    "/boutique",
    ...storeConfig.nav.categories.map((c) => `/boutique/${c.slug}`),
    ...catalog.map((p) => `/produit/${p.slug}`),
    ...(storeConfig.landing.index ? catalog.filter((p) => p.landingEnabled).map((p) => `/l/${p.slug}`) : []),
  ];
  return urls.map((u) => ({ url: u === "/" ? `${base}/` : `${base}${u}` }));
}
