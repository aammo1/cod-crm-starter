export const SHIPPING_FEE = 29;
export const FREE_SHIPPING_THRESHOLD = 400;
export const UPSELL_DISCOUNT = 0.7;

export function shippingFor(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

export function upsellPriceFor(price: number): number {
  return Math.round(price * UPSELL_DISCOUNT);
}

export function formatMad(n: number): string {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Client-side display subtotal from cart lines (snapshot prices taken at add-to-cart time). Server NEVER trusts these. */
export function getCartSubtotal(lines: { price: number; qty: number }[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}
