import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-returns-workflow-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";
globalThis.fetch = async () => { throw new Error("HTTP disabled in isolated fulfillment tests"); };

const { getDb } = loadSource("@/lib/db");
import { createOrder } from "./fulfillment-fixtures.mjs";
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
  VALUES ('p', 'p', 'Sérum test', 'soins', 300, ?, ?)`).run(now, now);
for (const [id, label] of [["v38", "250 ml"], ["v39", "500 ml"]]) {
  db.prepare(`INSERT INTO variants (id, product_id, label, options_json, options_key, sku)
    VALUES (?, 'p', ?, ?, ?, ?)`).run(id, label, JSON.stringify([{ name: "Contenance", value: label }]), JSON.stringify([["contenance", label]]), id);
  openStock(id, 10, actor);
}

const physical = (id) => db.prepare("SELECT physical, reserved, quarantine FROM stock_balances WHERE variant_id = ?").get(id);

// Dispatches `lines` ([variantId, qty]) for a fresh order and returns a received return.
function receivedReturn(orderId, lines) {
  createOrder({
    id: orderId, customerName: "Cliente", customerPhone: "+212612345678",
    items: lines.map(([variantId, qty]) => ({ product_id: "p", variant_id: variantId, sku: variantId,
      name: "Sérum test", variant_label: variantId === "v38" ? "250 ml" : "500 ml",
      options: [{ name: "Contenance", value: variantId === "v38" ? "250 ml" : "500 ml" }],
      quantity: qty, unit_price: 300, line_total: 300 * qty })),
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

test("historical inactive variants resolve by exact ID despite renamed catalog labels", () => {
  const { submissionId, returnId } = receivedReturn("archived", [["v38", 1], ["v39", 1]]);
  const snapshots = JSON.parse(db.prepare("SELECT items_json FROM orders WHERE id = 'archived'").get().items_json);
  db.prepare("UPDATE variants SET active = 0, label = 'Libellé modifié' WHERE product_id = 'p'").run();
  db.prepare("UPDATE products SET active = 0, name = 'Produit renommé' WHERE id = 'p'").run();
  try {
    assert.deepEqual(snapshots.map(inventory.resolveVariantForLine), ["v38", "v39"]);
    assert.deepEqual(snapshots.map((item) => item.variant_label), ["250 ml", "500 ml"]);
    assert.equal(inventory.resolveVariantForLine({ ...snapshots[0], product_id: "another-product" }), null);
    receiveReturnLines(submissionId, "archived", [
      { variantId: "v38", sellableQty: 1, damagedQty: 0 },
      { variantId: "v39", sellableQty: 0, damagedQty: 1 },
    ], actor, returnId);
    assert.deepEqual(db.prepare("SELECT variant_id FROM return_lines WHERE return_id = ? ORDER BY variant_id").all(returnId), [{ variant_id: "v38" }, { variant_id: "v39" }]);
  } finally {
    db.prepare("UPDATE variants SET active = 1 WHERE product_id = 'p'").run();
    db.prepare("UPDATE products SET active = 1 WHERE id = 'p'").run();
  }
});

test("two processes inspecting one received return cannot duplicate stock or change the winning split", async () => {
  const { submissionId, returnId } = receivedReturn("inspection-race", [["v38", 1]]);
  const before = physical("v38");
  const childCode = `
    import { loadSource } from ${JSON.stringify(new URL("./test-source.mjs", import.meta.url).href)};
    const { getDb } = loadSource("@/lib/db");
    const { receiveReturnLines } = loadSource("@/lib/services/inventory");
    process.once("message", (input) => {
      try {
        receiveReturnLines(input.submissionId, "inspection-race", input.lines, "race-agent", input.returnId);
        process.send({ ok: true });
      } catch (error) { process.send({ ok: false, message: error.message }); }
      finally { getDb().close(); process.disconnect(); }
    });
    process.send({ ready: true });
  `;
  const children = [0, 1].map(() => spawn(process.execPath, ["--input-type=module", "--eval", childCode], {
    env: { ...process.env }, stdio: ["ignore", "ignore", "inherit", "ipc"],
  }));
  try {
    const ready = children.map((child) => new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("message", (message) => { assert.equal(message.ready, true); resolve(); });
      child.once("exit", () => reject(new Error("Inspection process exited before readiness")));
    }));
    const results = children.map((child) => new Promise((resolve, reject) => {
      let result;
      child.on("message", (message) => { if (!message.ready) result = message; });
      child.once("error", reject);
      child.once("exit", (code) => result && code === 0 ? resolve(result) : reject(new Error("Inspection process failed")));
    }));
    await Promise.all(ready);
    children.forEach((child, index) => child.send({ submissionId, returnId,
      lines: [{ variantId: "v38", sellableQty: index, damagedQty: 1 - index }] }));
    const outcomes = await Promise.all(results);
    assert.equal(outcomes.filter((result) => result.ok).length, 1);
    const saved = db.prepare("SELECT sellable_qty, damaged_qty FROM return_lines WHERE return_id = ?").get(returnId);
    assert.equal(saved.sellable_qty + saved.damaged_qty, 1);
    assert.deepEqual(physical("v38"), { ...before, physical: before.physical + 1, quarantine: before.quarantine + saved.damaged_qty });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE submission_id = ? AND kind IN ('receive_sellable', 'receive_quarantine')").get(submissionId).n, 1);
  } finally {
    children.forEach((child) => { if (child.exitCode === null) child.kill(); });
  }
});

test("a received return closes with zero units: no stock or ledger change, replay is idempotent", () => {
  const { returnId, submissionId } = receivedReturn("close-empty", [["v38", 1]]);
  const { closeReturnWithoutUnits } = loadSource("@/lib/services/returns");
  const before = physical("v38");
  const movements = () => db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n;
  const movementsBefore = movements();
  const closed = closeReturnWithoutUnits(returnId, "closed_empty", "Colis vide", actor);
  assert.equal(closed.status, "inspected");
  assert.equal(closed.reason, "[closed_empty] Colis vide");
  assert.deepEqual([closed.sellableQty, closed.damagedQty], [0, 0]);
  assert.deepEqual(physical("v38"), before);
  assert.equal(movements(), movementsBefore);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM return_lines WHERE return_id = ?").get(returnId).n, 0);
  assert.equal(closeReturnWithoutUnits(returnId, "lost", "autre", actor).reason, "[closed_empty] Colis vide");
  assert.ok(submissionId);
});

test("zero-unit closure rejects returns not yet received and returns already inspected with units", () => {
  const { closeReturnWithoutUnits } = loadSource("@/lib/services/returns");
  createOrder({ id: "close-early", customerName: "Cliente", customerPhone: "+212612345678",
    items: [{ product_id: "p", variant_id: "v38", sku: "v38", name: "Sérum test", variant_label: "250 ml",
      options: [], quantity: 1, unit_price: 300, line_total: 300 }], subtotal: 300, shipping: 29, total: 329 });
  reserveForOrder("close-early", [{ variantId: "v38", qty: 1 }], actor, "test");
  dispatchOrder("close-early", actor);
  db.prepare(`INSERT INTO courier_submissions (id, order_id, status, next_retry_at, created_at, updated_at)
    VALUES ('sub_close-early', 'close-early', 'submitted', ?, ?, ?)`).run(now, now, now);
  const early = ensureReturn("sub_close-early", "test");
  assert.throws(() => closeReturnWithoutUnits(early.id, "lost", "perdu", actor), /non reçu/);
  const inspected = receivedReturn("close-after", [["v38", 1]]);
  receiveReturnLines(inspected.submissionId, "close-after", [{ variantId: "v38", sellableQty: 1, damagedQty: 0 }], actor, inspected.returnId);
  assert.throws(() => closeReturnWithoutUnits(inspected.returnId, "closed_empty", "vide", actor), /déjà inspecté/);
});
