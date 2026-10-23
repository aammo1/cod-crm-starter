import type { CommercePackApplication, ProductPack } from "@/lib/commerce-types";
import { applyPacks } from "@/lib/pack-pricing";
import { shippingFor, type ShippingRules } from "@/lib/pricing";

export interface PricedOrder {
  subtotal: number;
  discount: number;
  applications: CommercePackApplication[];
  shipping: number;
  total: number;
}

/**
 * Server-authoritative pricing shared with checkout semantics: lines stay at the
 * regular unit price, the pack saving is the order-level fixed discount, and
 * shipping is computed on the discounted subtotal.
 *
 * Manual orders carry no agent discount, so packs always apply. If an explicit
 * agent discount is ever added to the manual schema it takes precedence and
 * packs must NOT be stacked on top of it (pass `packsByProduct = {}`).
 */
export function priceOrderLines(
  lines: { productId: string; qty: number; unitPrice: number }[],
  packsByProduct: Record<string, ProductPack[]>,
  rules: ShippingRules,
): PricedOrder {
  const subtotal = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  const { discount, applications } = applyPacks(lines, packsByProduct);
  const shipping = shippingFor(subtotal - discount, rules);
  return { subtotal, discount, applications, shipping, total: subtotal - discount + shipping };
}
