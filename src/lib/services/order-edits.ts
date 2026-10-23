import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getDb, hasOrderFulfillmentHistory } from "@/lib/db";
import type { CommerceOrderItem as OrderItem } from "@/lib/commerce-types";
import { orderEditSchema, type DiscountMode, type DiscountType, type ShippingMode } from "@/lib/order-edit-schema";
import { listProducts, getVariantById } from "@/lib/services/catalog";
import { getCrmOrder as getOrder } from "@/lib/services/orders";
import { MissingOrderShippingRulesError, orderLineSnapshot, orderRulesKey, orderShippingRules, replaceOrderVariant } from "@/lib/services/order-lines";
import { applyPacks } from "@/lib/pack-pricing";
import { getActivePacksFor } from "@/lib/services/packs";
import { shippingFor, type ShippingRules } from "@/lib/pricing";
import { getCityTariff } from "@/lib/services/city-tariffs";
import { availableFor } from "@/lib/services/inventory";

export class OrderEditError extends Error {
  constructor(readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "OrderEditError";
  }
}

interface Adjustment {
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  shipping_mode: ShippingMode;
  archived_at: string | null;
  pack_snapshot_json: string | null;
}

export interface OrderEditSnapshot {
  items: OrderItem[];
  upsellItems: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  shippingMode: ShippingMode;
  /** Absent on history rows written before discount modes existed. */
  discountMode?: DiscountMode;
  /** Present only when an agent explicitly applied a city fee override in this edit. */
  cityFeeMad?: number;
}

/** Shipping rules snapshot as persisted in app_state; cityFee records an applied override and the base rules it replaced. */
interface StoredRules extends ShippingRules {
  cityFee?: { cityId: number; feeMad: number; ignoresFreeThreshold: boolean; baseFeeMad: number; baseThresholdMad: number };
}

export interface CityFeeProposal {
  cityId: number; cityName: string; feeMad: number; baseFeeMad: number;
  ignoresFreeThreshold: boolean; baseThresholdMad: number; applied: boolean;
}

function baseRules(rules: StoredRules): ShippingRules {
  return rules.cityFee ? { shippingFeeMad: rules.cityFee.baseFeeMad, freeShippingThresholdMad: rules.cityFee.baseThresholdMad } : rules;
}

/** The order city's customer fee override, or null. Read server-side from city_tariffs; never client-supplied. */
export function orderCityFeeProposal(orderId: string): CityFeeProposal | null {
  const row = getDb().prepare("SELECT city_id FROM orders WHERE id = ?").get(orderId) as { city_id: number | null } | undefined;
  if (!row || row.city_id === null) return null;
  const tariff = getCityTariff(row.city_id);
  if (!tariff || tariff.customerFeeOverride === null) return null;
  let rules: StoredRules;
  try { rules = orderShippingRules(orderId) as StoredRules; } catch { return null; }
  const base = baseRules(rules);
  return {
    cityId: tariff.cityId, cityName: tariff.cityName, feeMad: tariff.customerFeeOverride, baseFeeMad: base.shippingFeeMad,
    ignoresFreeThreshold: tariff.overrideIgnoresFreeThreshold, baseThresholdMad: base.freeShippingThresholdMad,
    applied: rules.cityFee?.cityId === tariff.cityId && rules.cityFee.feeMad === tariff.customerFeeOverride
      && rules.cityFee.ignoresFreeThreshold === tariff.overrideIgnoresFreeThreshold,
  };
}

export interface OrderEditHistory {
  id: string;
  actorName: string;
  reason: string;
  createdAt: string;
  before: OrderEditSnapshot;
  after: OrderEditSnapshot;
}

