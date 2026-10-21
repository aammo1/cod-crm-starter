import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { getDb } from "@/lib/db";
import type { CommerceOrderItem as OrderItem } from "@/lib/commerce-types";
import { metaContextSchema, type MetaPurchase } from "@/lib/meta-shared";

export function metaEnabled() {
  return /^\d+$/.test(process.env.FACEBOOK_PIXEL_ID ?? "") && !!process.env.FACEBOOK_ACCESS_TOKEN;
}

export function requestMetaContext(request: Request, raw: unknown) {
  const parsed = metaContextSchema.safeParse(raw);
  if (!parsed.success || !metaEnabled()) return;
  const source = new URL(parsed.data.sourceUrl);
  const origin = request.headers.get("origin");
  if (origin !== source.origin || source.host !== request.headers.get("host") ||
      /^(\/crm|\/admin|\/login)(\/|$)/.test(source.pathname)) return;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "";
  return {
    ...parsed.data,
    sourceUrl: source.origin + source.pathname,
    userData: {
      ...(isIP(ip) ? { client_ip_address: ip } : {}),
      client_user_agent: (request.headers.get("user-agent") ?? "").slice(0, 1024),
      ...(parsed.data.fbp ? { fbp: parsed.data.fbp } : {}),
      ...(parsed.data.fbc ? { fbc: parsed.data.fbc } : {}),
    },
  };
}

type Context = NonNullable<ReturnType<typeof requestMetaContext>>;
type Snapshot = {
  total: number; items: OrderItem[]; upsellItems: OrderItem[];
  customerName: string; customerPhone: string; eventTime: number;
};
type PurchaseRow = { event_id: string; context_json: string; snapshot_json: string | null; order_id: string };

export function purchaseFor(orderId: string): MetaPurchase | null {
  const row = getDb().prepare("SELECT * FROM meta_purchases WHERE order_id = ?").get(orderId) as PurchaseRow | undefined;
  if (!row?.snapshot_json) return null;
  const snapshot = JSON.parse(row.snapshot_json) as Snapshot;
  const items = [...snapshot.items, ...snapshot.upsellItems];
  return { eventId: row.event_id, params: {
    content_ids: [...new Set(items.map((item) => item.product_id))],
    content_type: "product", currency: "MAD", value: snapshot.total,
    num_items: items.reduce((sum, item) => sum + item.quantity, 0),
    contents: items.map((item) => ({ id: item.product_id, quantity: item.quantity, item_price: item.unit_price })),
  } };
}

export function enqueueMeta(name: string, context: Context, params: object, eventTime = Math.floor(Date.now() / 1000)) {
  getDb().prepare(`INSERT OR IGNORE INTO meta_events(event_id, payload_json, available_at) VALUES (?, ?, ?)`)
    .run(context.eventId, JSON.stringify({
      event_name: name, event_id: context.eventId, event_time: eventTime,
      action_source: "website", event_source_url: context.sourceUrl,
      user_data: context.userData, custom_data: params,
    }), Date.now());
}

const hash = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export function finalizeMetaPurchases() {
  const db = getDb();
  db.transaction(() => {
    // This shares SQLite's write lock with upsell acceptance and CRM confirmation.
    db.prepare(`UPDATE orders SET upsell_status = 'declined', updated_at = ?
      WHERE upsell_status = 'pending' AND id IN
      (SELECT order_id FROM meta_purchases WHERE snapshot_json IS NULL AND deadline <= ?)`)
      .run(new Date().toISOString(), Date.now());
    const rows = db.prepare("SELECT * FROM meta_purchases WHERE snapshot_json IS NOT NULL AND queued = 0 LIMIT 100").all() as PurchaseRow[];
    for (const row of rows) {
      const snapshot = JSON.parse(row.snapshot_json!) as Snapshot;
      const context = JSON.parse(row.context_json) as Context;
      const phone = snapshot.customerPhone.replace(/\D/g, "");
      const names = snapshot.customerName.trim().split(/\s+/);
      Object.assign(context.userData, {
        ph: [hash(phone)], external_id: [hash(phone)],
        fn: [hash(names[0])], ...(names.length > 1 ? { ln: [hash(names.slice(1).join(" "))] } : {}),
        country: [hash("ma")],
      });
      enqueueMeta("Purchase", context, purchaseFor(row.order_id)!.params, snapshot.eventTime);
      db.prepare("UPDATE meta_purchases SET queued = 1 WHERE order_id = ?").run(row.order_id);
    }
  }).immediate();
}

export async function metaTick() {
  if (!metaEnabled()) return;
  finalizeMetaPurchases();
  const db = getDb();
  // Fixed event timestamps/IDs make retry-after-crash safe for Meta deduplication.
  for (let count = 0; count < 25; count++) {
    const lease = randomUUID();
    const row = db.prepare(`UPDATE meta_events SET lease = ?, attempts = attempts + 1, available_at = ?
      WHERE event_id = (SELECT event_id FROM meta_events WHERE sent_at IS NULL AND failed = 0
        AND available_at <= ? ORDER BY available_at LIMIT 1)
      RETURNING event_id, payload_json, attempts`).get(lease, Date.now() + 60_000, Date.now()) as
      { event_id: string; payload_json: string; attempts: number } | undefined;
    if (!row) break;
    try {
      const version = process.env.FACEBOOK_API_VERSION || "v22.0";
      if (!/^v\d+\.0$/.test(version)) throw new Error("Invalid API version");
      const response = await fetch(`https://graph.facebook.com/${version}/${process.env.FACEBOOK_PIXEL_ID}/events`, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.FACEBOOK_ACCESS_TOKEN}` },
        body: JSON.stringify({ data: [JSON.parse(row.payload_json)],
          ...(process.env.FACEBOOK_TEST_EVENT_CODE ? { test_event_code: process.env.FACEBOOK_TEST_EVENT_CODE } : {}) }),
      });
      const result = await response.json() as { events_received?: number; error?: { code?: number; error_subcode?: number } };
      if (!response.ok || result.events_received !== 1) {
        console.error("[meta] CAPI rejected event", { status: response.status, code: result.error?.code, subcode: result.error?.error_subcode });
        throw new Error("CAPI rejected event");
      }
      db.prepare("UPDATE meta_events SET sent_at = ?, lease = NULL WHERE event_id = ? AND lease = ?").run(Date.now(), row.event_id, lease);
    } catch {
      db.prepare("UPDATE meta_events SET available_at = ?, failed = ?, lease = NULL WHERE event_id = ? AND lease = ?")
        .run(Date.now() + Math.min(3_600_000, 5000 * 2 ** Math.min(row.attempts, 10)), row.attempts >= 48 ? 1 : 0, row.event_id, lease);
    }
  }
  db.prepare("DELETE FROM meta_events WHERE sent_at < ?").run(Date.now() - 7 * 86400_000);
  db.prepare("DELETE FROM meta_purchases WHERE queued = 1 AND deadline < ?").run(Date.now() - 30 * 86400_000);
}
