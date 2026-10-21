import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getDb, getOrder, hasOrderFulfillmentHistory, type OrderItem } from "@/lib/db";
import { orderEditSchema, orderEditTotals, type DiscountType, type ShippingMode } from "@/lib/order-edit-schema";
import { listProducts } from "@/lib/services/catalog";
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
  };
  return {
    revision: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
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
    variantId: v.variantId, productId: p.id, name: p.name, color: v.colorName,
    size: v.size, price: p.price, available: v.available,
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
    for (const line of input.lines) {
      const variant = db.prepare(`SELECT v.product_id, v.size, c.name AS color, p.name, p.price
        FROM variants v JOIN products p ON p.id = v.product_id JOIN product_colors c ON c.id = v.color_id
        WHERE v.id = ? AND v.active = 1 AND p.active = 1`).get(line.variantId) as {
          product_id: string; size: string; color: string; name: string; price: number;
        } | undefined;
      if (!variant) throw new OrderEditError(400, "Un produit ou une variante n'est plus disponible.");
      let unitPrice = variant.price;
      if (line.upsellIndex !== undefined) {
        const original = before.snapshot.upsellItems[line.upsellIndex];
        if (!original || usedUpsells.has(line.upsellIndex) || original.product_id !== variant.product_id || line.qty > original.quantity) {
          throw new OrderEditError(400, "L'offre upsell existante ne peut pas être étendue ou transférée à un autre produit.");
        }
        usedUpsells.add(line.upsellIndex);
        unitPrice = original.unit_price;
      }
      const qty = (quantities.get(line.variantId) ?? 0) + line.qty;
      quantities.set(line.variantId, qty);
      if (qty > 10) throw new OrderEditError(400, "Maximum 10 unités par variante, toutes lignes confondues.");
      if (availableFor(line.variantId) < qty) throw new OrderEditError(409, `Stock insuffisant : ${variant.name} — ${variant.color} / ${variant.size}.`);
      const item: OrderItem = { product_id: variant.product_id, name: variant.name, color: variant.color,
        size: variant.size, quantity: line.qty, unit_price: unitPrice, line_total: unitPrice * line.qty };
      (line.upsellIndex === undefined ? items : upsellItems).push(item);
    }
    const regularSubtotal = items.reduce((sum, i) => sum + i.line_total, 0);
    if (input.discountType === "fixed" && input.discountValue > regularSubtotal) {
      throw new OrderEditError(400, "La remise ne peut pas dépasser le montant des articles hors upsell.");
    }
    const totals = orderEditTotals(regularSubtotal, upsellItems.reduce((sum, i) => sum + i.line_total, 0),
      input.discountType, input.discountValue, input.shippingMode);
    const after: OrderEditSnapshot = { items, upsellItems, ...totals, discountType: input.discountType,
      discountValue: input.discountValue, shippingMode: input.shippingMode };
    const now = new Date().toISOString();
    db.prepare(`UPDATE orders SET items_json = ?, upsell_items_json = ?, upsell_status = ?,
      subtotal = ?, shipping = ?, total = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
      shipping_mode = ?, updated_at = ? WHERE id = ?`).run(
      JSON.stringify(items), upsellItems.length ? JSON.stringify(upsellItems) : null,
      upsellItems.length ? "accepted" : "declined", totals.subtotal, totals.shipping, totals.total,
      input.discountType, input.discountValue, totals.discountAmount, input.shippingMode, now, orderId,
    );
    db.prepare(`INSERT INTO order_edits (id, order_id, actor_id, actor_name, reason, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(`oed_${nanoid(12)}`, orderId, actor.id, actor.name ?? actor.id,
      input.reason, JSON.stringify(before.snapshot), JSON.stringify(after), now);
    return readState(orderId);
  }).immediate();
}
