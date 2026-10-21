import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { listStorefront, variantFor, type StorefrontProductView } from "@/lib/services/catalog";
import { createOrder, type OrderItem, type UpsellOfferJson } from "@/lib/db";
import { shippingFor, upsellPriceFor } from "@/lib/pricing";
import { normalizeMaPhone } from "@/lib/phone";
import { createOrderSchema } from "@/lib/api-schemas";
import { purchaseFor, requestMetaContext } from "@/lib/services/meta";
import { readLimitedJson, RequestBodyError } from "@/lib/request-body";
import { budgetKey, consumeBudgets, publicRequestBudget } from "@/lib/services/security-budgets";

export const runtime = "nodejs";

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

/**
 * (a) first item's upsellRef if it exists, has stock and is not in the cart,
 * else (b) first best-seller with stock not in the cart.
 * Soft gate: availability is never rejected — only existence is validated.
 */
function pickUpsellCandidate(
  firstProduct: StorefrontProductView,
  storefront: StorefrontProductView[],
  byId: Map<string, StorefrontProductView>,
  cartIds: Set<string>
): StorefrontProductView | null {
  const ref = firstProduct.upsellRef;
  if (ref) {
    const refProduct = byId.get(ref);
    if (refProduct && refProduct.anyAvailable && !cartIds.has(refProduct.id)) {
      return refProduct;
    }
  }
  return (
    storefront.find(
      (p) => p.isBestSeller && p.anyAvailable && !cartIds.has(p.id)
    ) ?? null
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const retry = publicRequestBudget(request, "checkout");
  if (retry) return NextResponse.json({ error: "Réessayez dans quelques instants." }, {
    status: 429, headers: { "Retry-After": String(retry) },
  });
  let body: unknown;
  try {
    body = await readLimitedJson(request, 32_768);
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return badRequest("Requête invalide");
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Requête invalide");
  }

  const phone = normalizeMaPhone(parsed.data.customer.phone) ?? parsed.data.customer.phone;
  const phoneRetry = consumeBudgets([{ key: budgetKey("checkout:phone", phone), limit: 5, windowMs: 600_000 }]);
  if (phoneRetry) return NextResponse.json({ error: "Réessayez dans quelques instants." }, {
    status: 429, headers: { "Retry-After": String(phoneRetry) },
  });

  const storefront = listStorefront();
  const byId = new Map(storefront.map((product) => [product.id, product]));
  const cartIds = new Set(parsed.data.items.map((line) => line.productId));

  const items: OrderItem[] = [];
  const resolvedProducts: StorefrontProductView[] = [];
  for (const line of parsed.data.items) {
    const product = byId.get(line.productId);
    if (!product) return badRequest("Produit indisponible");
    if (!product.colors.some((color) => color.name === line.color)) {
      return badRequest(`Couleur non disponible pour ${product.name}`);
    }
    // Soft gate: the variant must EXIST (product + color + size, active) —
    // zero availability is accepted, the agent resolves it on the call.
    if (!variantFor(line.productId, line.color, line.size)) {
      return badRequest(`Taille non disponible pour ${product.name}`);
    }
    resolvedProducts.push(product);
    items.push({
      product_id: product.id,
      name: product.name,
      color: line.color,
      size: line.size,
      quantity: line.qty,
      unit_price: product.price,
      line_total: product.price * line.qty,
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const shipping = shippingFor(subtotal);
  const total = subtotal + shipping;

  const firstProduct = resolvedProducts[0];
  const candidate = firstProduct
    ? pickUpsellCandidate(firstProduct, storefront, byId, cartIds)
    : null;
  const upsellOffer: UpsellOfferJson | null = candidate
    ? {
        product_id: candidate.id,
        name: candidate.name,
        original_price: candidate.price,
        upsell_price: upsellPriceFor(candidate.price),
      }
    : null;

  const id = `ord_${nanoid(12)}`;

  let row;
  try {
    row = createOrder(
      {
        id,
        meta: requestMetaContext(request, parsed.data.meta),
        customerName: parsed.data.customer.name,
        customerPhone: phone,
        items,
        upsellOffer,
        subtotal,
        shipping,
        total,
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement de la commande" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      orderId: row.id,
      purchase: purchaseFor(row.id),
      upsellOffer: candidate
        ? {
            productId: candidate.id,
            name: candidate.name,
            image: candidate.colors[0]?.images[0] ?? "",
            originalPrice: candidate.price,
            upsellPrice: upsellPriceFor(candidate.price),
          }
        : null,
      totals: { itemsSubtotal: subtotal, shipping, total },
    },
    { status: 201 }
  );
}
