import { applyPacks } from "@/lib/pack-pricing";
import type { CartLine } from "@/stores/cart";

/** Client estimate only. After checkout, always show the server totals. */
export function estimateTotals(lines: CartLine[], shippingFeeMad: number, freeShippingThresholdMad: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const packsByProduct = Object.fromEntries(lines.map((l) => [l.productId, l.packs]));
  const { discount, applications } = applyPacks(
    lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })), packsByProduct);
  const net = subtotal - discount;
  const shipping = lines.length === 0 || net >= freeShippingThresholdMad ? 0 : shippingFeeMad;
  return { subtotal, discount, applications, shipping, total: net + shipping };
}
