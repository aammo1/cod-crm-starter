import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { spawn } from "node:child_process";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-lifecycle-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
process.env.AUTH_SECRET = "isolated-order-lifecycle-secret-000000000000";
process.env.FACEBOOK_PIXEL_ID = "123456";
process.env.FACEBOOK_ACCESS_TOKEN = "isolated-no-network-token";
const { getDb, insertStorefrontOrder, closePendingStorefrontUpsell } = loadSource("@/lib/db");
const { getCrmOrder: getOrder } = loadSource("@/lib/services/orders");
const { createStorefrontOrderService } = loadSource("@/lib/services/storefront-orders");
const { listOrders, countDueCallbacks, getCrmOrder } = loadSource("@/lib/services/orders");
const { changeOrderLifecycle } = loadSource("@/lib/services/order-lifecycle");
const db = getDb();
const admin = { id: "admin", role: "admin" };
const agent = { id: "agent", role: "agent" };
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function order(id) {
  db.transaction(() => insertStorefrontOrder(db, { id, customerName: "Test", customerPhone: "+212612345678",
    items: [{ product_id: "fixture", variant_id: "fixture-v", sku: "FIXTURE", name: "Test",
      variant_label: "Standard", options: [], quantity: 1, unit_price: 100, line_total: 100 }],
    offer: null, nonce: "test-nonce", verifier: "test-verifier", now: new Date().toISOString(),
    subtotal: 100, shipping: 29, total: 129 })).immediate();
}

test("archive/restore changes visibility without changing order status, upsell, or totals", () => {
  order("visibility");
  db.prepare("UPDATE orders SET confirmation_status = 'call_back_later' WHERE id = 'visibility'").run();
  db.prepare(`INSERT INTO order_contacts (id, order_id, channel, outcome, next_callback_at, created_at)
    VALUES ('callback', 'visibility', 'phone', 'call_back_later', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')`).run();
  const before = getOrder("visibility");
  assert.equal(countDueCallbacks(), 1);
  changeOrderLifecycle(["visibility"], "archive", agent);
  assert.equal(listOrders().total, 0);
  assert.equal(listOrders({ archived: true }).total, 1);
  assert.equal(countDueCallbacks(), 0);
  assert.ok(getCrmOrder("visibility").archivedAt);
  const after = getOrder("visibility");
  for (const key of ["confirmationStatus", "upsellStatus", "total"]) assert.equal(after[key], before[key]);
  changeOrderLifecycle(["visibility"], "restore", agent);
  assert.equal(listOrders().total, 1);
  assert.equal(listOrders({ archived: true }).total, 0);
  assert.equal(countDueCallbacks(), 1);
});

test("deletion requires admin and archived orders, and removes related notes and conversion jobs", () => {
  order("delete-me");
  assert.throws(() => changeOrderLifecycle(["delete-me"], "delete", agent), { status: 403 });
  assert.throws(() => changeOrderLifecycle(["delete-me"], "delete", admin), { status: 409 });
  changeOrderLifecycle(["delete-me"], "archive", admin);
  db.prepare(`INSERT INTO meta_purchases (order_id, event_id, context_json, deadline) VALUES ('delete-me', 'purchase-test', '{}', 0)`).run();
  db.prepare(`INSERT INTO meta_events (event_id, payload_json, available_at) VALUES ('purchase-test', '{}', 0)`).run();
  db.prepare(`INSERT INTO manual_order_requests (request_id, order_id, agent_id, payload_hash, created_at)
    VALUES ('request-test', 'delete-me', 'admin', 'hash', '2020-01-01')`).run();
  db.prepare(`INSERT INTO order_contacts (id, order_id, channel, outcome, created_at)
    VALUES ('note', 'delete-me', 'note', 'note', '2020-01-01')`).run();
  changeOrderLifecycle(["delete-me"], "delete", admin);
  assert.equal(getOrder("delete-me"), null);
  const tomb = db.prepare("SELECT value FROM app_state WHERE key = 'manual_request_tombstone:request-test'").get();
  assert.equal(JSON.parse(tomb.value).deletedOrderId, "delete-me");
  for (const table of ["meta_events", "meta_purchases", "manual_order_requests"]) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM order_contacts WHERE order_id = 'delete-me'").get().n, 0);
  assert.deepEqual(db.pragma("foreign_key_check"), []);
});

