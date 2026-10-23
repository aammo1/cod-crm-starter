import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { normalizeMaPhone } from "@/lib/phone";
import type { CommerceOrderItem as OrderItem } from "@/lib/commerce-types";
import type { TikTokAttribution, TikTokContext, TikTokProperties } from "@/lib/tiktok-shared";

/**
 * Internal/browser event name -> TikTok Events API v1.3 event name.
 * Names follow the TikTok Events API v1.3 standard events (CompletePayment,
 * ViewContent, AddToCart, InitiateCheckout, Pageview) per the TikTok docs. They
 * must be confirmed in TikTok Events Manager test events before go-live; change
 * them only here.
 */
export const TIKTOK_EVENT_NAMES = {
  Purchase: "CompletePayment",
  PageView: "Pageview",
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
} as const;

export function tiktokEnabled() {
  return /^[A-Z0-9]{10,30}$/.test(process.env.TIKTOK_PIXEL_ID ?? "") && !!process.env.TIKTOK_ACCESS_TOKEN;
}

/** Builds the stored server context. The caller supplies an already trusted IP. */
export function tiktokContextFromAttribution(attr: TikTokAttribution, ip?: string | null, userAgent?: string | null): TikTokContext {
  const source = new URL(attr.sourceUrl);
  return {
    eventId: attr.eventId,
    sourceUrl: source.origin + source.pathname,
    user: {
      ...(attr.ttp ? { ttp: attr.ttp } : {}),
      ...(attr.ttclid ? { ttclid: attr.ttclid } : {}),
      ...(ip && isIP(ip) ? { ip } : {}),
      user_agent: (userAgent ?? "").slice(0, 1024),
    },
  };
}

export type Snapshot = { total: number; items: OrderItem[]; upsellItems: OrderItem[]; customerPhone: string; eventTime: number };
type PurchaseRow = { event_id: string; context_json: string; snapshot_json: string | null; order_id: string };

/** A ready snapshot (no upsell offer) lets the finalizer queue immediately; otherwise
 * the upsell_status trigger writes it on resolution. */
export function recordTikTokPurchaseContext(db: Database.Database, orderId: string, context: TikTokContext,
  deadline: number, snapshot?: Snapshot) {
  db.prepare(`INSERT OR IGNORE INTO tiktok_purchases (order_id, event_id, context_json, deadline, snapshot_json)
    VALUES (?, ?, ?, ?, ?)`).run(orderId, context.eventId, JSON.stringify(context), deadline,
      snapshot ? JSON.stringify(snapshot) : null);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function hashedPhone(raw: string) {
  const e164 = normalizeMaPhone(raw);
  return e164 ? sha256(e164) : null;
}

function enqueueRaw(name: string, context: TikTokContext, properties: TikTokProperties | undefined,
  eventTime: number, extraUser: Record<string, string> = {}) {
  getDb().prepare(`INSERT OR IGNORE INTO tiktok_events(event_id, payload_json, available_at) VALUES (?, ?, ?)`)
    .run(context.eventId, JSON.stringify({
      event: name, event_time: eventTime, event_id: context.eventId,
      user: { ...context.user, ...extraUser },
      page: { url: context.sourceUrl },
      ...(properties ? { properties } : {}),
    }), Date.now());
}

export function enqueueTikTok(name: string, context: TikTokContext, properties?: TikTokProperties,
  eventTime = Math.floor(Date.now() / 1000)) {
  enqueueRaw(name, context, properties, eventTime);
}

function purchaseProperties(snapshot: Snapshot): TikTokProperties {
  const items = [...snapshot.items, ...snapshot.upsellItems];
  return {
    currency: "MAD", value: snapshot.total, content_type: "product",
    contents: items.map((item) => ({
      content_id: item.product_id, content_name: item.name, quantity: item.quantity, price: item.unit_price,
    })),
  };
}

export function finalizeTikTokPurchases() {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`UPDATE orders SET upsell_status = 'declined', updated_at = ?
      WHERE upsell_status = 'pending' AND id IN
      (SELECT order_id FROM tiktok_purchases WHERE snapshot_json IS NULL AND deadline <= ?)`)
      .run(new Date().toISOString(), Date.now());
    const rows = db.prepare("SELECT * FROM tiktok_purchases WHERE snapshot_json IS NOT NULL AND queued = 0 LIMIT 100").all() as PurchaseRow[];
    for (const row of rows) {
      const snapshot = JSON.parse(row.snapshot_json!) as Snapshot;
      const context = JSON.parse(row.context_json) as TikTokContext;
      const hash = hashedPhone(snapshot.customerPhone);
      enqueueRaw(TIKTOK_EVENT_NAMES.Purchase, context, purchaseProperties(snapshot), snapshot.eventTime,
        hash ? { phone: hash, external_id: hash } : {});
      db.prepare("UPDATE tiktok_purchases SET queued = 1 WHERE order_id = ?").run(row.order_id);
    }
  }).immediate();
}

