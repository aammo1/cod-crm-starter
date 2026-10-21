import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type Database from "better-sqlite3";
import type {
  CommerceProduct, CommerceVariant, CommerceOrderItem, CommerceTotals,
  StorefrontCheckoutReceiptSnapshot, StorefrontCheckoutResponse, StorefrontUpsellResponse,
} from "@/lib/commerce-types";
import { getDb, insertStorefrontOrder, closePendingStorefrontUpsell, type StoredStorefrontOffer } from "@/lib/db";
import { normalizeMaPhone } from "@/lib/phone";
import { shippingFor, upsellPriceFor } from "@/lib/pricing";
import { DEFAULT_STORE_SETTINGS, storeSettingsSchema } from "@/lib/store-settings-schema";
import { metaEnabled } from "@/lib/services/meta";
import { orderRulesKey } from "@/lib/services/order-lines";
import { createOrderNonce, deriveOrderToken, orderTokenVerifier, verifyOrderToken } from "@/lib/order-token";
import { StorefrontOrderError, findReceipt, writeReceipt, validateRequestKey, immediateOrderTransaction } from "@/lib/services/request-receipts";

export { StorefrontOrderError } from "@/lib/services/request-receipts";

export interface StorefrontCatalogVariant extends CommerceVariant {
  productActive: boolean;
  productName: string;
  price: number;
}
/** Bind synchronous SQL readers to the supplied connection. No network/cache
 * snapshots: all methods run under the service's immediate write transaction. */
export interface StorefrontCatalogPort {
  getVariantById(id: string): StorefrontCatalogVariant | null;
  getProductById(id: string): CommerceProduct | null;
  listUpsellCandidates(): CommerceProduct[];
}

const idSchema = z.string().trim().min(1).max(200);
const attributionSchema = z.object({
  eventId: z.string().uuid(),
  sourceUrl: z.string().url().max(2048).refine((s) => /^https?:\/\//.test(s)),
  fbp: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(256).optional(),
  fbc: z.string().regex(/^fb\.\d+\.\d+\.[\w-]+$/).max(512).optional(),
  clientIpAddress: z.string().max(45).refine((s) => !!isIP(s)).optional(),
  clientUserAgent: z.string().max(1024).optional(),
}).strict();
const checkoutSchema = z.object({
  customer: z.object({ name: z.string().trim().min(2).max(200), phone: z.string().max(100) }).strict(),
  items: z.array(z.object({ variantId: idSchema, qty: z.number().int().min(1).max(10) }).strict()).min(1).max(50),
  meta: attributionSchema.optional(),
}).strict();
const resolutionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), variantId: idSchema }).strict(),
  z.object({ action: z.literal("decline") }).strict(),
]);
function invalid(): never {
  throw new StorefrontOrderError(400, "INVALID_REQUEST", "Demande de commande invalide.");
}
export function canonicalCheckout(input: unknown) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) invalid();
  const value = parsed.data;
  const phone = normalizeMaPhone(value.customer.phone);
  if (!phone) invalid();
  const quantities = new Map<string, number>();
  for (const item of value.items) {
    const qty = (quantities.get(item.variantId) ?? 0) + item.qty;
    if (qty > 10) invalid();
    quantities.set(item.variantId, qty);
  }
  const meta = value.meta ? {
    eventId: value.meta.eventId, sourceUrl: (() => {
      const url = new URL(value.meta.sourceUrl); return url.origin + url.pathname;
    })(),
    ...(value.meta.fbp ? { fbp: value.meta.fbp } : {}),
    ...(value.meta.fbc ? { fbc: value.meta.fbc } : {}),
    ...(value.meta.clientIpAddress ? { clientIpAddress: value.meta.clientIpAddress } : {}),
    ...(value.meta.clientUserAgent ? { clientUserAgent: value.meta.clientUserAgent } : {}),
  } : undefined;
  return {
    customer: { name: value.customer.name, phone },
    items: [...quantities].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([variantId, qty]) => ({ variantId, qty })),
    ...(meta ? { meta } : {}),
  };
}
export function storefrontRequestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function totals(subtotal: number, shipping: number): CommerceTotals {
  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(subtotal + shipping)) invalid();
  return { itemsSubtotal: subtotal, shipping, total: subtotal + shipping, currency: "MAD" };
}
function snapshot(variant: CommerceVariant, name: string, price: number, quantity: number): CommerceOrderItem {
  if (!Number.isSafeInteger(price) || price < 0) invalid();
  return { product_id: variant.productId, variant_id: variant.id, sku: variant.sku,
    name, variant_label: variant.label, options: variant.options.map((o) => ({ ...o })),
    quantity, unit_price: price, line_total: price * quantity };
}
interface PrivateOrder {
  id: string; order_token_nonce: string; order_token_verifier: string;
  upsell_status: StorefrontUpsellResponse["upsellStatus"]; confirmation_status: string;
  upsell_offer_json: string | null; upsell_expires_at: string | null;
  subtotal: number; shipping: number; total: number;
}
function privateOrder(db: Database.Database, id: string): PrivateOrder {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as PrivateOrder | undefined;
  if (!row) throw new StorefrontOrderError(404, "ORDER_NOT_FOUND", "Commande introuvable.");
  return row;
}
function conflict(): never {
  throw new StorefrontOrderError(409, "UPSELL_CLOSED", "Cette offre ne peut plus être modifiée.");
}

