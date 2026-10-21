import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zehri-returns-workflow-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";

const { createOrder, getDb } = loadSource("@/lib/db");
const inventory = loadSource("@/lib/services/inventory");
const { ensureReturn, markReturnReceived } = loadSource("@/lib/services/returns");
const { openStock, reserveForOrder, dispatchOrder, receiveReturnLines, getDispatchedVariants } = inventory;
const db = getDb();
const actor = "test-agent";
const now = new Date().toISOString();

after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
  VALUES ('p', 'p', 'Bottines test', 'bottines', 300, ?, ?)`).run(now, now);
db.prepare("INSERT INTO product_colors (id, product_id, name) VALUES ('c', 'p', 'Noir')").run();
for (const [id, size] of [["v38", "38"], ["v39", "39"]]) {
  db.prepare(`INSERT INTO variants (id, product_id, color_id, size, sku)
    VALUES (?, 'p', 'c', ?, ?)`).run(id, size, id);
  openStock(id, 10, actor);
}

const physical = (id) => db.prepare("SELECT physical, reserved, quarantine FROM stock_balances WHERE variant_id = ?").get(id);

// Dispatches `lines` ([variantId, qty]) for a fresh order and returns a received return.
function receivedReturn(orderId, lines) {
  createOrder({
    id: orderId, customerName: "Cliente", customerPhone: "+212612345678",
    items: [{ product_id: "p", name: "Bottines test", color: "Noir", size: "38", quantity: 1, unit_price: 300, line_total: 300 }],
    subtotal: 300, shipping: 29, total: 329,
  });
  reserveForOrder(orderId, lines.map(([variantId, qty]) => ({ variantId, qty })), actor, "test");
  dispatchOrder(orderId, actor);
  const submissionId = `sub_${orderId}`;
  db.prepare(`INSERT INTO courier_submissions (id, order_id, status, next_retry_at, created_at, updated_at)
    VALUES (?, ?, 'submitted', ?, ?, ?)`).run(submissionId, orderId, now, now, now);
  const ret = ensureReturn(submissionId, "test");
  markReturnReceived(ret.id, actor);
  return { submissionId, returnId: ret.id };
}

test("main item + upsell of a different variant are restocked per variant", () => {
  const before38 = physical("v38");
  const before39 = physical("v39");
  const { submissionId, returnId } = receivedReturn("o1", [["v38", 1], ["v39", 1]]);
  assert.deepEqual(getDispatchedVariants("o1").map((d) => d.variantId).sort(), ["v38", "v39"]);

  receiveReturnLines(submissionId, "o1", [
    { variantId: "v38", sellableQty: 1, damagedQty: 0 },
    { variantId: "v39", sellableQty: 0, damagedQty: 1 },
  ], actor, `ret-${returnId}`);

  // v38: dispatched -1 then sellable +1 → unchanged; v39: damaged goes to quarantine.
  assert.equal(physical("v38").physical, before38.physical);
  assert.equal(physical("v38").quarantine, 0);
  assert.equal(physical("v39").physical, before39.physical);
  assert.equal(physical("v39").quarantine, 1);

  const lines = db.prepare("SELECT * FROM return_lines WHERE return_id = ? ORDER BY variant_id").all(returnId);
  assert.deepEqual(lines.map((l) => [l.variant_id, l.dispatched_qty, l.sellable_qty, l.damaged_qty]),
    [["v38", 1, 1, 0], ["v39", 1, 0, 1]]);
  const ret = db.prepare("SELECT * FROM returns WHERE id = ?").get(returnId);
  assert.deepEqual([ret.status, ret.sellable_qty, ret.damaged_qty], ["inspected", 1, 1]);
});

test("replay is a no-op and a mismatching replay is rejected", () => {
  const { submissionId, returnId } = receivedReturn("o2", [["v38", 2], ["v39", 1]]);
  const args = [{ variantId: "v38", sellableQty: 2, damagedQty: 0 }, { variantId: "v39", sellableQty: 1, damagedQty: 0 }];
  receiveReturnLines(submissionId, "o2", args, actor, `ret-${returnId}`);
  const snapshot = [physical("v38"), physical("v39")];
  receiveReturnLines(submissionId, "o2", args, actor, `ret-${returnId}`);
  assert.deepEqual([physical("v38"), physical("v39")], snapshot);
  assert.throws(() => receiveReturnLines(submissionId, "o2",
    [{ variantId: "v38", sellableQty: 1, damagedQty: 0 }], actor, `ret-${returnId}`));
  assert.deepEqual(physical("v38"), snapshot[0]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE ref LIKE ?").get(`ret-%:ret-${returnId}:%`).n, 2);
});

test("quantities are bounded per dispatched variant and never partially applied", () => {
  const { submissionId, returnId } = receivedReturn("o3", [["v38", 1], ["v39", 1]]);
  const snapshot = [physical("v38"), physical("v39")];
  // v39 within bounds, v38 over (sellable + damaged = 2 > 1): nothing may be applied.
  assert.throws(() => receiveReturnLines(submissionId, "o3", [
    { variantId: "v39", sellableQty: 1, damagedQty: 0 },
    { variantId: "v38", sellableQty: 1, damagedQty: 1 },
  ], actor, `ret-${returnId}`), /supérieure/);
  // Duplicate entries for one variant are merged before the bound check.
  assert.throws(() => receiveReturnLines(submissionId, "o3", [
    { variantId: "v38", sellableQty: 1, damagedQty: 0 },
    { variantId: "v38", sellableQty: 1, damagedQty: 0 },
  ], actor, `ret-${returnId}`), /supérieure/);
  // A variant that was not dispatched for this order is rejected.
  const { submissionId: s4, returnId: r4 } = receivedReturn("o4", [["v38", 1]]);
  assert.throws(() => receiveReturnLines(s4, "o4",
    [{ variantId: "v39", sellableQty: 1, damagedQty: 0 }], actor, `ret-${r4}`), /n'a pas été expédiée/);
  assert.equal(db.prepare("SELECT status FROM returns WHERE id = ?").get(returnId).status, "received");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM return_lines WHERE return_id = ?").get(returnId).n, 0);
  assert.deepEqual(physical("v39"), snapshot[1]);
});

test("a main item and an upsell sharing one variant are merged against the dispatched quantity", () => {
  const { submissionId, returnId } = receivedReturn("o5", [["v38", 2]]);
  receiveReturnLines(submissionId, "o5", [
    { variantId: "v38", sellableQty: 1, damagedQty: 0 },
    { variantId: "v38", sellableQty: 0, damagedQty: 1 },
  ], actor, `ret-${returnId}`);
  const lines = db.prepare("SELECT * FROM return_lines WHERE return_id = ?").all(returnId);
  assert.deepEqual(lines.map((l) => [l.dispatched_qty, l.sellable_qty, l.damaged_qty]), [[2, 1, 1]]);
});

test("a finalized partial inspection cannot add variants or switch the sellable/damaged split on replay", () => {
  const { submissionId, returnId } = receivedReturn("immutable-partial", [["v38", 2], ["v39", 1]]);
  const args = [{ variantId: "v38", sellableQty: 1, damagedQty: 0 }];
  receiveReturnLines(submissionId, "immutable-partial", args, actor, `ret-${returnId}`);
  const before = [physical("v38"), physical("v39")];
  for (const lines of [
    [{ variantId: "v38", sellableQty: 0, damagedQty: 1 }],
    [...args, { variantId: "v39", sellableQty: 1, damagedQty: 0 }],
  ]) {
    assert.throws(() => receiveReturnLines(submissionId, "immutable-partial", lines, actor, `ret-${returnId}`), inventory.InventoryConflictError);
  }
  assert.deepEqual([physical("v38"), physical("v39")], before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM return_lines WHERE return_id = ?").get(returnId).n, 1);
});