function readState(orderId: string) {
  const raw = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as Adjustment | undefined;
  const order = getOrder(orderId);
  if (!raw || !order) throw new OrderEditError(404, "Commande introuvable.");
  const snapshot: OrderEditSnapshot = {
    items: order.items,
    upsellItems: order.upsellStatus === "accepted" ? order.upsellItems ?? [] : [],
    subtotal: order.subtotal, shipping: order.shipping, total: order.total,
    discountType: raw.discount_type, discountValue: raw.discount_value,
    discountAmount: raw.discount_amount, shippingMode: raw.shipping_mode,
    discountMode: raw.pack_snapshot_json ? "pack" : "manual",
  };
  const lastEdit = getDb().prepare("SELECT id FROM order_edits WHERE order_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(orderId) as { id: string } | undefined;
  return {
    revision: createHash("sha256").update(JSON.stringify([raw, lastEdit?.id ?? null])).digest("hex"),
    editable: !raw.archived_at && ["new", "no_answer", "call_back_later"].includes(order.confirmationStatus)
      && !hasOrderFulfillmentHistory(orderId),
    snapshot,
  };
}

export function getOrderEditState(orderId: string) {
  return getDb().transaction(() => readState(orderId))();
}

export function orderEditOptions() {
  return listProducts().filter((p) => p.active).flatMap((p) => p.variants.filter((v) => v.active).map((v) => ({
    variantId: v.id, productId: p.id, name: p.name, sku: v.sku,
    label: v.label, options: v.options, price: p.price, available: v.available, packs: p.packs ?? [],
  })));
}

export function listOrderEdits(orderId: string): OrderEditHistory[] {
  const rows = getDb().prepare(`SELECT id, actor_name, reason, created_at, before_json, after_json
    FROM order_edits WHERE order_id = ? ORDER BY rowid DESC`).all(orderId) as Array<{
      id: string; actor_name: string; reason: string; created_at: string; before_json: string; after_json: string;
    }>;
  return rows.map((r) => ({ id: r.id, actorName: r.actor_name, reason: r.reason, createdAt: r.created_at,
    before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) }));
}

