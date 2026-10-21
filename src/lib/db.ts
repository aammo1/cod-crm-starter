import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { shippingFor } from "@/lib/pricing";
import { runMigrations } from "@/lib/migrate";
import type { requestMetaContext } from "@/lib/services/meta";
import type { CommerceOrderItem, CommerceUpsellOffer, CommerceStoreSettings } from "@/lib/commerce-types";

type Db = Database.Database;
type Stmt = Database.Statement;

interface Statements {
  insertOrder: Stmt;
  getOrder: Stmt;
  updateUpsellAccepted: Stmt;
  updateUpsellDeclined: Stmt;
}

let dbInstance: Db | null = null;
let statements: Statements | null = null;

export function getDb(): Db {
  return init().db;
}

/** Private immutable snapshot, including SKU data omitted from public offers. */
export interface StoredStorefrontOffer extends CommerceUpsellOffer {
  rules: CommerceStoreSettings;
  variantItems: CommerceOrderItem[];
}

/** Used inside the checkout transaction on this connection, never a network call. */
export function insertStorefrontOrder(db: Db, input: {
  id: string; customerName: string; customerPhone: string; items: CommerceOrderItem[];
  offer: StoredStorefrontOffer | null; nonce: string; verifier: string;
  subtotal: number; shipping: number; total: number; now: string;
}): void {
  if (!db.inTransaction) throw new Error("Une transaction est requise.");
  db.prepare(`INSERT INTO orders (id, customer_name, customer_phone, items_json,
    upsell_offer_json, upsell_status, subtotal, shipping, total, currency,
    created_at, updated_at, upsell_offer_id, upsell_expires_at, order_token_nonce, order_token_verifier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MAD', ?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.customerName, input.customerPhone, JSON.stringify(input.items),
      input.offer ? JSON.stringify(input.offer) : null, input.offer ? "pending" : "closed",
      input.subtotal, input.shipping, input.total, input.now, input.now,
      input.offer?.offerId ?? null, input.offer?.expiresAt ?? null, input.nonce, input.verifier);
}

/** Confirmation must call within its own immediate transaction before reservation.
 * The Meta trigger freezes the same final snapshot in this transaction. */
export function closePendingStorefrontUpsell(db: Db, orderId: string, status: "closed" | "expired" = "closed"): void {
  if (!db.inTransaction) throw new Error("Une transaction est requise.");
  db.prepare("UPDATE orders SET upsell_status = ?, updated_at = ? WHERE id = ? AND upsell_status = 'pending'")
    .run(status, nowIso(), orderId);
}

// Lazily opened so that importing this module (e.g. during `next build`
// page-data collection) never touches the database file. Multiple build
// workers opening the DB concurrently caused SQLITE_BUSY before.
function init(): { db: Db; stmts: Statements } {
  if (dbInstance && statements) return { db: dbInstance, stmts: statements };
  const dbPath = process.env.DB_PATH || "./data/crm.db";
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  statements = {
    insertOrder: db.prepare(`
      INSERT INTO orders (
        id, customer_name, customer_phone, items_json, upsell_offer_json,
        upsell_status, upsell_items_json, subtotal, shipping, total,
        currency, created_at, updated_at
      ) VALUES (
        @id, @customer_name, @customer_phone, @items_json, @upsell_offer_json,
        'pending', NULL, @subtotal, @shipping, @total,
        @currency, @created_at, @updated_at
      )
    `),
    getOrder: db.prepare("SELECT * FROM orders WHERE id = ?"),
    updateUpsellAccepted: db.prepare(`
      UPDATE orders
      SET upsell_status = 'accepted', upsell_items_json = ?, subtotal = ?, shipping = ?, total = ?, updated_at = ?
      WHERE id = ?
    `),
    updateUpsellDeclined: db.prepare(
      "UPDATE orders SET upsell_status = 'declined', updated_at = ? WHERE id = ?",
    ),
  };
  dbInstance = db;
  return { db, stmts: statements };
}

// Transitional copied CRM consumers keep their old shape until task 10/20.
// New storefront persistence uses CommerceOrderItem exclusively, never these
// legacy color/size fields. Do not pass generic orders to resolveUpsell below.
export interface OrderItem {
  product_id: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface UpsellOfferJson {
  product_id: string;
  name: string;
  original_price: number;
  upsell_price: number;
}

export type UpsellStatus = "pending" | "accepted" | "declined";

export type ConfirmationStatus =
  | "new"
  | "no_answer"
  | "call_back_later"
  | "confirmed"
  | "cancelled";

export interface OrderRow {
  id: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  upsellOffer: UpsellOfferJson | null;
  upsellStatus: UpsellStatus;
  upsellItems: OrderItem[] | null;
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  confirmationStatus: ConfirmationStatus;
  address: string | null;
  cityId: number | null;
  cityName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  meta?: NonNullable<ReturnType<typeof requestMetaContext>>;
  id: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  upsellOffer: UpsellOfferJson | null;
  subtotal: number;
  shipping: number;
  total: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

interface OrdersTableRow {
  id: string;
  customer_name: string;
  customer_phone: string;
  items_json: string;
  upsell_offer_json: string | null;
  upsell_status: string;
  upsell_items_json: string | null;
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  confirmation_status: string;
  address: string | null;
  city_id: number | null;
  city_name: string | null;
  created_at: string;
  updated_at: string;
}

function mapOrderRow(row: OrdersTableRow): OrderRow {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items: JSON.parse(row.items_json) as OrderItem[],
    upsellOffer: row.upsell_offer_json
      ? (JSON.parse(row.upsell_offer_json) as UpsellOfferJson)
      : null,
    upsellStatus: row.upsell_status as UpsellStatus,
    upsellItems: row.upsell_items_json
      ? (JSON.parse(row.upsell_items_json) as OrderItem[])
      : null,
    subtotal: row.subtotal,
    shipping: row.shipping,
    total: row.total,
    currency: row.currency,
    confirmationStatus: row.confirmation_status as ConfirmationStatus,
    address: row.address,
    cityId: row.city_id,
    cityName: row.city_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOrder(input: CreateOrderInput): OrderRow {
  const { db } = init();
  return db.transaction(() => insertOrder(input)).immediate();
}

function insertOrder(input: CreateOrderInput): OrderRow {
  const { db, stmts } = init();
  const now = nowIso();
  const row: OrderRow = {
    id: input.id,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    items: input.items,
    upsellOffer: input.upsellOffer,
    upsellStatus: "pending",
    upsellItems: null,
    subtotal: input.subtotal,
    shipping: input.shipping,
    total: input.total,
    currency: "MAD",
    confirmationStatus: "new",
    address: null,
    cityId: null,
    cityName: null,
    createdAt: now,
    updatedAt: now,
  };
  stmts.insertOrder.run({
    id: row.id,
    customer_name: row.customerName,
    customer_phone: row.customerPhone,
    items_json: JSON.stringify(row.items),
    upsell_offer_json: row.upsellOffer ? JSON.stringify(row.upsellOffer) : null,
    subtotal: row.subtotal,
    shipping: row.shipping,
    total: row.total,
    currency: row.currency,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  });
  if (input.meta) {
    db.prepare(`INSERT INTO meta_purchases(order_id, event_id, context_json, deadline, snapshot_json)
      VALUES (?, ?, ?, ?, ?)`).run(row.id, input.meta.eventId, JSON.stringify(input.meta),
      Date.parse(now) + 20_000, input.upsellOffer ? null : JSON.stringify({
        total: row.total, items: row.items, upsellItems: [], customerName: row.customerName,
        customerPhone: row.customerPhone, eventTime: Math.floor(Date.now() / 1000),
      }));
  }
  return row;
}

export function getOrder(id: string): OrderRow | null {
  const { stmts } = init();
  const row = stmts.getOrder.get(id) as OrdersTableRow | undefined;
  return row ? mapOrderRow(row) : null;
}

/** Even failed jobs/resolved reservations must be resolved, not recreated. */
export function hasOrderFulfillmentHistory(orderId: string): boolean {
  return getDb()
    .prepare(
      `SELECT 1 FROM courier_submissions WHERE order_id = ?
       UNION ALL
       SELECT 1 FROM reservations WHERE order_id = ?
       LIMIT 1`,
    )
    .get(orderId, orderId) !== undefined;
}

export class UpsellConflictError extends Error {
  constructor() {
    super("Cette commande est déjà en cours de traitement ou annulée. L'offre ne peut plus être modifiée.");
    this.name = "UpsellConflictError";
  }
}

export function resolveUpsell(id: string, action: "accept" | "decline"): OrderRow | null {
  const { db, stmts } = init();
  // Serialize against CRM confirmation and other upsell requests before reading
  // the order. The winner determines the final contents/COD snapshot exactly once.
  return db.transaction(() => {
    const current = getOrder(id);
    if (!current) return null;
    // Generic storefront orders require the token/receipt/variant-aware service.
    // Transitional public routes must never bypass that boundary.
    if (db.prepare("SELECT 1 FROM orders WHERE id = ? AND order_token_nonce IS NOT NULL").get(id)) {
      throw new UpsellConflictError();
    }
    // Idempotent: resolved offers (including those closed by confirmation) stay put.
    if (current.upsellStatus !== "pending") return current;
    const expired = db.prepare("SELECT 1 FROM meta_purchases WHERE order_id = ? AND deadline <= ?")
      .get(id, Date.now());
    // The order owns its deadline even without attribution or after its cleanup.
    // Keep the existing analytics cutoff as an additional guard for frozen data.
    const deadline = Date.parse(current.createdAt) + 20_000;
    if (expired || !Number.isFinite(deadline) || Date.now() >= deadline) action = "decline";
    if (
      current.confirmationStatus === "confirmed" ||
      current.confirmationStatus === "cancelled" ||
      hasOrderFulfillmentHistory(id)
    ) {
      throw new UpsellConflictError();
    }

    if (action === "decline") {
      stmts.updateUpsellDeclined.run(nowIso(), id);
      return getOrder(id);
    }

    const offer = current.upsellOffer;
    if (!offer) return current;

    const upsellItem: OrderItem = {
      product_id: offer.product_id,
      name: offer.name,
      color: "—",
      size: "—",
      quantity: 1,
      unit_price: offer.upsell_price,
      line_total: offer.upsell_price,
    };
    const newSubtotal = current.subtotal + upsellItem.line_total;
    const shipping = shippingFor(newSubtotal);
    const total = newSubtotal + shipping;
    const now = nowIso();

    stmts.updateUpsellAccepted.run(
      JSON.stringify([upsellItem]),
      newSubtotal,
      shipping,
      total,
      now,
      id,
    );

    return getOrder(id);
  }).immediate();
}
