import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getProductBySlug } from "@/lib/services/catalog";
import { requireStorefrontApi, storefrontError } from "@/lib/storefront-auth";
import { storefrontMediaOrigin, toStorefrontCatalogProduct } from "@/lib/storefront-catalog-dto";
import type { StorefrontProductResponse } from "@/lib/commerce-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = requireStorefrontApi(request);
  if (!auth.ok) return auth.response;

  const { slug } = await context.params;
  if (slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return storefrontError("NOT_FOUND", "Produit introuvable.", 404);
  }
  try {
    const product = getDb().transaction(() => getProductBySlug(slug))();
    if (!product?.active) return storefrontError("NOT_FOUND", "Produit introuvable.", 404);
    const response: StorefrontProductResponse = {
      product: toStorefrontCatalogProduct(product, storefrontMediaOrigin(process.env.CRM_PUBLIC_URL)),
    };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return storefrontError("CATALOG_UNAVAILABLE", "Le catalogue est momentanément indisponible.", 503);
  }
}