test("a parcel history blocks the entire batch, including previously processed eligible orders", () => {
  order("eligible"); order("parcel-history");
  db.prepare(`INSERT INTO courier_submissions (id, order_id, status, next_retry_at, created_at, updated_at)
    VALUES ('failed-parcel', 'parcel-history', 'failed', '2020-01-01', '2020-01-01', '2020-01-01')`).run();
  changeOrderLifecycle(["eligible", "parcel-history"], "archive", admin);
  assert.throws(() => changeOrderLifecycle(["eligible", "parcel-history"], "delete", admin), { status: 409 });
  assert.ok(getOrder("eligible")); assert.ok(getOrder("parcel-history"));
  assert.throws(() => changeOrderLifecycle(["eligible", "missing"], "restore", admin), { status: 404 });
  assert.ok(getCrmOrder("eligible").archivedAt);
});

test("stock movements and released reservations both block deletion", () => {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
    VALUES ('p', 'p', 'Test', 'bottines', 100, ?, ?)`).run(now, now);
  db.prepare("INSERT INTO variants (id, product_id, sku, options_json, options_key, label) VALUES ('v', 'p', 'v', '[]', '[]', 'Standard')").run();
  order("movement-history"); order("reservation-history");
  db.prepare(`INSERT INTO stock_movements (id, variant_id, kind, qty, order_id, actor, source, ref, created_at)
    VALUES ('movement', 'v', 'release', 1, 'movement-history', 'admin', 'test', 'ref', ?)`).run(now);
  db.prepare(`INSERT INTO reservations (id, order_id, variant_id, qty, status, created_at)
    VALUES ('reservation', 'reservation-history', 'v', 1, 'released', ?)`).run(now);
  for (const id of ["movement-history", "reservation-history"]) {
    changeOrderLifecycle([id], "archive", admin);
    assert.throws(() => changeOrderLifecycle([id], "delete", admin), { status: 409 });
    assert.ok(getOrder(id));
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stock_movements").get().n, 1);
});

// SQL port intentionally independent of the same-wave catalog implementation.
// Its source is also run in separate processes against the same migrated DB.
function catalogPort(connection) {
  function product(id) {
    const p = connection.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!p) return null;
    const variants = connection.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY id").all(id).map((v) => ({
      id: v.id, productId: v.product_id, sku: v.sku, label: v.label,
      options: JSON.parse(v.options_json), images: JSON.parse(v.images_json),
      active: !!v.active, available: v.id === "offer-v" ? 10 : 0,
    }));
    return { id: p.id, slug: p.slug, name: p.name, price: p.price, active: !!p.active,
      category: p.category, description: "", optionDefinitions: [], images: JSON.parse(p.images_json),
      variants, upsellRef: p.upsell_ref ?? undefined, isBestSeller: !!p.is_best_seller };
  }
  return {
    getProductById: product,
    getVariantById(id) {
      const row = connection.prepare("SELECT product_id FROM variants WHERE id = ?").get(id);
      if (!row) return null;
      const p = product(row.product_id); const v = p.variants.find((v) => v.id === id);
      return { ...v, productActive: p.active, productName: p.name, price: p.price };
    },
    getActivePacks: () => ({}),
    listUpsellCandidates() {
      return connection.prepare("SELECT id FROM products WHERE is_best_seller = 1 ORDER BY id").all().map((p) => product(p.id));
    },
  };
}
function seedCommerce() {
  const now = new Date().toISOString();
  for (const [id, price, best] of [["cart", 300, 0], ["offer", 100, 1]]) {
    db.prepare(`INSERT INTO products (id, slug, name, category, price, is_best_seller, images_json, created_at, updated_at)
      VALUES (?, ?, ?, 'gadget', ?, ?, '["/test.webp"]', ?, ?)`).run(id, id, id, price, best, now, now);
    db.prepare(`INSERT INTO variants (id, product_id, sku, options_json, options_key, label)
      VALUES (?, ?, ?, ?, ?, ?)`).run(`${id}-v`, id, `${id}-sku`,
        id === "cart" ? '[{"name":"Capacité","value":"500 ml"}]' : '[]',
        id === "cart" ? '[["capacité","500 ml"]]' : '[]', id === "cart" ? "500 ml" : "Standard");
  }
}
const checkoutInput = (extra = {}) => ({ customer: { name: "  Client Test  ", phone: "06 12 34 56 78" },
  items: [{ variantId: "cart-v", qty: 1 }], ...extra });
const service = () => createStorefrontOrderService({ db, catalog: catalogPort(db) });
const requestCount = () => db.prepare("SELECT COUNT(*) AS n FROM storefront_request_receipts").get().n;

test("generic checkout accepts zero available, preserves options, prices and private token receipts", () => {
  seedCommerce();
  const result = service().checkout("checkout-generic", checkoutInput());
  assert.equal(result.status, 201);
  assert.deepEqual(result.response.totals, { itemsSubtotal: 300, shipping: 29, total: 329, currency: "MAD" });
  assert.equal(result.response.upsellOffer.upsellPrice, 70);
  const stored = db.prepare("SELECT * FROM orders WHERE id = ?").get(result.response.orderId);
  assert.equal(stored.customer_phone, "+212612345678");
  assert.equal(JSON.parse(stored.items_json)[0].options[0].value, "500 ml");
  assert.equal(JSON.parse(stored.items_json)[0].variant_id, "cart-v");
  const receipt = db.prepare("SELECT response_json FROM storefront_request_receipts WHERE request_key = 'checkout-generic'").get();
  assert.ok(!receipt.response_json.includes(result.response.orderToken));
  assert.ok(!JSON.stringify(stored).includes(result.response.orderToken));
  assert.ok(!("rules" in result.response.upsellOffer));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stock_movements WHERE order_id = ?").get(result.response.orderId).n, 0);
});

test("replay precedes catalog and quota, normalized aggregation hashes canonically", () => {
  const original = service().checkout("canonical-checkout", checkoutInput({ items: [{ variantId: "cart-v", qty: 2 }] }));
  const throwing = () => { throw new Error("must not be called for replay"); };
  const replay = createStorefrontOrderService({ db, catalog: { getVariantById: throwing, getProductById: throwing,
    listUpsellCandidates: throwing, getActivePacks: throwing }, checkNewOrderQuota: throwing }).checkout("canonical-checkout",
      checkoutInput({ customer: { name: "Client Test", phone: "+212612345678" },
        items: [{ variantId: "cart-v", qty: 1 }, { variantId: "cart-v", qty: 1 }] }));
  assert.equal(replay.status, 200); assert.deepEqual(replay.response, original.response);
  assert.throws(() => service().checkout("canonical-checkout", checkoutInput()), { status: 409, code: "IDEMPOTENCY_CONFLICT" });
  for (const input of [checkoutInput({ price: 1 }), checkoutInput({ meta: { arbitrary: true } }),
    checkoutInput({ items: [{ variantId: "cart-v", qty: 6 }, { variantId: "cart-v", qty: 5 }] })]) {
    assert.throws(() => service().checkout("invalid-request", input), { status: 400 });
  }
});

test("immutable offer/rules survive settings and catalog changes, replay survives later order edits", () => {
  const first = service().checkout("immutable-checkout", checkoutInput());
  db.prepare("UPDATE products SET price = 999, name = 'Changed', active = 0 WHERE id = 'offer'").run();
  db.prepare(`INSERT OR REPLACE INTO app_state(key, value) VALUES ('store_settings', ?)`)
    .run(JSON.stringify({ storeName: "Changed", shippingFeeMad: 99, freeShippingThresholdMad: 350,
      upsellEnabled: false, upsellWindowSeconds: 1, upsellDiscountPercent: 90 }));
  const accepted = service().resolveUpsell(first.response.orderId, "immutable-accept", first.response.orderToken,
    { action: "accept", variantId: "offer-v" });
  assert.deepEqual(accepted.totals, { itemsSubtotal: 370, shipping: 29, total: 399, currency: "MAD" });
  const item = JSON.parse(db.prepare("SELECT upsell_items_json FROM orders WHERE id = ?").get(first.response.orderId).upsell_items_json)[0];
  assert.equal(item.name, "offer"); assert.equal(item.sku, "offer-sku"); assert.equal(item.quantity, 1);
  db.prepare("UPDATE orders SET total = 1, confirmation_status = 'confirmed' WHERE id = ?").run(first.response.orderId);
  assert.deepEqual(service().resolveUpsell(first.response.orderId, "immutable-accept", first.response.orderToken,
    { action: "accept", variantId: "offer-v" }), accepted);
  assert.deepEqual(service().checkout("immutable-checkout", checkoutInput()).response, first.response);
  assert.throws(() => service().resolveUpsell(first.response.orderId, "opposite-action", first.response.orderToken,
    { action: "decline" }), { status: 409 });
  assert.throws(() => service().resolveUpsell(first.response.orderId, "immutable-accept", "wrong-token",
    { action: "accept", variantId: "offer-v" }), { status: 403 });
  db.prepare("DELETE FROM app_state WHERE key = 'store_settings'").run();
  db.prepare("UPDATE products SET price = 100, name = 'offer', active = 1 WHERE id = 'offer'").run();
});

test("disabled/unavailable offers start closed; AUTH_SECRET is required and rotation fails closed", () => {
  db.prepare("UPDATE products SET active = 0 WHERE id = 'offer'").run();
  const noOffer = service().checkout("no-offer-checkout", checkoutInput());
  assert.equal(noOffer.response.upsellOffer, null);
  assert.equal(db.prepare("SELECT upsell_status FROM orders WHERE id = ?").get(noOffer.response.orderId).upsell_status, "closed");
  db.prepare("UPDATE products SET active = 1 WHERE id = 'offer'").run();
  const secret = process.env.AUTH_SECRET; delete process.env.AUTH_SECRET;
  const count = requestCount();
  assert.throws(() => service().checkout("missing-secret-key", checkoutInput()), /AUTH_SECRET/);
  assert.equal(requestCount(), count);
  process.env.AUTH_SECRET = "rotated-test-secret";
  assert.throws(() => service().checkout("no-offer-checkout", checkoutInput()), { code: "TOKEN_SECRET_CHANGED" });
  process.env.AUTH_SECRET = secret;
});

test("strict validation, quota and receipt failures cannot leave partial orders", () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const quota = createStorefrontOrderService({ db, catalog: catalogPort(db), checkNewOrderQuota: (phone, connection) => {
    assert.equal(phone, "+212612345678"); assert.equal(connection, db); assert.ok(db.inTransaction);
    throw Object.assign(new Error("Quota"), { status: 429 });
  } });
  assert.throws(() => quota.checkout("quota-failure-key", checkoutInput()), { status: 429 });
  assert.throws(() => service().checkout("invalid-variant-key", checkoutInput({ items: [{ variantId: "missing", qty: 1 }] })), { code: "INVALID_VARIANT" });
  db.exec(`CREATE TEMP TRIGGER fail_receipt BEFORE INSERT ON storefront_request_receipts
    BEGIN SELECT RAISE(ABORT, 'receipt failure'); END`);
  try { assert.throws(() => service().checkout("receipt-failure-key", checkoutInput()), /receipt failure/); }
  finally { db.exec("DROP TRIGGER fail_receipt"); }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, before);
  const retry = service().checkout("receipt-failure-key", checkoutInput());
  assert.equal(retry.status, 201);
  assert.throws(() => service().resolveUpsell(retry.response.orderId, "wrong-variant-key", retry.response.orderToken,
    { action: "accept", variantId: "cart-v" }), { code: "INVALID_UPSELL_VARIANT" });
  assert.equal(db.prepare("SELECT upsell_status FROM orders WHERE id = ?").get(retry.response.orderId).upsell_status, "pending");
});

test("disabled upsells and configured bounds/rules apply only to new checkout", () => {
  db.prepare("INSERT OR REPLACE INTO app_state(key, value) VALUES ('store_settings', ?)").run(JSON.stringify({
    storeName: "Disabled", shippingFeeMad: 12, freeShippingThresholdMad: 1000,
    upsellEnabled: false, upsellWindowSeconds: 1, upsellDiscountPercent: 10,
  }));
  const { response } = service().checkout("disabled-upsell-key", checkoutInput());
  assert.equal(response.upsellOffer, null); assert.equal(response.totals.shipping, 12);
  assert.equal(db.prepare("SELECT upsell_status FROM orders WHERE id = ?").get(response.orderId).upsell_status, "closed");
  db.prepare("DELETE FROM app_state WHERE key = 'store_settings'").run();
});

test("decline, expiry and confirmation close atomically without a discounted addition", () => {
  for (const mode of ["decline", "expiry", "confirmation", "cancelled"]) {
    const { response } = service().checkout(`closure-${mode}`, checkoutInput());
    if (mode === "decline") {
      const declined = service().resolveUpsell(response.orderId, "decline-request", response.orderToken, { action: "decline" });
      assert.equal(declined.upsellStatus, "declined");
      assert.deepEqual(service().resolveUpsell(response.orderId, "decline-request", response.orderToken, { action: "decline" }), declined);
    } else if (mode === "expiry") {
      db.prepare("UPDATE orders SET upsell_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(response.orderId);
    } else {
      db.transaction(() => {
        closePendingStorefrontUpsell(db, response.orderId);
        db.prepare("UPDATE orders SET confirmation_status = ? WHERE id = ?").run(mode === "cancelled" ? "cancelled" : "confirmed", response.orderId);
      }).immediate();
    }
    assert.throws(() => service().resolveUpsell(response.orderId, "late-accept-request", response.orderToken,
      { action: "accept", variantId: "offer-v" }), { status: 409 });
    if (mode === "expiry") {
      assert.ok(service().expirePendingOffers() >= 1);
      assert.equal(db.prepare("SELECT upsell_status FROM orders WHERE id = ?").get(response.orderId).upsell_status, "expired");
    }
    assert.equal(db.prepare("SELECT upsell_items_json FROM orders WHERE id = ?").get(response.orderId).upsell_items_json, null);
  }
});

test("Meta attribution freezes once and queues one purchase without transport-derived data", () => {
  const { finalizeMetaPurchases } = loadSource("@/lib/services/meta");
  const meta = { eventId: "11111111-1111-4111-8111-111111111111", sourceUrl: "https://store.example/product?private=yes",
    clientIpAddress: "192.0.2.12", clientUserAgent: "Storefront browser" };
  const first = service().checkout("meta-checkout-key", checkoutInput({ meta }));
  assert.equal(db.prepare("SELECT snapshot_json FROM meta_purchases WHERE order_id = ?").get(first.response.orderId).snapshot_json, null);
  service().resolveUpsell(first.response.orderId, "meta-accept-key", first.response.orderToken, { action: "accept", variantId: "offer-v" });
  const purchase = db.prepare("SELECT * FROM meta_purchases WHERE order_id = ?").get(first.response.orderId);
  assert.equal(JSON.parse(purchase.snapshot_json).total, 399);
  finalizeMetaPurchases(); finalizeMetaPurchases();
  const events = db.prepare("SELECT * FROM meta_events WHERE event_id = ?").all(meta.eventId);
  assert.equal(events.length, 1);
  const payload = JSON.parse(events[0].payload_json);
  assert.equal(payload.user_data.client_ip_address, "192.0.2.12");
  assert.equal(payload.event_source_url, "https://store.example/product");
  const count = requestCount();
  assert.throws(() => service().checkout("meta-duplicate-key", checkoutInput({ meta })), { code: "META_EVENT_CONFLICT" });
  assert.equal(requestCount(), count);
});

function worker(mode, payload = {}) {
  const source = `import { loadSource } from ${JSON.stringify(new URL("./test-source.mjs", import.meta.url).href)};
    const {getDb, closePendingStorefrontUpsell} = loadSource('@/lib/db');
    const {createStorefrontOrderService} = loadSource('@/lib/services/storefront-orders');
    const db = getDb(); const port = (${catalogPort.toString()})(db);
    const service = createStorefrontOrderService({db, catalog:port});
    const payload = ${JSON.stringify(payload)}; const mode = ${JSON.stringify(mode)};
    process.send({ready:true}); process.once('message', () => {
      try {
        if(mode === 'crash') {
          db.function('crash_checkout', () => process.exit(33));
          db.exec("CREATE TEMP TRIGGER crash_receipt BEFORE INSERT ON storefront_request_receipts BEGIN SELECT crash_checkout(); END");
        }
        let result;
        if(mode === 'confirm') result = db.transaction(() => {
          closePendingStorefrontUpsell(db, payload.orderId);
          db.prepare("UPDATE orders SET confirmation_status = 'confirmed' WHERE id = ?").run(payload.orderId);
          return 'confirmed';
        }).immediate();
        else if(mode === 'accept' || mode === 'decline') result = service.resolveUpsell(payload.orderId, payload.key,
          payload.token, mode === 'accept' ? {action:'accept',variantId:'offer-v'} : {action:'decline'});
        else result = service.checkout(payload.key, payload.input);
        process.send({result});
      } catch(e) { process.send({error:{message:e.message, status:e.status, code:e.code}}); }
      db.close(); process.disconnect();
    });`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
    cwd: process.cwd(), env: { ...process.env }, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let output = ""; child.stderr.on("data", (chunk) => { output += chunk; });
  let message;
  const ready = new Promise((resolve, reject) => {
    child.on("message", (value) => { if (value.ready) resolve(); else message = value; });
    child.once("error", reject);
    child.once("exit", (code) => { if (code && code !== 33) reject(new Error(output || `worker exit ${code}`)); });
  });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 || code === 33 ? resolve({ ...message, exitCode: code }) : reject(new Error(output)));
  });
  return { ready, go: () => child.send("go"), done };
}
async function race(workers) {
  await Promise.all(workers.map((w) => w.ready));
  for (const w of workers) w.go();
  return Promise.all(workers.map((w) => w.done));
}

test("separate processes serialize identical checkout retries into one durable order", async () => {
  const payload = { key: "process-checkout-key", input: checkoutInput() };
  const results = await race([worker("checkout", payload), worker("checkout", payload)]);
  assert.ok(results.every((r) => !r.error), JSON.stringify(results));
  assert.deepEqual(results.map((r) => r.result.status).sort(), [200, 201]);
  assert.deepEqual(results[0].result.response, results[1].result.response);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM storefront_request_receipts WHERE request_key = ?").get(payload.key).n, 1);
});

test("process death before receipt commit rolls back order, Meta and receipt; retry creates once", async () => {
  const before = db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
  const meta = { eventId: "22222222-2222-4222-8222-222222222222", sourceUrl: "https://store.example/cart" };
  const payload = { key: "crash-checkout-key", input: checkoutInput({ meta }) };
  const crashed = worker("crash", payload); await crashed.ready; crashed.go();
  assert.equal((await crashed.done).exitCode, 33);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, before);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM meta_purchases WHERE event_id = ?").get(meta.eventId).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM storefront_request_receipts WHERE request_key = ?").get(payload.key).n, 0);
  const results = await race([worker("checkout", payload), worker("checkout", payload)]);
  assert.deepEqual(results.map((r) => r.result.status).sort(), [200, 201]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, before + 1);
});

test("two-process upsell retry/confirmation races never append twice or mutate after closure", async () => {
  const first = service().checkout("process-upsell-key", checkoutInput()).response;
  const payload = { orderId: first.orderId, token: first.orderToken, key: "process-accept-key" };
  const results = await race([worker("accept", payload), worker("accept", payload)]);
  assert.deepEqual(results[0].result, results[1].result);
  assert.equal(db.prepare("SELECT subtotal FROM orders WHERE id = ?").get(first.orderId).subtotal, 370);
  for (let i = 0; i < 3; i++) {
    const next = service().checkout(`confirm-race-${i}`, checkoutInput()).response;
    const p = { orderId: next.orderId, token: next.orderToken, key: `confirm-accept-${i}` };
    const raceResults = await race([worker("accept", p), worker("confirm", p)]);
    const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(next.orderId);
    assert.equal(row.confirmation_status, "confirmed");
    assert.ok(["accepted", "closed"].includes(row.upsell_status));
    assert.equal(row.subtotal, row.upsell_status === "accepted" ? 370 : 300);
    const accept = raceResults[0];
    if (row.upsell_status === "closed") assert.equal(accept.error.status, 409);
    else assert.equal(accept.result.upsellStatus, "accepted");
  }
  const expired = service().checkout("process-expired-key", checkoutInput()).response;
  db.prepare("UPDATE orders SET upsell_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(expired.orderId);
  const late = await race([worker("accept", { orderId: expired.orderId, token: expired.orderToken, key: "expired-process-key" })]);
  assert.equal(late[0].error.status, 409);
  assert.equal(db.prepare("SELECT subtotal FROM orders WHERE id = ?").get(expired.orderId).subtotal, 300);
  const opposite = service().checkout("opposite-race-key", checkoutInput()).response;
  const opposed = await race([
    worker("accept", { orderId: opposite.orderId, token: opposite.orderToken, key: "opposed-accept-key" }),
    worker("decline", { orderId: opposite.orderId, token: opposite.orderToken, key: "opposed-decline-key" }),
  ]);
  assert.equal(opposed.filter((r) => r.result).length, 1);
  assert.equal(opposed.filter((r) => r.error?.status === 409).length, 1);
  assert.deepEqual(db.pragma("foreign_key_check"), []);
});

test("busy failures are explicitly retryable with the same key", async () => {
  const Database = loadSource("better-sqlite3");
  const blocker = new Database(process.env.DB_PATH);
  blocker.exec("BEGIN IMMEDIATE");
  db.pragma("busy_timeout = 1");
  try {
    assert.throws(() => service().checkout("busy-retry-key", checkoutInput()), { status: 503, code: "RETRY_REQUEST" });
  } finally {
    blocker.exec("ROLLBACK"); blocker.close(); db.pragma("busy_timeout = 5000");
  }
  assert.equal(service().checkout("busy-retry-key", checkoutInput()).status, 201);
  assert.equal(service().checkout("busy-retry-key", checkoutInput()).status, 200);
});

test("lifecycle API enforces login, validates batches, and rejects agent deletion", async () => {
  const originalLoad = Module._load;
  let role = null;
  class GuardError extends Error {
    toResponse() { return Response.json({ error: "Authentification requise." }, { status: 401 }); }
  }
  Module._load = function (request, ...args) {
    if (request === "@/lib/auth-guards") return {
      AuthGuardError: GuardError,
      requireUser: async () => { if (!role) throw new GuardError(); return { id: "api-user", role }; },
    };
    return originalLoad.call(this, request, ...args);
  };
  try {
    const { POST } = loadSource("@/app/api/crm/orders/lifecycle/route");
    const request = (body) => new Request("http://localhost/api/crm/orders/lifecycle", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    });
    assert.equal((await POST(request({}))).status, 401);
    role = "agent";
    assert.equal((await POST(request({ ids: [], action: "archive" }))).status, 400);
    assert.equal((await POST(request({ ids: Array(101).fill("eligible"), action: "archive" }))).status, 400);
    assert.equal((await POST(request({ ids: ["eligible"], action: "delete" }))).status, 403);
    assert.ok(getOrder("eligible"));
    assert.equal((await POST(request({ ids: ["missing"], action: "restore" }))).status, 404);
    const restored = await POST(request({ ids: ["eligible"], action: "restore" }));
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).count, 1);
    role = "admin";
    order("api-delete");
    assert.equal((await POST(request({ ids: ["api-delete"], action: "archive" }))).status, 200);
    assert.equal((await POST(request({ ids: ["api-delete"], action: "delete" }))).status, 200);
    assert.equal(getOrder("api-delete"), null);
  } finally { Module._load = originalLoad; }
});

// Pack pricing: discounted subtotal drives shipping, upsell accept and agent edits.
test("pack orders: upsell accept keeps the pack discount; agent manual edits keep the explicit fixed discount; default pack mode recomputes", () => {
  const { editOrder, getOrderEditState } = loadSource("@/lib/services/order-edits");
  db.prepare("UPDATE products SET price = 300, active = 1, name = 'cart' WHERE id = 'cart'").run();
  db.prepare("UPDATE products SET price = 100, active = 1, name = 'offer' WHERE id = 'offer'").run();
  db.prepare(`INSERT OR REPLACE INTO app_state(key, value) VALUES ('store_settings', ?)`)
    .run(JSON.stringify({ storeName: "Pack", shippingFeeMad: 29, freeShippingThresholdMad: 500,
      upsellEnabled: true, upsellWindowSeconds: 300, upsellDiscountPercent: 30 }));
  const pack = { id: "pack-2", quantity: 2, price: 500, highlight: false };
  const packService = () => createStorefrontOrderService({ db,
    catalog: { ...catalogPort(db), getActivePacks: () => ({ cart: [pack] }) } });
  const two = checkoutInput({ items: [{ variantId: "cart-v", qty: 2 }] });

  // 600 regular, 100 saved; discounted 500 reaches the 500 free-shipping threshold.
  const first = packService().checkout("pack-upsell-key", two).response;
  assert.equal(first.totals.packDiscount, 100);
  let row = db.prepare("SELECT * FROM orders WHERE id = ?").get(first.orderId);
  assert.deepEqual([row.subtotal, row.discount_amount, row.discount_type, row.discount_value, row.shipping, row.total],
    [600, 100, "fixed", 100, 0, 500]);
  assert.equal(JSON.parse(row.pack_snapshot_json)[0].packId, "pack-2");

  const accepted = packService().resolveUpsell(first.orderId, "pack-upsell-accept", first.orderToken,
    { action: "accept", variantId: "offer-v" });
  row = db.prepare("SELECT * FROM orders WHERE id = ?").get(first.orderId);
  assert.equal(row.upsell_status, "accepted");
  assert.deepEqual([row.subtotal, row.discount_amount, row.shipping, row.total], [670, 100, 0, 570]);
  assert.equal(accepted.totals.total, 570);
  assert.equal(accepted.totals.itemsSubtotal, 670);

  // Shipping is computed on the discounted subtotal: 590 regular but 490 discounted pays shipping.
  const cheap = packService().checkout("pack-ship-key", two).response;
  db.prepare(`INSERT OR REPLACE INTO app_state(key, value) VALUES ('store_settings', ?)`)
    .run(JSON.stringify({ storeName: "Pack", shippingFeeMad: 29, freeShippingThresholdMad: 550,
      upsellEnabled: true, upsellWindowSeconds: 300, upsellDiscountPercent: 30 }));
  const paid = packService().checkout("pack-ship-key-2", two).response;
  assert.equal(paid.totals.shipping, 29);
  assert.equal(paid.totals.total, 529);
  assert.equal(cheap.totals.shipping, 0);

  // Edit in explicit manual mode: quantity 2 -> 1 with the fixed discount submitted by the agent is honored as an
  // audited agent discount, and manual mode clears pack_snapshot_json. Without a mode, an order that has a pack
  // snapshot defaults to pack mode: the submitted discount is ignored and recomputed from product_packs.
  const edit = (orderId, extra) => {
    const state = getOrderEditState(orderId);
    return editOrder(orderId, { revision: state.revision, lines: [{ variantId: "cart-v", qty: 1 }],
      discountMode: "manual", discountType: "fixed", discountValue: 100, shippingMode: "auto", reason: "Test modification", ...extra }, agent);
  };
  edit(paid.orderId, {});
  row = db.prepare("SELECT * FROM orders WHERE id = ?").get(paid.orderId);
  assert.deepEqual([row.subtotal, row.discount_amount, row.shipping, row.total], [300, 100, 29, 229]);
  assert.equal(row.pack_snapshot_json, null);
  // A fixed discount above the remaining items is rejected with a French message.
  assert.throws(() => edit(paid.orderId, { discountValue: 301 }),
    (error) => error.status === 400 && /remise ne peut pas dépasser/.test(error.message));
  // Agent can drop the stale discount explicitly.
  edit(paid.orderId, { discountType: "none", discountValue: 0 });
  row = db.prepare("SELECT * FROM orders WHERE id = ?").get(paid.orderId);
  assert.deepEqual([row.subtotal, row.discount_amount, row.total], [300, 0, 329]);
  // Omitting discountMode on an order that still has a pack snapshot defaults to pack mode: quantity 1 matches
  // no pack, so the submitted fixed discount is ignored and the snapshot is cleared.
  assert.ok(db.prepare("SELECT pack_snapshot_json FROM orders WHERE id = ?").get(cheap.orderId).pack_snapshot_json);
  edit(cheap.orderId, { discountMode: undefined });
  row = db.prepare("SELECT * FROM orders WHERE id = ?").get(cheap.orderId);
  assert.deepEqual([row.subtotal, row.discount_amount, row.shipping, row.total], [300, 0, 29, 329]);
  assert.equal(row.pack_snapshot_json, null);
});