export function editOrder(orderId: string, body: unknown, actor: { id: string; name?: string | null }) {
  const parsed = orderEditSchema.safeParse(body);
  if (!parsed.success) throw new OrderEditError(400, parsed.error.issues[0]?.message ?? "Requête invalide.");
  const input = parsed.data;
  const db = getDb();
  return db.transaction(() => {
    const before = readState(orderId);
    if (!before.editable) throw new OrderEditError(409, "Modification impossible : commande confirmée, annulée, archivée ou déjà prise en charge.");
    if (input.revision !== before.revision) throw new OrderEditError(409, "Cette commande a changé. Rechargez la page avant de la modifier.");
    const items: OrderItem[] = [];
    const upsellItems: OrderItem[] = [];
    const quantities = new Map<string, number>();
    const usedUpsells = new Set<number>();
    // Untouched variants keep the price the customer was quoted, whatever the catalog says now.
    const originalPrices = new Map<string, number>();
    for (const item of before.snapshot.items) if (!originalPrices.has(item.variant_id)) originalPrices.set(item.variant_id, item.unit_price);
    const discountMode: DiscountMode = input.discountMode ?? before.snapshot.discountMode ?? "manual";
    const beforeQty = new Map<string, number>();
    for (const item of [...before.snapshot.items, ...before.snapshot.upsellItems]) {
      beforeQty.set(item.variant_id, (beforeQty.get(item.variant_id) ?? 0) + item.quantity);
    }
    for (const line of input.lines) {
      const variant = getVariantById(line.variantId);
      if (!variant || !variant.active || !variant.productActive) throw new OrderEditError(400, "Un produit ou une variante n'est plus disponible.");
      let unitPrice = line.upsellIndex === undefined ? originalPrices.get(line.variantId) ?? variant.price : variant.price;
      if (line.upsellIndex !== undefined) {
        const original = before.snapshot.upsellItems[line.upsellIndex];
        if (!original || usedUpsells.has(line.upsellIndex) || original.product_id !== variant.productId || line.qty > original.quantity) {
          throw new OrderEditError(400, "L'offre upsell existante ne peut pas être étendue ou transférée à un autre produit.");
        }
        usedUpsells.add(line.upsellIndex);
        unitPrice = original.unit_price;
      }
      const qty = (quantities.get(line.variantId) ?? 0) + line.qty;
      quantities.set(line.variantId, qty);
      if (qty > 10) throw new OrderEditError(400, "Maximum 10 unités par variante, toutes lignes confondues.");
      // Only added/increased quantity needs stock: unchanged lines on a sold-out
      // variant must not block discount/shipping edits (confirmation gates stock).
      if (qty > (beforeQty.get(line.variantId) ?? 0) && availableFor(line.variantId) < qty) throw new OrderEditError(409, `Stock insuffisant : ${variant.product.name} — ${variant.label}.`);
      const original = line.upsellIndex === undefined ? null : before.snapshot.upsellItems[line.upsellIndex];
      const item: OrderItem = original
        ? { ...replaceOrderVariant(original, variant), quantity: line.qty, line_total: unitPrice * line.qty }
        : orderLineSnapshot(variant, variant.product.name, unitPrice, line.qty);
      (line.upsellIndex === undefined ? items : upsellItems).push(item);
    }
    const regularSubtotal = items.reduce((sum, i) => sum + i.line_total, 0);
    let discountType: DiscountType = input.discountType;
    let discountValue = input.discountValue;
    let packSnapshot: string | null = null;
    let discountAmount = 0;
    if (discountMode === "pack") {
      // Packs come only from the persisted table; any client discount is ignored.
      const productIds = [...new Set(items.map((i) => i.product_id))];
      const { discount, applications } = applyPacks(
        items.map((i) => ({ productId: i.product_id, qty: i.quantity, unitPrice: i.unit_price })),
        getActivePacksFor(productIds, db),
      );
      discountType = discount > 0 ? "fixed" : "none";
      discountValue = discount; discountAmount = discount;
      packSnapshot = discount > 0 ? JSON.stringify(applications) : null;
    } else if (input.discountType === "fixed" && input.discountValue > regularSubtotal) {
      throw new OrderEditError(400, "La remise ne peut pas dépasser le montant des articles hors upsell.");
    }
    const subtotal = regularSubtotal + upsellItems.reduce((sum, i) => sum + i.line_total, 0);
    if (discountMode === "manual") {
      discountAmount = input.discountType === "percent" ? Math.round(regularSubtotal * input.discountValue / 100)
        : input.discountType === "fixed" ? input.discountValue : 0;
    }
    const storedRules = (() => {
      try { return orderShippingRules(orderId) as StoredRules; }
      catch (error) {
        if (error instanceof MissingOrderShippingRulesError) throw new OrderEditError(409, error.message);
        throw error;
      }
    })();
    let rules: ShippingRules = storedRules;
    let rulesToPersist: StoredRules | null = null;
    let cityFeeMad: number | undefined;
    if (input.applyCityFee) {
      // Explicit agent action only; the fee comes from the server-side tariff.
      const proposal = orderCityFeeProposal(orderId);
      if (!proposal) throw new OrderEditError(400, "Aucun frais spécifique pour la ville de cette commande.");
      const base = baseRules(storedRules);
      rules = { shippingFeeMad: proposal.feeMad,
        freeShippingThresholdMad: proposal.ignoresFreeThreshold ? Number.MAX_SAFE_INTEGER : base.freeShippingThresholdMad };
      rulesToPersist = { ...rules, cityFee: { cityId: proposal.cityId, feeMad: proposal.feeMad,
        ignoresFreeThreshold: proposal.ignoresFreeThreshold, baseFeeMad: base.shippingFeeMad, baseThresholdMad: base.freeShippingThresholdMad } };
      cityFeeMad = proposal.feeMad;
    }
    const shipping = input.shippingMode === "free" ? 0 : input.shippingMode === "paid" ? rules.shippingFeeMad
      : shippingFor(subtotal - discountAmount, rules);
    const totals = { subtotal, discountAmount, shipping, total: subtotal - discountAmount + shipping };
    const after: OrderEditSnapshot = { items, upsellItems, ...totals, discountType,
      discountValue, shippingMode: input.shippingMode, discountMode: packSnapshot ? "pack" : "manual",
      ...(cityFeeMad !== undefined ? { cityFeeMad } : {}) };
    const now = new Date().toISOString();
    // Close together with the final lines/totals so the Meta trigger freezes
    // this audited revision, never the pre-edit pending order.
    db.prepare(`UPDATE orders SET items_json = ?, upsell_items_json = ?, upsell_status = ?,
      subtotal = ?, shipping = ?, total = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
      shipping_mode = ?, pack_snapshot_json = ?, updated_at = ? WHERE id = ?`).run(
      JSON.stringify(items), upsellItems.length ? JSON.stringify(upsellItems) : null,
      upsellItems.length ? "accepted" : "declined", totals.subtotal, totals.shipping, totals.total,
      discountType, discountValue, totals.discountAmount, input.shippingMode, packSnapshot, now, orderId,
    );
    if (rulesToPersist) {
      db.prepare(`INSERT INTO app_state (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(orderRulesKey(orderId), JSON.stringify(rulesToPersist));
    }
    db.prepare(`INSERT INTO order_edits (id, order_id, actor_id, actor_name, reason, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(`oed_${nanoid(12)}`, orderId, actor.id, actor.name ?? actor.id,
      input.reason, JSON.stringify(before.snapshot), JSON.stringify(after), now);
    return readState(orderId);
  }).immediate();
}
