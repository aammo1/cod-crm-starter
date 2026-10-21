import type { CommerceOrderItem, CommerceVariant } from "@/lib/commerce-types";
import { getDb } from "@/lib/db";
import { DEFAULT_STORE_SETTINGS } from "@/lib/store-settings-schema";
import type { ShippingRules } from "@/lib/pricing";

/** Routine confirmation preserves snapshots; explicit replacements refresh only variant data. */
export function replaceOrderVariant(item: CommerceOrderItem, variant: CommerceVariant): CommerceOrderItem {
  if (item.variant_id === variant.id) return item;
  return { ...item, variant_id: variant.id, sku: variant.sku,
    variant_label: variant.label, options: variant.options.map((option) => ({ ...option })) };
}

export function orderLineSnapshot(variant: CommerceVariant, name: string, price: number, quantity: number): CommerceOrderItem {
  return { product_id: variant.productId, variant_id: variant.id, sku: variant.sku,
    name, variant_label: variant.label, options: variant.options.map((option) => ({ ...option })),
    quantity, unit_price: price, line_total: price * quantity };
}

export const orderRulesKey = (id: string) => `order-shipping-rules:${id}`;

export class MissingOrderShippingRulesError extends Error {}

export function orderShippingRules(orderId: string): ShippingRules {
  const db = getDb();
  const saved = db.prepare("SELECT value FROM app_state WHERE key = ?").get(orderRulesKey(orderId)) as { value: string } | undefined;
  if (saved) return JSON.parse(saved.value) as ShippingRules;
  const order = db.prepare("SELECT upsell_offer_json, order_token_nonce FROM orders WHERE id = ?").get(orderId) as {
    upsell_offer_json: string | null; order_token_nonce: string | null;
  };
  const offer = order.upsell_offer_json ? JSON.parse(order.upsell_offer_json) as { rules?: ShippingRules } : null;
  // Older orders may only have an offer snapshot. Never consult current
  // settings to silently reprice an order whose historical rules are missing.
  if (offer?.rules) return offer.rules;
  if (order.order_token_nonce) throw new MissingOrderShippingRulesError("Règles de livraison historiques absentes : modification impossible avant réconciliation.");
  return DEFAULT_STORE_SETTINGS;
}
