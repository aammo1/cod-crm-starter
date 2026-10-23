import type { CommerceProduct, PublicCommerceProduct } from "@/lib/commerce-types";
import { contentTypeForStoredName, isSafeStoredName } from "@/lib/uploads";

export type StorefrontCatalogProduct = PublicCommerceProduct & { currency: "MAD" };

/** Explicit configuration only: never derive the public origin from request headers. */
export function storefrontMediaOrigin(configuredUrl: string | undefined): string {
  if (!configuredUrl) throw new Error("Origine publique non configurée.");
  const url = new URL(configuredUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Origine publique invalide.");
  }
  return url.origin;
}

/** Same local-image allowlist as catalog uploads. No remote requests or URLs. */
function publicImages(images: readonly string[], origin: string): string[] {
  return images.flatMap((image) => {
    if (image.startsWith("/api/media/")) {
      const name = image.slice("/api/media/".length);
      return isSafeStoredName(name) && contentTypeForStoredName(name)
        ? [new URL(image, origin).href] : [];
    }
    if (/^\/images\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g)$/i.test(image) &&
        !image.slice(1).split("/").some((part) => !part || part === "." || part === "..")) {
      return [new URL(image, origin).href];
    }
    return [];
  });
}

/** Pure whitelist projection; never spread internal catalog or variant records. */
export function toStorefrontCatalogProduct(product: CommerceProduct, origin: string): StorefrontCatalogProduct {
  return {
    id: product.id, slug: product.slug, name: product.name, category: product.category,
    price: product.price, currency: "MAD", description: product.description,
    ...(product.story === undefined ? {} : { story: product.story }),
    ...(product.materials === undefined ? {} : { materials: [...product.materials] }),
    ...(product.badge === undefined ? {} : { badge: product.badge }),
    isBestSeller: product.isBestSeller, active: product.active,
    packs: product.packs.map(({ id, quantity, price, label, highlight }) => ({
      id, quantity, price, ...(label === undefined ? {} : { label }), highlight,
    })),
    landingEnabled: product.landingEnabled,
    images: publicImages(product.images, origin),
    optionDefinitions: product.optionDefinitions.map(({ name, values }) => ({ name, values: [...values] })),
    variants: product.variants.filter((variant) => variant.active).map((variant) => ({
      id: variant.id, productId: product.id, sku: variant.sku, label: variant.label,
      active: true, available: variant.available > 0,
      options: variant.options.map(({ name, value }) => ({ name, value })),
      images: publicImages(variant.images, origin),
    })),
  };
}
