import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cod-crm-meta-"));
Object.assign(process.env, {
  DB_PATH: path.join(temp, "test.db"), UPLOAD_DIR: path.join(temp, "uploads"),
  DELIVERY_PROVIDER: "mock", AUTH_SECRET: randomBytes(32).toString("hex"),
  STOREFRONT_API_KEY: randomBytes(32).toString("hex"), CRM_PUBLIC_URL: "https://crm.example.test",
  FACEBOOK_PIXEL_ID: "123456", FACEBOOK_ACCESS_TOKEN: "test-token", FACEBOOK_TEST_EVENT_CODE: "TEST123",
});
delete process.env.SECURITY_TRUSTED_IP_HEADER;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : originalLoad.call(this, name, ...args);
};
const { POST: checkout } = loadSource("@/app/api/storefront/v1/orders/route");
const { POST: upsell } = loadSource("@/app/api/storefront/v1/orders/[id]/upsell/route");
const { getDb } = loadSource("@/lib/db");
const { createProduct, updateProduct, archiveProduct } = loadSource("@/lib/services/catalog");
const { purchaseFor, finalizeMetaPurchases, metaTick } = loadSource("@/lib/services/meta");
const { budgetKey } = loadSource("@/lib/services/security-budgets");
Module._load = originalLoad;
const db = getDb();
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

const main = createProduct({ name: "Appareil", category: "gadgets", price: 300, images: ["/images/main.webp"] });
const extra = createProduct({ name: "Recharge", category: "beaute", price: 200, isBestSeller: true,
  images: ["/images/extra.webp"], optionDefinitions: [{ name: "Volume", values: ["500 ml", "1 L"] }],
  initialStock: [{ options: [{ name: "Volume", value: "500 ml" }], qty: 20 }] });
const choice = extra.variants[0].id;
let phone = 10000000;
function body(meta = true) {
  return { customer: { name: " Salma Benali ", phone: `06${phone++}` },
    items: [{ variantId: main.variants[0].id, qty: 1 }],
    ...(meta ? { meta: { eventId: randomUUID(), sourceUrl: "https://shop.example.test/produit?phone=private",
      fbc: "fb.1.123.click", fbp: "fb.1.123.browser", clientIpAddress: "203.0.113.4", clientUserAgent: "Browser" } } : {}) };
}
function request(data, key = randomUUID(), headers = {}, route = "orders") {
  return new Request(`https://crm.example.test/api/storefront/v1/${route}`, {
    method: "POST", headers: { authorization: `Bearer ${process.env.STOREFRONT_API_KEY}`,
      "content-type": "application/json", "idempotency-key": key, ...headers },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
}
async function order(data = body(), key = randomUUID()) {
  const response = await checkout(request(data, key));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return response.json();
}
function resolve(saved, data = { action: "accept", variantId: choice }, key = randomUUID(), token = saved.orderToken) {
  return upsell(request(data, key, { "x-order-token": token }, `orders/${saved.orderId}/upsell`),
    { params: Promise.resolve({ id: saved.orderId }) });
}
function snapshot(id) { return db.prepare("SELECT * FROM meta_purchases WHERE order_id = ?").get(id); }
function queued(id) { return db.prepare("SELECT * FROM meta_events WHERE event_id = ?").get(snapshot(id).event_id); }

test("HTTP auth precedes bounded JSON; schemas reject prices, unknown keys and aggregate overflow", async () => {
  assert.equal((await checkout(request("{", randomUUID(), { authorization: "Bearer wrong" }))).status, 401);
  assert.equal((await checkout(request(body(), randomUUID(), { origin: "https://shop.example.test" }))).status, 403);
  assert.equal((await checkout(request(body(), "bad key"))).status, 400);
  assert.equal((await checkout(request("x".repeat(32769)))).status, 413);
  assert.equal((await checkout(request("{"))).status, 400);
  for (const data of [
    { ...body(), total: 1 }, { ...body(), items: [{ variantId: main.variants[0].id, qty: 1, price: 1 }] },
    { ...body(), items: Array(2).fill({ variantId: main.variants[0].id, qty: 6 }) },
    { ...body(), meta: { eventId: randomUUID(), sourceUrl: "ftp://shop.example.test/" } },
  ]) assert.equal((await checkout(request(data))).status, 400);
  const key = process.env.STOREFRONT_API_KEY;
  delete process.env.STOREFRONT_API_KEY;
  assert.equal((await checkout(request(body()))).status, 503);
  process.env.STOREFRONT_API_KEY = key;
});

test("default zero-stock checkout, canonical replay, immutable images and cross-process restart", async () => {
  const data = body(); const key = randomUUID(); const saved = await order(data, key);
  assert.deepEqual(saved.totals, { itemsSubtotal: 300, shipping: 29, total: 329, currency: "MAD" });
  assert.equal(saved.upsellOffer.image, "https://crm.example.test/images/extra.webp");
  assert.equal(typeof saved.upsellOffer.variants[0].available, "boolean");
  assert.equal(saved.upsellOffer.variants[0].options[0].value, "500 ml");
  const stored = db.prepare("SELECT * FROM orders WHERE id = ?").get(saved.orderId);
  assert.equal(JSON.parse(stored.items_json)[0].name, "Appareil");
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM storefront_request_receipts WHERE order_id = ?").all(saved.orderId)).includes(saved.orderToken), false);
  updateProduct(extra.id, { images: ["/images/changed.webp"], price: 999 });
  archiveProduct(main.id);
  const replay = await checkout(request({ ...data, customer: { ...data.customer, name: "Salma Benali" } }, key));
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), saved);
  assert.equal((await checkout(request({ ...data, items: [{ variantId: main.variants[0].id, qty: 2 }] }, key))).status, 409);
  const script = `import Module from 'node:module'; import {loadSource} from './scripts/test-source.mjs';
    const orig=Module._load; Module._load=function(n,...a){return n==='server-only'?{}:orig.call(this,n,...a)};
    const {POST}=loadSource('@/app/api/storefront/v1/orders/route');
    const response=await POST(new Request('https://crm.example.test/api/storefront/v1/orders',{
      method:'POST',headers:{authorization:'Bearer '+process.env.STOREFRONT_API_KEY,'idempotency-key':process.env.TEST_KEY},body:process.env.TEST_BODY}));
    process.stdout.write(JSON.stringify({status:response.status,body:await response.json()}));`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(), env: { ...process.env, CRM_PUBLIC_URL: "https://changed.example.test", TEST_KEY: key, TEST_BODY: JSON.stringify(data) }, encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { status: 200, body: saved });
  db.prepare("UPDATE products SET active = 1 WHERE id = ?").run(main.id);
  updateProduct(extra.id, { images: ["/images/extra.webp"], price: 200 });
});