export interface StorefrontOrderDependencies {
  /** The same connection must back the catalog readers and quota callback. */
  db?: Database.Database;
  catalog: StorefrontCatalogPort;
  /** Task 06/11 binds the durable per-phone quota here. Called ONLY for new
   * checkout, after receipt lookup, inside the transaction; throw to roll back. */
  checkNewOrderQuota?: (phone: string, db: Database.Database) => void;
}
export function createStorefrontOrderService(deps: StorefrontOrderDependencies) {
  const db = deps.db ?? getDb();
  return {
    checkout(requestKey: string, input: unknown): { status: 200 | 201; response: StorefrontCheckoutResponse } {
      validateRequestKey(requestKey);
      const request = canonicalCheckout(input);
      const hash = storefrontRequestHash(request);
      return immediateOrderTransaction(db, () => {
        const receipt = findReceipt(db, "checkout", requestKey, hash);
        if (receipt) {
          const order = privateOrder(db, receipt.order_id);
          const token = deriveOrderToken(order.id, order.order_token_nonce);
          if (orderTokenVerifier(token) !== order.order_token_verifier) {
            throw new StorefrontOrderError(503, "TOKEN_SECRET_CHANGED", "Le secret de commande a changé.");
          }
          return { status: 200 as const, response: {
            ...JSON.parse(receipt.response_json) as StorefrontCheckoutReceiptSnapshot, orderToken: token,
          } };
        }
        const items = request.items.map(({ variantId, qty }) => {
          const v = deps.catalog.getVariantById(variantId);
          if (!v || !v.active || !v.productActive) {
            throw new StorefrontOrderError(400, "INVALID_VARIANT", "Une variante est indisponible.");
          }
          return snapshot(v, v.productName, v.price, qty);
        });
        deps.checkNewOrderQuota?.(request.customer.phone, db);
        const settings = readSettings(db);
        const now = Date.now();
        const productIds = new Set(items.map((i) => i.product_id));
        const eligible = (p: CommerceProduct | null): p is CommerceProduct =>
          !!p && p.active && !productIds.has(p.id) && p.variants.some((v) => v.active && v.available > 0);
        let candidate: CommerceProduct | undefined;
        if (settings.upsellEnabled) {
          for (const id of productIds) {
            const ref = deps.catalog.getProductById(id)?.upsellRef;
            const p = ref ? deps.catalog.getProductById(ref) : null;
            if (eligible(p)) { candidate = p; break; }
          }
          candidate ??= deps.catalog.listUpsellCandidates().find((p) => p.isBestSeller && eligible(p));
        }
        let offer: StoredStorefrontOffer | null = null;
        if (candidate) {
          const variants = candidate.variants.filter((v) => v.active && v.productId === candidate.id);
          const price = upsellPriceFor(candidate.price, settings);
          offer = { offerId: randomUUID(), productId: candidate.id, name: candidate.name,
            image: candidate.images[0] ?? "", originalPrice: candidate.price, upsellPrice: price,
            expiresAt: new Date(now + settings.upsellWindowSeconds * 1000).toISOString(),
            variants: variants.map((v) => ({ variantId: v.id, label: v.label,
              options: v.options.map((o) => ({ ...o })), available: v.available > 0 })),
            rules: settings, variantItems: variants.map((v) => snapshot(v, candidate!.name, price, 1)),
          };
        }
        const subtotal = items.reduce((n, i) => n + i.line_total, 0);
        const amounts = totals(subtotal, shippingFor(subtotal, settings));
        const id = randomUUID(); const nonce = createOrderNonce();
        const token = deriveOrderToken(id, nonce);
        insertStorefrontOrder(db, { id, customerName: request.customer.name,
          customerPhone: request.customer.phone, items, offer, nonce, verifier: orderTokenVerifier(token),
          subtotal, shipping: amounts.shipping, total: amounts.total, now: new Date(now).toISOString() });
        // Every checkout needs historical shipping rules, including disabled or
        // unavailable upsells. Share manual creation's per-order snapshot contract
        // and write on this connection so order + rules + receipt commit together.
        db.prepare("INSERT INTO app_state (key, value) VALUES (?, ?)").run(orderRulesKey(id), JSON.stringify({
          shippingFeeMad: settings.shippingFeeMad, freeShippingThresholdMad: settings.freeShippingThresholdMad,
        }));
        if (request.meta && metaEnabled()) {
          const m = request.meta;
          const context = { eventId: m.eventId, sourceUrl: m.sourceUrl, userData: {
            ...(m.fbp ? { fbp: m.fbp } : {}), ...(m.fbc ? { fbc: m.fbc } : {}),
            ...(m.clientIpAddress ? { client_ip_address: m.clientIpAddress } : {}),
            ...(m.clientUserAgent ? { client_user_agent: m.clientUserAgent } : {}),
          } };
          // A reused attribution event ID must not drop the purchase or create a
          // second order with the same conversion ID. Roll the whole checkout back.
          const duplicate = db.prepare("SELECT 1 FROM meta_purchases WHERE event_id = ? UNION ALL SELECT 1 FROM meta_events WHERE event_id = ?")
            .get(m.eventId, m.eventId);
          if (duplicate) throw new StorefrontOrderError(409, "META_EVENT_CONFLICT", "Cet événement est déjà associé à une commande.");
          db.prepare(`INSERT INTO meta_purchases (order_id, event_id, context_json, deadline, snapshot_json)
            VALUES (?, ?, ?, ?, ?)`).run(id, m.eventId, JSON.stringify(context),
              offer ? Date.parse(offer.expiresAt) : now, offer ? null : JSON.stringify({
                total: amounts.total, items, upsellItems: [], customerName: request.customer.name,
                customerPhone: request.customer.phone, eventTime: Math.floor(now / 1000),
              }));
        }
        const publicOffer = offer ? { offerId: offer.offerId, productId: offer.productId,
          name: offer.name, image: offer.image, originalPrice: offer.originalPrice,
          upsellPrice: offer.upsellPrice, expiresAt: offer.expiresAt, variants: offer.variants } : null;
        const response: StorefrontCheckoutReceiptSnapshot = { orderId: id, totals: amounts, upsellOffer: publicOffer };
        writeReceipt(db, "checkout", requestKey, hash, id, response);
        return { status: 201 as const, response: { ...response, orderToken: token } };
      });
    },
    resolveUpsell(orderId: string, requestKey: string, orderToken: string, input: unknown): StorefrontUpsellResponse {
      validateRequestKey(requestKey);
      const parsed = resolutionSchema.safeParse(input);
      if (!parsed.success) invalid();
      const request = parsed.data;
      const hash = storefrontRequestHash(request);
      return immediateOrderTransaction(db, () => {
        const order = privateOrder(db, orderId);
        if (typeof orderToken !== "string" || !order.order_token_nonce || !order.order_token_verifier ||
            !verifyOrderToken(orderId, order.order_token_nonce, order.order_token_verifier, orderToken)) {
          throw new StorefrontOrderError(403, "INVALID_ORDER_TOKEN", "Jeton de commande invalide.");
        }
        const scope = `upsell:${orderId}` as const;
        const receipt = findReceipt(db, scope, requestKey, hash);
        if (receipt) return JSON.parse(receipt.response_json) as StorefrontUpsellResponse;
        if (order.upsell_status !== "pending" || ["confirmed", "cancelled"].includes(order.confirmation_status)) conflict();
        const history = db.prepare(`SELECT 1 FROM courier_submissions WHERE order_id = ?
          UNION ALL SELECT 1 FROM reservations WHERE order_id = ? LIMIT 1`).get(orderId, orderId);
        if (history) conflict();
        if (!order.upsell_expires_at || Date.now() >= Date.parse(order.upsell_expires_at) || !Number.isFinite(Date.parse(order.upsell_expires_at))) conflict();
        if (!order.upsell_offer_json) conflict();
        const offer = JSON.parse(order.upsell_offer_json) as StoredStorefrontOffer;
        let amounts = totals(order.subtotal, order.shipping);
        if (request.action === "accept") {
          const choice = offer.variants.find((v) => v.variantId === request.variantId && v.available);
          const item = offer.variantItems.find((v) => v.variant_id === request.variantId && v.product_id === offer.productId);
          if (!choice || !item) throw new StorefrontOrderError(400, "INVALID_UPSELL_VARIANT", "Variante hors de l’offre proposée.");
          const subtotal = order.subtotal + item.line_total;
          amounts = totals(subtotal, shippingFor(subtotal, offer.rules));
          db.prepare(`UPDATE orders SET upsell_status = 'accepted', upsell_items_json = ?,
            subtotal = ?, shipping = ?, total = ?, updated_at = ? WHERE id = ? AND upsell_status = 'pending'`)
            .run(JSON.stringify([item]), subtotal, amounts.shipping, amounts.total, new Date().toISOString(), orderId);
        } else {
          db.prepare("UPDATE orders SET upsell_status = 'declined', updated_at = ? WHERE id = ? AND upsell_status = 'pending'")
            .run(new Date().toISOString(), orderId);
        }
        const response: StorefrontUpsellResponse = { orderId, upsellStatus: request.action === "accept" ? "accepted" : "declined", totals: amounts };
        writeReceipt(db, scope, requestKey, hash, orderId, response);
        return response;
      });
    },
    /** Optional local expiry sweep, including unattributed orders. */
    expirePendingOffers(): number {
      return immediateOrderTransaction(db, () => {
        const rows = db.prepare("SELECT id FROM orders WHERE upsell_status = 'pending' AND upsell_expires_at <= ?")
          .all(new Date().toISOString()) as { id: string }[];
        for (const row of rows) closePendingStorefrontUpsell(db, row.id, "expired");
        return rows.length;
      });
    },
  };
}

function readSettings(db: Database.Database) {
  const row = db.prepare("SELECT value FROM app_state WHERE key = 'store_settings'").get() as { value: string } | undefined;
  return row ? storeSettingsSchema.parse(JSON.parse(row.value)) : { ...DEFAULT_STORE_SETTINGS };
}
