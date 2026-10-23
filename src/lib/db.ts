import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/migrate";
import type { CommerceOrderItem, CommerceUpsellOffer, CommerceStoreSettings } from "@/lib/commerce-types";

type Db = Database.Database;
let dbInstance: Db | null = null;

/** Lazy: importing server modules during build never opens or seeds SQLite. */
export function getDb(): Db {
  if (dbInstance) return dbInstance;
  const dbPath = process.env.DB_PATH || "./data/crm.db";
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  dbInstance = db;
  return db;
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
  discount?: number; packSnapshot?: unknown[];
  /** First-touch campaign fields (wire names); persisted with the order, never trusted for pricing. */
  attribution?: {
    utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string;
    referrerHost?: string; landingPath?: string; clickIdType?: string;
  };
}): void {
  if (!db.inTransaction) throw new Error("Une transaction est requise.");
  const a = input.attribution ?? {};
  db.prepare(`INSERT INTO orders (id, customer_name, customer_phone, items_json,
    upsell_offer_json, upsell_status, subtotal, shipping, total, currency,
    created_at, updated_at, upsell_offer_id, upsell_expires_at, order_token_nonce, order_token_verifier,
    discount_type, discount_value, discount_amount, pack_snapshot_json,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_host, landing_path, click_id_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MAD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.customerName, input.customerPhone, JSON.stringify(input.items),
      input.offer ? JSON.stringify(input.offer) : null, input.offer ? "pending" : "closed",
      input.subtotal, input.shipping, input.total, input.now, input.now,
      input.offer?.offerId ?? null, input.offer?.expiresAt ?? null, input.nonce, input.verifier,
      input.discount ? "fixed" : "none", input.discount ?? 0, input.discount ?? 0,
      input.packSnapshot ? JSON.stringify(input.packSnapshot) : null,
      a.utm_source ?? null, a.utm_medium ?? null, a.utm_campaign ?? null, a.utm_content ?? null,
      a.utm_term ?? null, a.referrerHost ?? null, a.landingPath ?? null, a.clickIdType ?? null);
}

/** Confirmation closes the offer and freezes Meta in its reservation transaction. */
export function closePendingStorefrontUpsell(db: Db, orderId: string, status: "closed" | "expired" = "closed"): void {
  if (!db.inTransaction) throw new Error("Une transaction est requise.");
  db.prepare("UPDATE orders SET upsell_status = ?, updated_at = ? WHERE id = ? AND upsell_status = 'pending'")
    .run(status, new Date().toISOString(), orderId);
}

/** Even failed jobs/resolved reservations must be resolved, not recreated. */
export function hasOrderFulfillmentHistory(orderId: string): boolean {
  return getDb().prepare(`SELECT 1 FROM courier_submissions WHERE order_id = ?
    UNION ALL SELECT 1 FROM reservations WHERE order_id = ? LIMIT 1`).get(orderId, orderId) !== undefined;
}
