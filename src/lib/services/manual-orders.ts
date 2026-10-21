import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { getDb, type OrderItem } from "@/lib/db";
import { shippingFor } from "@/lib/pricing";
import { normalizeMaPhone } from "@/lib/phone";
import { listProducts } from "@/lib/services/catalog";
import {
  type ManualOrderInput,
  MANUAL_ORDER_SOURCE_LABELS,
} from "@/lib/manual-order-schema";

export class ManualOrderError extends Error {
  constructor(
    readonly status: 400 | 409 | 500,
    message: string,
  ) {
    super(message);
    this.name = "ManualOrderError";
  }
}

export interface ManualOrderTotals {
  itemsSubtotal: number;
  shipping: number;
  total: number;
}

export interface CreateManualOrderResult {
  orderId: string;
  totals: ManualOrderTotals;
  isReplay: boolean;
}

export interface CanonicalManualPayload {
  address: string | null;
  cityId: number | null;
  customer: {
    name: string;
    phone: string;
  };
  items: Array<{ variantId: string; qty: number }>;
  note: string | null;
  source: string;
}

export function buildCanonicalPayload(
  input: ManualOrderInput,
): CanonicalManualPayload {
  const normalizedPhone =
    normalizeMaPhone(input.customer.phone) ?? input.customer.phone.trim();

  const aggregatedMap = new Map<string, number>();
  for (const item of input.items) {
    aggregatedMap.set(
      item.variantId,
      (aggregatedMap.get(item.variantId) ?? 0) + item.qty,
    );
  }

  const sortedItems = Array.from(aggregatedMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([variantId, qty]) => ({ variantId, qty }));

  return {
    address: input.address?.trim() || null,
    cityId: input.cityId ?? null,
    customer: {
      name: input.customer.name.trim(),
      phone: normalizedPhone,
    },
    items: sortedItems,
    note: input.note?.trim() || null,
    source: input.source,
  };
}

export function computePayloadHash(canonical: CanonicalManualPayload): string {
  const stableRepresentation = JSON.stringify({
    address: canonical.address,
    cityId: canonical.cityId,
    customer: {
      name: canonical.customer.name,
      phone: canonical.customer.phone,
    },
    items: canonical.items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
    note: canonical.note,
    source: canonical.source,
  });

  return crypto
    .createHash("sha256")
    .update(stableRepresentation)
    .digest("hex");
}

