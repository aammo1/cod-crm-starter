import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-dashboard-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";
process.env.OZON_POLL_INTERVAL_MIN = "30";

const { getDb } = loadSource("@/lib/db");
import { createOrder } from "./fulfillment-fixtures.mjs";
const { getDashboard } = loadSource("@/lib/services/dashboard");
const { getCustomerHistory, insertContact, listOrders } = loadSource("@/lib/services/orders");
const { openStock } = loadSource("@/lib/services/inventory");
const { getTrackingHealth, setAppState, TRACKING_LAST_SYNC_KEY } = loadSource("@/lib/services/tracking");
const db = getDb();
const now = new Date();
const iso = (offsetMin = 0) => new Date(now.getTime() + offsetMin * 60_000).toISOString();

after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
  VALUES ('p', 'p', 'Lampe', 'maison', 300, ?, ?), ('p-off', 'p-off', 'Archive', 'maison', 300, ?, ?)`)
  .run(iso(), iso(), iso(), iso());
db.prepare("UPDATE products SET active = 0 WHERE id = 'p-off'").run();

let n = 0;
function parcel({ tracking, normalized, status = "submitted", lastSync = null, created = iso() }) {
  const id = `d${++n}`;
  createOrder({ id, customerName: `Cliente ${n}`, customerPhone: "+212612345678",
    items: [{ product_id: "p", variant_id: "low", sku: "LOW", name: "Lampe", variant_label: "USB", options: [{ name: "Alimentation", value: "USB" }], quantity: 1, unit_price: 300, line_total: 300 }],
    upsellOffer: null, subtotal: 300, shipping: 29, total: 329 });
  db.prepare("UPDATE orders SET confirmation_status = 'confirmed' WHERE id = ?").run(id);
  db.prepare(`INSERT INTO courier_submissions
    (id, order_id, status, tracking_number, normalized_status, last_sync_at, next_retry_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`s${id}`, id, status, tracking, normalized, lastSync, created, created, created);
  return { id, sub: `s${id}` };
}

test("in-transit card counts and links only parcels in a transit status; rows are bounded", () => {
  for (let i = 0; i < 7; i++) parcel({ tracking: `T${i}`, normalized: "in_transit", lastSync: iso() });
  parcel({ tracking: "TU", normalized: "unknown", lastSync: iso() });
  parcel({ tracking: "TD", normalized: "delivered", lastSync: iso() });

  const card = getDashboard(now).inTransit;
  assert.equal(card.count, 7);
  assert.equal(card.rows.length, 5);
  assert.equal(card.unknownCount, 1);
  assert.equal(card.unknownRows.length, 1);

  const filtered = listOrders({ status: "all", tracking: ["in_transit", "out_for_delivery", "at_facility"], pageSize: 100 });
  assert.equal(filtered.orders.length, 7);
  assert.equal(listOrders({ status: "all", tracking: ["delivered"] }).orders.length, 1);
  // Unknown filter values are dropped (no filtering at all, never an injection point).
  assert.ok(listOrders({ status: "all", tracking: ["x'; DROP TABLE orders;--"], pageSize: 100 }).orders.length >= 9);
});

test("returns card only lists active returns and counts them in SQL", () => {
  const states = ["returning", "returning", "received", "inspected", "inspected"];
  states.forEach((status, i) => {
    const p = parcel({ tracking: `R${i}`, normalized: "refused", lastSync: iso() });
    db.prepare(`INSERT INTO returns (id, submission_id, status, created_at)
      VALUES (?, ?, ?, ?)`).run(`ret${i}`, p.sub, status, iso(i));
  });
  const card = getDashboard(now).returns;
  assert.equal(card.returningCount, 2);
  assert.equal(card.receivedCount, 1);
  assert.equal(card.rows.length, 3);
  assert.ok(card.rows.every((row) => row.status !== "inspected"));
});

