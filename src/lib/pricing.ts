import { DEFAULT_STORE_SETTINGS, type StoreSettings } from "@/lib/store-settings-schema";

/** Compatibility defaults for copied callers; new business paths pass snapshots. */
export const SHIPPING_FEE = DEFAULT_STORE_SETTINGS.shippingFeeMad;
export const FREE_SHIPPING_THRESHOLD = DEFAULT_STORE_SETTINGS.freeShippingThresholdMad;
export const UPSELL_DISCOUNT = (100 - DEFAULT_STORE_SETTINGS.upsellDiscountPercent) / 100;

export type ShippingRules = Readonly<Pick<StoreSettings, "shippingFeeMad" | "freeShippingThresholdMad">>;
export type UpsellPricingRules = Readonly<Pick<StoreSettings, "upsellDiscountPercent">>;

function assertMadAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Le montant MAD doit être un entier positif ou nul sûr.");
  }
}

/** Use checkout's persisted rules when resolving an existing order's upsell. */
export function shippingFor(
  subtotal: number,
  rules: ShippingRules = DEFAULT_STORE_SETTINGS,
): number {
  assertMadAmount(subtotal);
  assertMadAmount(rules.shippingFeeMad);
  assertMadAmount(rules.freeShippingThresholdMad);
  return subtotal >= rules.freeShippingThresholdMad ? 0 : rules.shippingFeeMad;
}

/** Call only when creating an enabled offer; persist the result, do not reprice it. */
export function upsellPriceFor(
  price: number,
  rules: UpsellPricingRules = DEFAULT_STORE_SETTINGS,
): number {
  assertMadAmount(price);
  if (!Number.isInteger(rules.upsellDiscountPercent) ||
      rules.upsellDiscountPercent < 1 || rules.upsellDiscountPercent > 90) {
    throw new RangeError("La remise doit être un entier entre 1 et 90 %.");
  }
  const result = Math.round(price * (100 - rules.upsellDiscountPercent) / 100);
  assertMadAmount(result);
  return result;
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
  return lines.reduce((sum, line) => {
    assertMadAmount(line.price);
    if (!Number.isSafeInteger(line.qty) || line.qty < 1) {
      throw new RangeError("La quantité doit être un entier strictement positif sûr.");
    }
    const lineTotal = line.price * line.qty;
    assertMadAmount(lineTotal);
    const subtotal = sum + lineTotal;
    assertMadAmount(subtotal);
    return subtotal;
  }, 0);
}
