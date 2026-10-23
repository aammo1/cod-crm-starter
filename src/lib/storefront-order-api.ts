import "server-only";
import { getDb } from "@/lib/db";
import { getProductById, getVariantById, listProducts } from "@/lib/services/catalog";
import { getActivePacksFor } from "@/lib/services/packs";
import { createStorefrontOrderService, StorefrontOrderError } from "@/lib/services/storefront-orders";
import { consumeStorefrontNewOrderPhoneBudget } from "@/lib/services/security-budgets";
import { storefrontError } from "@/lib/storefront-auth";
import { storefrontMediaOrigin, toStorefrontCatalogProduct } from "@/lib/storefront-catalog-dto";
import type { CommerceProduct } from "@/lib/commerce-types";

export class PhoneQuotaError extends StorefrontOrderError {
  constructor(readonly retryAfter: number) {
    super(429, "RATE_LIMITED", "Réessayez dans quelques instants.");
  }
}

export function storefrontOrderService() {
  // Catalog services and budgets use this same process-local SQLite connection.
  // Canonicalize images inside catalog reads, before the immutable offer/receipt
  // is saved. Replays never re-read origin configuration or mutable catalog data.
  const canonicalProduct = (product: CommerceProduct | null): CommerceProduct | null => product ? {
    ...product,
    images: toStorefrontCatalogProduct(product, storefrontMediaOrigin(process.env.CRM_PUBLIC_URL)).images,
  } : null;
  return createStorefrontOrderService({
    db: getDb(),
    catalog: {
      getVariantById(id) {
        const variant = getVariantById(id);
        return variant ? { ...variant, productName: variant.product.name } : null;
      },
      getActivePacks: (productIds) => getActivePacksFor(productIds, getDb()),
      getProductById: (id) => canonicalProduct(getProductById(id)),
      listUpsellCandidates: () => listProducts().filter((product) => product.isBestSeller)
        .map((product) => canonicalProduct(product)!),
    },
    checkNewOrderQuota(phone, db) {
      if (db !== getDb() || !db.inTransaction) throw new Error("Transaction requise.");
      const retry = consumeStorefrontNewOrderPhoneBudget(phone);
      if (retry) throw new PhoneQuotaError(retry);
    },
  });
}

export function storefrontOrderApiError(error: unknown) {
  if (error instanceof StorefrontOrderError) {
    // Token failures share one response for existing/nonexisting order IDs.
    if (error.code === "INVALID_ORDER_TOKEN" || error.code === "ORDER_NOT_FOUND") {
      return storefrontError("INVALID_ORDER_TOKEN", "Jeton de commande invalide.", 401);
    }
    if (error.code === "INVALID_VARIANT") {
      return storefrontError(error.code, "Une variante est indisponible.", 404);
    }
    return storefrontError(error.code, error.message, error.status,
      error instanceof PhoneQuotaError ? error.retryAfter : error.status === 503 ? 1 : undefined);
  }
  // Auth budgets may encounter contention before the commerce transaction.
  return storefrontError("SERVICE_UNAVAILABLE", "Service momentanément indisponible. Réessayez avec la même clé.", 503, 1);
}
