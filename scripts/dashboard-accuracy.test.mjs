import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zehri-dashboard-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";
process.env.OZON_POLL_INTERVAL_MIN = "30";

const { createOrder, getDb } = loadSource("@/lib/db");
const { getDashboard } = loadSource("@/lib/services/dashboard");
const { listOrders } = loadSource("@/lib/services/orders");
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
  VALUES ('p', 'p', 'Bottines', 'bottines', 300, ?, ?), ('p-off', 'p-off', 'Archive', 'bottines', 300, ?, ?)`)
  .run(iso(), iso(), iso(), iso());
db.prepare("UPDATE products SET active = 0 WHERE id = 'p-off'").run();
db.prepare("INSERT INTO product_colors (id, product_id, name) VALUES ('c', 'p', 'Noir'), ('c-off', 'p-off', 'Noir')").run();

let n = 0;
function parcel({ tracking, normalized, status = "submitted", lastSync = null, created = iso() }) {
  const id = `d${++n}`;
  createOrder({ id, customerName: `Cliente ${n}`, customerPhone: "+212612345678",
    items: [{ product_id: "p", name: "Bottines", color: "Noir", size: "38", quantity: 1, unit_price: 300, line_total: 300 }],
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
  db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES ('low', 'p', 'c', '36', 'LOW')").run();
  db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES ('nobalance', 'p', 'c', '37', 'NOBAL')").run();
  db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku, active) VALUES ('inactive', 'p', 'c', '38', 'INACT', 0)").run();
  db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES ('archived', 'p-off', 'c-off', '38', 'ARCH')").run();
  db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES ('fine', 'p', 'c', '39', 'FINE')").run();
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
