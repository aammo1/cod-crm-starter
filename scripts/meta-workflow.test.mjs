import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zehri-meta-"));
process.env.DB_PATH = path.join(temp, "test.db");
process.env.FACEBOOK_PIXEL_ID = "123456";
process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
process.env.FACEBOOK_TEST_EVENT_CODE = "TEST123";
const { getDb, createOrder, getOrder, resolveUpsell } = loadSource("@/lib/db");
const { requestMetaContext, purchaseFor, finalizeMetaPurchases, metaTick } = loadSource("@/lib/services/meta");
const { POST } = loadSource("@/app/api/pixel/route");
const db = getDb();
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

function context() {
  return requestMetaContext(new Request("https://zehri.ma/api/orders", {
    headers: { host: "zehri.ma", origin: "https://zehri.ma", "user-agent": "Test Browser", "x-forwarded-for": "203.0.113.4" },
  }), { eventId: randomUUID(), sourceUrl: "https://zehri.ma/produit/test?phone=private", fbc: "fb.1.123.click", fbp: "fb.1.123.browser" });
}
function order(offer = true, meta = context()) {
  return createOrder({
    id: randomUUID(), customerName: " Salma Benali ", customerPhone: "+212612345678", meta,
    items: [{ product_id: "main", name: "Bottines", color: "Noir", size: "38", quantity: 1, unit_price: 300, line_total: 300 }],
    upsellOffer: offer ? { product_id: "extra", name: "Seconde paire", original_price: 200, upsell_price: 140 } : null,
    subtotal: 300, shipping: 29, total: 329,
  });
}
function snapshot(id) { return db.prepare("SELECT * FROM meta_purchases WHERE order_id = ?").get(id); }
function queued(id) { return db.prepare("SELECT * FROM meta_events WHERE event_id = ?").get(snapshot(id).event_id); }

test("attribution rejects foreign origins and strips source query data", () => {
  assert.equal(context().sourceUrl, "https://zehri.ma/produit/test");
  assert.equal(context().userData.client_ip_address, "203.0.113.4");
  assert.equal(requestMetaContext(new Request("https://zehri.ma/api/orders", {
    headers: { host: "zehri.ma", origin: "https://attacker.example" },
  }), { eventId: randomUUID(), sourceUrl: "https://attacker.example/" }), undefined);
});

test("accepted upsell freezes authoritative contents, free shipping and one UUID", () => {
  const saved = order();
  assert.equal(purchaseFor(saved.id), null);
  resolveUpsell(saved.id, "accept");
  const purchase = purchaseFor(saved.id);
  assert.equal(purchase.params.value, 440);
  assert.equal(purchase.params.currency, "MAD");
  assert.equal(purchase.params.num_items, 2);
  assert.deepEqual(purchase.params.content_ids, ["main", "extra"]);
  resolveUpsell(saved.id, "accept");
  db.prepare("UPDATE orders SET total = 999, customer_name = 'Changed' WHERE id = ?").run(saved.id);
  assert.deepEqual(purchaseFor(saved.id), purchase);
  finalizeMetaPurchases();
  finalizeMetaPurchases();
  const event = JSON.parse(queued(saved.id).payload_json);
  assert.equal(event.event_id, purchase.eventId);
  assert.equal(event.custom_data.value, 440);
  assert.equal(event.event_source_url, "https://zehri.ma/produit/test");
  assert.deepEqual(event.user_data.ph, [createHash("sha256").update("212612345678").digest("hex")]);
  assert.deepEqual(event.user_data.fn, [createHash("sha256").update("salma").digest("hex")]);
  assert.equal(JSON.stringify(event).includes("Salma"), false);
});

test("declined and absent upsells preserve shipping; absent offers finalize immediately", () => {
  const declined = order();
  resolveUpsell(declined.id, "decline");
  assert.equal(purchaseFor(declined.id).params.value, 329);
  const absent = order(false);
  assert.equal(purchaseFor(absent.id).params.value, 329);
  assert.equal(purchaseFor(absent.id).params.num_items, 1);
});

test("browser abandonment expires durably and late acceptance cannot alter Purchase", () => {
  const expired = order();
  db.prepare("UPDATE meta_purchases SET deadline = 0 WHERE order_id = ?").run(expired.id);
  finalizeMetaPurchases();
  assert.equal(getOrder(expired.id).upsellStatus, "declined");
  const purchase = purchaseFor(expired.id);
  resolveUpsell(expired.id, "accept");
  assert.deepEqual(purchaseFor(expired.id), purchase);
  const late = order();
  db.prepare("UPDATE meta_purchases SET deadline = 0 WHERE order_id = ?").run(late.id);
  assert.equal(resolveUpsell(late.id, "accept").upsellStatus, "declined");
});

test("order and conversion context roll back together", () => {
  const meta = context();
  order(true, meta);
  const before = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  assert.throws(() => order(true, meta));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, before);
});

test("delivery survives network failure, reclaims crash leases and retries the same ID/time", async () => {
  // Clear earlier jobs so the assertions exercise only this event.
  db.prepare("DELETE FROM meta_events").run();
  db.prepare("UPDATE meta_purchases SET queued = 1").run();
  const saved = order(false);
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    throw new Error("network down");
  };
  await metaTick();
  assert.equal(queued(saved.id).sent_at, null);
  assert.equal(queued(saved.id).attempts, 1);
  db.prepare("UPDATE meta_events SET lease = 'crashed', available_at = 0").run();
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    assert.equal(options.headers.Authorization, "Bearer test-token");
    return Response.json({ events_received: 1 });
  };
  await metaTick();
  assert.ok(queued(saved.id).sent_at);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[1].test_event_code, "TEST123");
  await metaTick();
  assert.equal(requests.length, 2);
});

test("concurrent workers cannot send an actively leased conversion twice", async () => {
  const saved = order(false);
  let release;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
    return Response.json({ events_received: 1 });
  };
  const first = metaTick();
  await metaTick();
  assert.equal(calls, 1);
  release();
  await first;
  assert.ok(queued(saved.id).sent_at);
});

test("public endpoint rejects Purchase injection and untrusted prices", async () => {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO products(id, slug, name, category, price, created_at, updated_at) VALUES ('main', 'main', 'Bottines', 'bottines', 300, ?, ?)").run(now, now);
  db.prepare("INSERT INTO product_colors(id, product_id, name) VALUES ('main-color', 'main', 'Noir')").run();
  const send = (name) => POST(new Request("https://zehri.ma/api/pixel", {
    method: "POST", headers: { host: "zehri.ma", origin: "https://zehri.ma", "user-agent": "Test" },
    body: JSON.stringify({ ...context(), name, params: { content_ids: ["main"], value: 1, currency: "USD" } }),
  }));
  assert.equal((await send("Purchase")).status, 400);
  assert.equal((await send("ViewContent")).status, 200);
  const rows = db.prepare("SELECT payload_json FROM meta_events").all().map((row) => JSON.parse(row.payload_json));
  const event = rows.find((row) => row.event_name === "ViewContent");
  assert.equal(event.custom_data.value, 300);
  assert.equal(event.custom_data.currency, "MAD");
});