test("low stock covers active variants only and counts a missing balance as zero", () => {
  for (const [id, product, sku, active] of [["low", "p", "LOW", 1], ["nobalance", "p", "NOBAL", 1], ["inactive", "p", "INACT", 0], ["archived", "p-off", "ARCH", 1], ["fine", "p", "FINE", 1]]) {
    db.prepare("INSERT INTO variants (id, product_id, sku, label, options_json, options_key, active) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, product, sku, id, JSON.stringify([{ name: "Alimentation", value: id }]), JSON.stringify([["alimentation", id]]), active);
  }
  openStock("low", 1, "t");
  openStock("fine", 50, "t");
  openStock("inactive", 0, "t");
  openStock("archived", 0, "t");
  const skus = getDashboard(now).lowStockItems.rows.map((r) => r.sku).sort();
  assert.deepEqual(skus, ["LOW", "NOBAL"]);
});

test("tracking health flags stale parcels even when the global sync looks fresh", () => {
  db.prepare("UPDATE courier_submissions SET status = 'failed'").run(); // isolate this scenario
  setAppState(TRACKING_LAST_SYNC_KEY, iso(-1));
  assert.deepEqual(
    [getTrackingHealth(now).failing, getTrackingHealth(now).staleParcels], [false, 0]);

  const fresh = parcel({ tracking: "H1", normalized: "in_transit", lastSync: iso(-5) });
  const stale = parcel({ tracking: "H2", normalized: "in_transit", lastSync: iso(-120) });
  const oldNeverSynced = parcel({ tracking: "H3", normalized: null, created: iso(-300) });
  const newlySubmitted = parcel({ tracking: "H4", normalized: null, created: iso(-5) });
  const delivered = parcel({ tracking: "H5", normalized: "delivered", lastSync: iso(-500) });
  assert.ok([fresh, stale, oldNeverSynced, newlySubmitted, delivered].length === 5);

  const health = getTrackingHealth(now);
  assert.equal(health.staleParcels, 2); // H2 and H3 only
  assert.equal(health.failing, true);
  assert.equal(getDashboard(now).syncHealth.failing, true);
  assert.equal(getDashboard(now).syncHealth.staleParcels, 2);

  db.prepare("UPDATE courier_submissions SET last_sync_at = ? WHERE tracking_number IN ('H2', 'H3')").run(iso(-1));
  assert.equal(getTrackingHealth(now).failing, false);
});

test("new-order and callback cards exclude archived orders, matching their linked lists", () => {
  for (const id of ["arch-live", "arch-hidden"]) {
    createOrder({ id, customerName: "Cliente archive", customerPhone: "+212612345678",
      items: [{ product_id: "p", variant_id: "low", sku: "LOW", name: "Lampe", variant_label: "USB", options: [], quantity: 1, unit_price: 300, line_total: 300 }],
      upsellOffer: null, subtotal: 300, shipping: 29, total: 329 });
  }
  db.prepare("UPDATE orders SET archived_at = ? WHERE id = 'arch-hidden'").run(iso());
  const dashboard = getDashboard(now);
  assert.equal(dashboard.newOrders.count, listOrders({ status: "new", pageSize: 100 }).total);
  assert.ok(!dashboard.newOrders.rows.some((row) => row.orderId === "arch-hidden"));
  assert.equal(dashboard.callbacksDue.count, listOrders({ status: "all", callbackDue: true, pageSize: 100 }).total);
});

test("customer history counts other orders of the same phone and list rows expose no-answer attempts", () => {
  const line = [{ product_id: "p", variant_id: "low", sku: "LOW", name: "Lampe", variant_label: "USB", options: [], quantity: 1, unit_price: 300, line_total: 300 }];
  for (const id of ["hist-now", "hist-old-1", "hist-old-2"]) {
    createOrder({ id, customerName: "Cliente historique", customerPhone: "+212 6 11 22 33 44",
      items: line, upsellOffer: null, subtotal: 300, shipping: 29, total: 329 });
  }
  db.prepare("UPDATE orders SET confirmation_status = 'cancelled' WHERE id IN ('hist-old-1', 'hist-old-2')").run();
  const history = getCustomerHistory("hist-now", "+212611223344");
  assert.equal(history.orderCount, 2);
  assert.equal(history.cancelledCount, 2);
  assert.ok(!history.recent.some((o) => o.id === "hist-now"));
  assert.equal(getCustomerHistory("hist-now", "+212600000000").orderCount, 0);

  insertContact({ orderId: "hist-now", agentId: null, channel: "phone", outcome: "no_answer" });
  insertContact({ orderId: "hist-now", agentId: null, channel: "phone", outcome: "no_answer" });
  const row = listOrders({ status: "all", q: "hist-now", pageSize: 100 }).orders.find((o) => o.id === "hist-now");
  assert.equal(row.noAnswerCount, 2);
});
