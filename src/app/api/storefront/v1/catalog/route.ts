import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getProductById } from "@/lib/services/catalog";
import { getPublicStoreSettings } from "@/lib/services/store-settings";
import { requireStorefrontApi, storefrontError } from "@/lib/storefront-auth";
import { storefrontMediaOrigin, toStorefrontCatalogProduct } from "@/lib/storefront-catalog-dto";
import type { StorefrontCatalogResponse } from "@/lib/commerce-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = requireStorefrontApi(request);
  if (!auth.ok) return auth.response;

  const query = new URL(request.url).searchParams;
  const cursor = query.get("cursor");
  const rawLimit = query.get("limit");
  if (query.getAll("cursor").length > 1 || query.getAll("limit").length > 1 ||
      (cursor !== null && !/^[A-Za-z0-9_-]{1,200}$/.test(cursor)) ||
      (rawLimit !== null && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(rawLimit))) {
    return storefrontError("INVALID_REQUEST", "Paramètres de pagination invalides.", 400);
  }
  const limit = rawLimit === null ? 50 : Number(rawLimit);

  try {
    const origin = storefrontMediaOrigin(process.env.CRM_PUBLIC_URL);
    const db = getDb();
    // SQL keyset pagination reads at most one page plus a lookahead ID. Hydrate
    // only the selected page; do not call the unbounded listProducts service.
    const response: StorefrontCatalogResponse = db.transaction(() => {
      const rows = (cursor === null
        ? db.prepare("SELECT id FROM products WHERE active = 1 ORDER BY id LIMIT ?").all(limit + 1)
        : db.prepare("SELECT id FROM products WHERE active = 1 AND id > ? ORDER BY id LIMIT ?").all(cursor, limit + 1)
      ) as { id: string }[];
      const page = rows.slice(0, limit);
      return {
        products: page.map(({ id }) => {
          const product = getProductById(id);
          if (!product?.active) throw new Error("Catalogue indisponible.");
          return toStorefrontCatalogProduct(product, origin);
        }),
        nextCursor: rows.length > limit ? page[page.length - 1].id : null,
        settings: getPublicStoreSettings(),
      };
    })();
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return storefrontError("CATALOG_UNAVAILABLE", "Le catalogue est momentanément indisponible.", 503);
  }
}