test("phone budget only counts new commits; auth/global budget still applies to replays", async () => {
  const data = body(false); const key = randomUUID(); const saved = await order(data, key);
  for (let i = 0; i < 4; i++) await order(data);
  const denied = await checkout(request(data));
  assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get("retry-after")) > 0);
  assert.equal((await checkout(request(data, key))).status, 200);
  const row = db.prepare("SELECT hits FROM security_budgets WHERE key = ?").get(budgetKey("checkout:phone", data.customer.phone.replace(/^0/, "+212")));
  assert.equal(row.hits, 5);
  db.prepare("UPDATE security_budgets SET hits = 600 WHERE key = 'storefront:v1:global'").run();
  assert.equal((await checkout(request(data, key))).status, 429);
  db.prepare("DELETE FROM security_budgets WHERE key = 'storefront:v1:global'").run();
  assert.equal((await resolve(saved, { action: "decline" })).status, 200);
});

test("upsell token secrecy, product binding, one-unit replay and conflicts", async () => {
  const saved = await order();
  const invalid = await resolve(saved, undefined, randomUUID(), "wrong");
  assert.equal(invalid.status, 401);
  const missing = await resolve({ ...saved, orderId: randomUUID() }, undefined, randomUUID(), "wrong");
  assert.deepEqual(await missing.json(), await invalid.json());
  assert.equal((await resolve(saved, { action: "accept", variantId: main.variants[0].id })).status, 400);
  assert.equal((await resolve(saved, { action: "accept", variantId: choice, qty: 2 })).status, 400);
  const key = randomUUID(); const accepted = await resolve(saved, undefined, key);
  assert.equal(accepted.status, 200);
  const result = await accepted.json(); assert.equal(result.totals.total, 440);
  db.prepare("UPDATE orders SET confirmation_status = 'confirmed' WHERE id = ?").run(saved.orderId);
  assert.deepEqual(await (await resolve(saved, undefined, key)).json(), result);
  assert.equal((await resolve(saved, { action: "decline" }, key)).status, 409);
  assert.equal((await resolve(saved, { action: "decline" })).status, 409);
  assert.equal(purchaseFor(saved.orderId).params.num_items, 2);
  finalizeMetaPurchases(); finalizeMetaPurchases();
  const event = JSON.parse(queued(saved.orderId).payload_json);
  assert.equal(event.custom_data.value, 440);
  assert.equal(event.event_source_url, "https://shop.example.test/produit");
  assert.equal(event.user_data.client_ip_address, "203.0.113.4");
  assert.equal(event.user_data.client_user_agent, "Browser");
  assert.deepEqual(event.user_data.fn, [createHash("sha256").update("salma").digest("hex")]);
  assert.equal(JSON.stringify(event).includes("Salma"), false);
});