export function createManualOrder(
  input: ManualOrderInput,
  actor: { id: string },
): CreateManualOrderResult {
  const db = getDb();
  const canonical = buildCanonicalPayload(input);
  const payloadHash = computePayloadHash(canonical);

  const tx = db.transaction((): CreateManualOrderResult => {
    // 1. Request lookup for idempotent replay / conflict check
    const existing = db
      .prepare(
        "SELECT request_id, order_id, agent_id, payload_hash FROM manual_order_requests WHERE request_id = ?",
      )
      .get(input.requestId) as
      | {
          request_id: string;
          order_id: string;
          agent_id: string;
          payload_hash: string;
        }
      | undefined;

    if (existing) {
      if (
        existing.agent_id !== actor.id ||
        existing.payload_hash !== payloadHash
      ) {
        throw new ManualOrderError(
          409,
          "Identifiant de requête déjà utilisé pour une autre commande ou par un autre utilisateur.",
        );
      }

      const order = db
        .prepare("SELECT id, subtotal, shipping, total FROM orders WHERE id = ?")
        .get(existing.order_id) as
        | { id: string; subtotal: number; shipping: number; total: number }
        | undefined;

      if (!order) {
        throw new ManualOrderError(
          500,
          "Commande introuvable pour cette requête enregistrée.",
        );
      }

      return {
        orderId: order.id,
        totals: {
          itemsSubtotal: order.subtotal,
          shipping: order.shipping,
          total: order.total,
        },
        isReplay: true,
      };
    }

    // 2. Validate aggregated quantities
    for (const item of canonical.items) {
      if (item.qty > 10) {
        throw new ManualOrderError(
          400,
          "La quantité cumulée pour un même article ne peut pas dépasser 10.",
        );
      }
    }

    // 3. City resolution (if provided)
    let cityName: string | null = null;
    let cityId: number | null = null;
    if (canonical.cityId !== null) {
      const cityRow = db
        .prepare("SELECT id, name FROM cities WHERE id = ?")
        .get(canonical.cityId) as { id: number; name: string } | undefined;
      if (!cityRow) {
        throw new ManualOrderError(
          400,
          "Ville inconnue — veuillez synchroniser la liste des villes.",
        );
      }
      cityId = cityRow.id;
      cityName = cityRow.name;
    }

    // 4. Catalog variant resolution
    const products = listProducts();
    const activeVariants = new Map<
      string,
      {
        productId: string;
        productName: string;
        price: number;
        colorName: string;
        size: string;
      }
    >();

    for (const product of products) {
      if (!product.active) continue;
      for (const variant of product.variants) {
        if (variant.active) {
          activeVariants.set(variant.variantId, {
            productId: product.id,
            productName: product.name,
            price: product.price,
            colorName: variant.colorName,
            size: variant.size,
          });
        }
      }
    }

    const items: OrderItem[] = [];
    for (const line of canonical.items) {
      const variantInfo = activeVariants.get(line.variantId);
      if (!variantInfo) {
        throw new ManualOrderError(
          400,
          `Variante « ${line.variantId} » introuvable ou inactive dans le catalogue.`,
        );
      }
      items.push({
        product_id: variantInfo.productId,
        name: variantInfo.productName,
        color: variantInfo.colorName,
        size: variantInfo.size,
        quantity: line.qty,
        unit_price: variantInfo.price,
        line_total: variantInfo.price * line.qty,
      });
    }

    const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
    const shipping = shippingFor(subtotal);
    const total = subtotal + shipping;

    const orderId = `ord_${nanoid(12)}`;
    const now = new Date().toISOString();

    // 5. Insert order
    db.prepare(
      `INSERT INTO orders (
        id, customer_name, customer_phone, items_json, upsell_offer_json,
        upsell_status, upsell_items_json, subtotal, shipping, total,
        currency, created_at, updated_at, confirmation_status, address,
        city_id, city_name, cod_status, source, assigned_to
      ) VALUES (
        @id, @customer_name, @customer_phone, @items_json, NULL,
        'declined', NULL, @subtotal, @shipping, @total,
        'MAD', @created_at, @updated_at, 'new', @address,
        @city_id, @city_name, 'awaiting_payment', @source, NULL
      )`,
    ).run({
      id: orderId,
      customer_name: canonical.customer.name,
      customer_phone: canonical.customer.phone,
      items_json: JSON.stringify(items),
      subtotal,
      shipping,
      total,
      created_at: now,
      updated_at: now,
      address: canonical.address,
      city_id: cityId,
      city_name: cityName,
      source: canonical.source,
    });

    // 6. Insert attribution note in order_contacts
    const contactId = `occ_${nanoid(12)}`;
    const sourceLabel =
      MANUAL_ORDER_SOURCE_LABELS[
        input.source as keyof typeof MANUAL_ORDER_SOURCE_LABELS
      ] ?? input.source;
    const noteParts = [`Commande créée manuellement via ${sourceLabel}.`];
    if (canonical.note) {
      noteParts.push(canonical.note);
    }
    const contactNote = noteParts.join("\n\n");

    db.prepare(
      `INSERT INTO order_contacts (
        id, order_id, agent_id, channel, outcome, note, next_callback_at, created_at
      ) VALUES (?, ?, ?, 'note', 'note', ?, NULL, ?)`,
    ).run(contactId, orderId, actor.id, contactNote, now);

    // 7. Insert manual_order_requests record
    db.prepare(
      `INSERT INTO manual_order_requests (
        request_id, order_id, agent_id, payload_hash, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
    ).run(input.requestId, orderId, actor.id, payloadHash, now);

    return {
      orderId,
      totals: {
        itemsSubtotal: subtotal,
        shipping,
        total,
      },
      isReplay: false,
    };
  });

  return tx.immediate();
}