function redact(text: string) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  return token ? text.split(token).join("[redacted]") : text;
}

export async function tiktokTick() {
  if (!tiktokEnabled()) return;
  finalizeTikTokPurchases();
  const db = getDb();
  for (let count = 0; count < 25; count++) {
    const lease = randomUUID();
    const row = db.prepare(`UPDATE tiktok_events SET lease = ?, attempts = attempts + 1, available_at = ?
      WHERE event_id = (SELECT event_id FROM tiktok_events WHERE sent_at IS NULL AND failed = 0
        AND available_at <= ? ORDER BY available_at LIMIT 1)
      RETURNING event_id, payload_json, attempts`).get(lease, Date.now() + 60_000, Date.now()) as
      { event_id: string; payload_json: string; attempts: number } | undefined;
    if (!row) break;
    try {
      const base = (process.env.TIKTOK_API_BASE || "https://business-api.tiktok.com/open_api/v1.3").replace(/\/+$/, "");
      const response = await fetch(`${base}/event/track/`, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", "Access-Token": process.env.TIKTOK_ACCESS_TOKEN! },
        body: JSON.stringify({
          event_source: "web", event_source_id: process.env.TIKTOK_PIXEL_ID,
          ...(process.env.TIKTOK_TEST_EVENT_CODE ? { test_event_code: process.env.TIKTOK_TEST_EVENT_CODE } : {}),
          data: [JSON.parse(row.payload_json)],
        }),
      });
      const result = await response.json().catch(() => ({})) as { code?: number };
      if (response.status !== 200 || result.code !== 0) {
        console.error("[tiktok] Events API rejected event", { status: response.status, code: result.code });
        throw new Error("Events API rejected event");
      }
      db.prepare("UPDATE tiktok_events SET sent_at = ?, lease = NULL WHERE event_id = ? AND lease = ?").run(Date.now(), row.event_id, lease);
    } catch (error) {
      console.error("[tiktok] envoi Events API en échec", { attempts: row.attempts,
        kind: error instanceof Error ? redact(error.name) : "unknown" });
      db.prepare("UPDATE tiktok_events SET available_at = ?, failed = ?, lease = NULL WHERE event_id = ? AND lease = ?")
        .run(Date.now() + Math.min(3_600_000, 5000 * 2 ** Math.min(row.attempts, 10)), row.attempts >= 48 ? 1 : 0, row.event_id, lease);
    }
  }
  db.prepare("DELETE FROM tiktok_events WHERE sent_at < ?").run(Date.now() - 7 * 86400_000);
  db.prepare("DELETE FROM tiktok_events WHERE failed = 1 AND available_at < ?").run(Date.now() - 7 * 86400_000);
  db.prepare("DELETE FROM tiktok_purchases WHERE queued = 1 AND deadline < ?").run(Date.now() - 30 * 86400_000);
}