test("expiry, confirmation closure, absent attribution and disabled Meta", async () => {
  const expired = await order();
  db.prepare("UPDATE orders SET upsell_expires_at = '2000-01-01' WHERE id = ?").run(expired.orderId);
  assert.equal((await resolve(expired)).status, 409);
  db.prepare("UPDATE meta_purchases SET deadline = 0 WHERE order_id = ?").run(expired.orderId);
  finalizeMetaPurchases(); assert.ok(purchaseFor(expired.orderId));
  const confirmed = await order();
  db.prepare("UPDATE orders SET confirmation_status = 'confirmed' WHERE id = ?").run(confirmed.orderId);
  assert.equal((await resolve(confirmed)).status, 409);
  const absent = await order(body(false)); assert.equal(snapshot(absent.orderId), undefined);
  delete process.env.FACEBOOK_ACCESS_TOKEN;
  const disabled = await order(); assert.equal(snapshot(disabled.orderId), undefined);
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
});

test("non-size checkout and disabled offers finalize immediately with server totals", async () => {
  const { DEFAULT_STORE_SETTINGS } = loadSource("@/lib/store-settings-schema");
  db.prepare("INSERT INTO app_state(key, value) VALUES ('store_settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ ...DEFAULT_STORE_SETTINGS, upsellEnabled: false }));
  try {
    const data = body(); data.items = [{ variantId: choice, qty: 2 }];
    const saved = await order(data);
    assert.equal(saved.upsellOffer, null); assert.equal(saved.totals.total, 400);
    assert.equal(purchaseFor(saved.orderId).params.num_items, 2);
    assert.equal((await resolve(saved)).status, 409);
    assert.equal((await checkout(request({ ...body(), items: [{ variantId: "missing", qty: 1 }] }))).status, 404);
  } finally { db.prepare("DELETE FROM app_state WHERE key = 'store_settings'").run(); }
});

test("duplicate attribution rolls back order and phone budget; no transport attribution inference", async () => {
  const data = body(); await order(data);
  const before = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  assert.equal((await checkout(request(data))).status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, before);
  assert.equal(db.prepare("SELECT hits FROM security_budgets WHERE key = ?")
    .get(budgetKey("checkout:phone", data.customer.phone.replace(/^0/, "+212"))).hits, 1);
  const noBrowser = body(); delete noBrowser.meta.clientIpAddress; delete noBrowser.meta.clientUserAgent;
  const response = await checkout(request(noBrowser, randomUUID(), { "x-forwarded-for": "198.51.100.8", "user-agent": "CRM server" }));
  const saved = await response.json();
  assert.deepEqual(JSON.parse(snapshot(saved.orderId).context_json).userData,
    { fbp: noBrowser.meta.fbp, fbc: noBrowser.meta.fbc });
});

test("durable optional Meta delivery retries immutable ID/time and prevents active double-send", async () => {
  db.prepare("DELETE FROM meta_events").run(); db.prepare("UPDATE meta_purchases SET queued = 1").run();
  const saved = await order(); await resolve(saved, { action: "decline" });
  const requests = [];
  globalThis.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); throw new Error("network down"); };
  await metaTick(); assert.equal(queued(saved.orderId).attempts, 1);
  db.prepare("UPDATE meta_events SET lease = 'crashed', available_at = 0").run();
  let release; let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++; requests.push(JSON.parse(options.body));
    assert.equal(options.headers.Authorization, "Bearer test-token");
    await new Promise((resolve) => { release = resolve; });
    return Response.json({ events_received: 1 });
  };
  const first = metaTick(); await metaTick(); assert.equal(calls, 1); release(); await first;
  assert.deepEqual(requests[0], requests[1]); assert.ok(queued(saved.orderId).sent_at);
  await metaTick(); assert.equal(calls, 1);
});
