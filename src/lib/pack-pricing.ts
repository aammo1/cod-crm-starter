/** Browser-safe quantity-pack pricing. No server imports. */
import type { CommercePackApplication, ProductPack } from "@/lib/commerce-types";

/** Exact quantity match only, per product (summed across its variant lines). */
export function applyPacks(
  lines: { productId: string; qty: number; unitPrice: number }[],
  packsByProduct: Record<string, ProductPack[]>,
): { discount: number; applications: CommercePackApplication[] } {
  const quantities = new Map<string, { qty: number; regularPrice: number }>();
  for (const line of lines) {
    const current = quantities.get(line.productId) ?? { qty: 0, regularPrice: 0 };
    quantities.set(line.productId, { qty: current.qty + line.qty, regularPrice: current.regularPrice + line.qty * line.unitPrice });
  }
  let discount = 0;
  const applications: CommercePackApplication[] = [];
  for (const [productId, { qty, regularPrice }] of quantities) {
    const pack = packsByProduct[productId]?.find((p) => p.quantity === qty);
    if (!pack) continue;
    if (pack.price >= regularPrice) continue;
    const amount = regularPrice - pack.price;
    discount += amount;
    applications.push({ productId, packId: pack.id, quantity: qty, packPrice: pack.price, regularPrice, discount: amount });
  }
  return { discount, applications };
}
