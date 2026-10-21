import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSource } from "./test-source.mjs";

const child = process.env.CRM_INVENTORY_CHILD;
const temp = child ? null : fs.mkdtempSync(path.join(os.tmpdir(), "crm-inventory-"));
if (temp) {
  process.env.DB_PATH = path.join(temp, "test.db");
  process.env.UPLOAD_DIR = path.join(temp, "uploads");
}
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";
const { getDb } = loadSource("@/lib/db");
const inventory = loadSource("@/lib/services/inventory");
const { stockAdjustSchema, stockOpeningSchema, stockBatchSchema } = loadSource("@/lib/services/inventory-schemas");
const { createProduct, updateProduct, getProductById } = loadSource("@/lib/services/catalog");
const db = getDb();
const actor = "inventory-admin";
const balance = id => db.prepare("SELECT physical, reserved, quarantine FROM stock_balances WHERE variant_id=? AND location='MAIN'").get(id);
const movementCount = () => db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n;
const batch = (requestId, mode, items, reason) => ({ requestId, mode, items, ...(reason ? { reason } : {}) });
const apply = request => inventory.applyStockBatch(request, actor);

if (child) {
  process.once("message", () => {
    try {
      const request = JSON.parse(process.env.CRM_INVENTORY_REQUEST);
      const result = request.mode ? apply(request) : inventory.reserveForOrder(request.orderId, request.lines, actor, "test");
      process.send({ ok: true, result });
    } catch (error) { process.send({ ok: false, name: error.name }); }
    finally { db.close(); process.disconnect(); }
  });
  process.send({ ready: true });
} else {
  after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  const now = new Date().toISOString();
  const productInput = slug => ({ slug, name: "Sérum test", category: "Beauté", price: 150,
    optionDefinitions: [{ name: "Contenance", values: ["30 ml", "500 ml", "XL"] }] });
  const product = createProduct(productInput("serum"));
  const standard = createProduct({ slug: "default", name: "Accessoire", category: "Accessoires", price: 100 });
  const adjust = product.variants[0].id, last = standard.variants[0].id, merged = product.variants[1].id;
  function variant(id) {
    // Generic raw fixture with no opening/balance: failure must roll it back.
    db.prepare(`INSERT INTO variants (id, product_id, sku, label, options_json, options_key)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, product.id, id, `Lot : ${id}`,
      JSON.stringify([{ name: "Lot", value: id }]), JSON.stringify([["lot", id]]));
    return id;
  }
  function order(id) {
    db.prepare(`INSERT INTO orders (id, customer_name, customer_phone, items_json, subtotal, shipping, total, upsell_status, created_at, updated_at)
      VALUES (?, 'Cliente test', '+212612345678', '[]', 0, 29, 29, 'declined', ?, ?)`).run(id, now, now);
  }
  async function race(requests) {
    const children = requests.map(request => fork(fileURLToPath(import.meta.url), [], {
      env: { ...process.env, CRM_INVENTORY_CHILD: "1", CRM_INVENTORY_REQUEST: JSON.stringify(request) },
      execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"],
    }));
    try {
      const results = children.map(proc => new Promise((resolve, reject) => {
        proc.on("error", reject);
        proc.on("message", message => { if (!message.ready) resolve(message); });
        proc.on("exit", code => { if (code !== 0) reject(new Error(`Child exit ${code}`)); });
      }));
      const exits = children.map(proc => new Promise(resolve => proc.once("exit", resolve)));
      await Promise.all(children.map(proc => new Promise(resolve => proc.once("message", message => { assert.equal(message.ready, true); resolve(); }))));
      children.forEach(proc => proc.send("go"));
      const outcomes = await Promise.all(results);
      await Promise.all(exits);
      return outcomes;
    } finally { children.forEach(proc => { if (proc.exitCode === null) proc.kill(); }); }
  }

  test("generic projection supports optionless and string-option variants at MAIN, including zero availability", () => {
    assert.equal(inventory.DEFAULT_LOCATION, "MAIN");
    const rows = inventory.listStockVariants();
    assert.deepEqual(rows.find(v => v.variantId === last).options, []);
    assert.equal(rows.find(v => v.variantId === last).label, "Standard");
    assert.equal(rows.find(v => v.variantId === merged).options[0].value, "500 ml");
    assert.equal(rows.find(v => v.variantId === merged).available, 0);
    assert.equal(rows.find(v => v.variantId === merged).productName, "Sérum test");
  });

  test("opening is creation-only, exact replay is safe, conflicting retry and opening after reception fail", () => {
    inventory.openStock(adjust, 10, actor);
    inventory.openStock(adjust, 10, actor);
    assert.throws(() => inventory.openStock(adjust, 11, actor), inventory.InventoryConflictError);
    const received = variant("received");
    apply(batch("received", "receive", [{ variantId: received, qty: 1 }]));
    assert.throws(() => inventory.openStock(received, 3, actor), inventory.InventoryConflictError);
    assert.equal(balance(adjust).physical, 10);
    assert.equal(inventory.listMovements({ variantId: adjust }).length, 1);
    assert.throws(() => inventory.openStock("missing", 1, actor), inventory.InventoryValidationError);
  });

  test("adjustments replay atomically, reject altered deltas, unsafe quantities and stock floors", () => {
    inventory.adjustStock(adjust, { physicalDelta: 2, quarantineDelta: 1 }, "Test", actor, "adjust-once");
    const before = balance(adjust), count = movementCount();
    inventory.adjustStock(adjust, { physicalDelta: 2, quarantineDelta: 1 }, "Test", actor, "adjust-once");
    for (const change of [{ physicalDelta: 2 }, { quarantineDelta: 1 }, { physicalDelta: 3, quarantineDelta: 1 }]) {
      assert.throws(() => inventory.adjustStock(adjust, change, "Test", actor, "adjust-once"), inventory.InventoryConflictError);
    }
    for (const change of [{ physicalDelta: -100 }, { quarantineDelta: 100 }, { physicalDelta: 0.5 },
      { quarantineDelta: -100 }, { physicalDelta: Number.MAX_SAFE_INTEGER }]) {
      assert.throws(() => inventory.adjustStock(adjust, change, "Test", actor, "invalid"));
    }
    assert.deepEqual(balance(adjust), before);
    assert.equal(movementCount(), count);
  });

  test("aggregated reserves and shortage metadata are generic; multi-line shortage rolls back all effects", () => {
    order("duplicates");
    const lines = [{ variantId: adjust, qty: 1 }, { variantId: adjust, qty: 1 }];
    inventory.reserveForOrder("duplicates", lines, actor, "test");
    const before = balance(adjust);
    inventory.reserveForOrder("duplicates", [{ variantId: adjust, qty: 2 }], actor, "test");
    assert.deepEqual(balance(adjust), before);
    assert.throws(() => inventory.reserveForOrder("duplicates", [{ variantId: adjust, qty: 3 }], actor, "test"), inventory.InventoryConflictError);
    order("shortage");
    const count = movementCount();
    assert.throws(() => inventory.reserveForOrder("shortage", [{ variantId: adjust, qty: 1 }, { variantId: merged, qty: 1 }], actor, "test"), error => {
      assert.equal(error.name, "InsufficientStockError");
      assert.equal(error.shortages[0].options[0].value, "500 ml");
      assert.equal(error.shortages[0].productName, "Sérum test");
      return true;
    });
    assert.deepEqual(balance(adjust), before);
    assert.equal(movementCount(), count);
  });

  test("two independent processes reserving the last default unit have exactly one winner", async () => {
    inventory.openStock(last, 1, actor);
    order("last-a"); order("last-b");
    const outcomes = await race(["last-a", "last-b"].map(orderId => ({ orderId, lines: [{ variantId: last, qty: 1 }] })));
    assert.equal(outcomes.filter(r => r.ok).length, 1);
    assert.equal(outcomes.find(r => !r.ok).name, "InsufficientStockError");
    assert.deepEqual(balance(last), { physical: 1, reserved: 1, quarantine: 0 });
    assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE variant_id=?").get(last).n, 1);
  });

  test("inactive historical variants release, dispatch and return by ID; new reservations are forbidden", () => {
    inventory.openStock(merged, 4, actor);
    order("release"); order("return"); order("inactive");
    inventory.reserveForOrder("release", [{ variantId: merged, qty: 1 }], actor, "test");
    inventory.reserveForOrder("return", [{ variantId: merged, qty: 2 }], actor, "test");
    db.prepare("UPDATE variants SET active=0 WHERE id=?").run(merged);
    assert.throws(() => inventory.reserveForOrder("inactive", [{ variantId: merged, qty: 1 }], actor, "test"), inventory.InventoryConflictError);
    inventory.releaseForOrder("release", actor, "Annulation");
    inventory.releaseForOrder("release", actor, "Annulation");
    inventory.dispatchOrder("return", actor);
    inventory.recoverDispatch("return", actor);
    assert.deepEqual(balance(merged), { physical: 2, reserved: 0, quarantine: 0 });
    assert.equal(inventory.resolveVariantForLine({ product_id: product.id, variant_id: merged }), merged);
    assert.equal(inventory.resolveVariantForLine({ product_id: standard.id, variant_id: merged }), null);
    db.prepare(`INSERT INTO courier_submissions (id, order_id, status, payload_json, next_retry_at, created_at, updated_at)
      VALUES ('return-submission', 'return', 'submitted', '{}', ?, ?, ?)`).run(now, now, now);
    db.prepare(`INSERT INTO returns (id, submission_id, status, created_at)
      VALUES ('return-row', 'return-submission', 'received', ?)`).run(now);
    const lines = [{ variantId: merged, sellableQty: 1, damagedQty: 1 }];
    inventory.receiveReturnLines("return-submission", "return", lines, actor, "inspect");
    inventory.receiveReturnLines("return-submission", "return", lines, actor, "inspect");
    assert.deepEqual(balance(merged), { physical: 4, reserved: 0, quarantine: 1 });
    assert.throws(() => inventory.receiveReturnLines("return-submission", "return", [{ ...lines[0], sellableQty: 2 }], actor, "other"), inventory.InventoryConflictError);
    assert.equal(inventory.listStockVariants().some(v => v.variantId === merged), false);
    assert.equal(inventory.listStockVariants({ includeInactive: true }).find(v => v.variantId === merged).active, false);
    db.prepare("UPDATE variants SET active=1 WHERE id=?").run(merged);
    db.prepare("UPDATE products SET active=0 WHERE id=?").run(product.id);
    assert.throws(() => inventory.reserveForOrder("inactive", [{ variantId: merged, qty: 1 }], actor, "test"), inventory.InventoryConflictError);
    db.prepare("UPDATE products SET active=1 WHERE id=?").run(product.id);
  });

  test("active/released reservations cannot credit a return; released or consumed reservations never reopen on retry", () => {
    const id = variant("history");
    inventory.openStock(id, 3, actor);
    order("history");
    const lines = [{ variantId: id, qty: 2 }];
    inventory.reserveForOrder("history", lines, actor, "test");
    db.prepare(`INSERT INTO courier_submissions (id, order_id, status, next_retry_at, created_at, updated_at)
      VALUES ('history-sub', 'history', 'submitted', ?, ?, ?)`).run(now, now, now);
    db.prepare(`INSERT INTO returns (id, submission_id, status, created_at)
      VALUES ('history-return', 'history-sub', 'received', ?)`).run(now);
    const inspection = [{ variantId: id, sellableQty: 1, damagedQty: 0 }];
    const before = balance(id);
    assert.deepEqual(inventory.getDispatchedVariants("history"), []);
    assert.throws(() => inventory.receiveReturnLines("history-sub", "history", inspection, actor, "invalid-active"), inventory.InventoryConflictError);
    assert.deepEqual(balance(id), before);
    inventory.releaseForOrder("history", actor, "Annulation");
    inventory.reserveForOrder("history", lines, actor, "test");
    assert.equal(balance(id).reserved, 0);
    assert.throws(() => inventory.receiveReturnLines("history-sub", "history", inspection, actor, "invalid-released"), inventory.InventoryConflictError);
    assert.equal(db.prepare("SELECT status FROM reservations WHERE order_id='history'").get().status, "released");
    order("consumed-history");
    inventory.reserveForOrder("consumed-history", lines, actor, "test");
    inventory.dispatchOrder("consumed-history", actor);
    inventory.reserveForOrder("consumed-history", lines, actor, "test");
    assert.deepEqual(balance(id), { physical: 1, reserved: 0, quarantine: 0 });
    assert.equal(db.prepare("SELECT status FROM reservations WHERE order_id='consumed-history'").get().status, "consumed");
  });

  test("stock schemas reject price/options selectors, duplicates, fractions, unsafe counts and missing correction snapshots", () => {
    const valid = batch("validation", "receive", [{ variantId: adjust, qty: 1 }]);
    for (const qty of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "2"]) {
      assert.equal(stockBatchSchema.safeParse({ ...valid, items: [{ variantId: adjust, qty }] }).success, false);
    }
    for (const request of [{ ...valid, requestId: " " }, { ...valid, items: [] },
      { ...valid, items: [...valid.items, ...valid.items] }, { ...valid, mode: "count", reason: "Inventaire" },
      { ...valid, mode: "count", items: [{ variantId: adjust, qty: 1, expected: balance(adjust) }] },
      { ...valid, price: 1 }]) assert.equal(stockBatchSchema.safeParse(request).success, false);
    assert.equal(stockAdjustSchema.safeParse({ variantId: adjust, physicalDelta: 1, reason: "Test", options: [] }).success, false);
    assert.equal(stockOpeningSchema.safeParse({ items: [{ variantId: adjust, qty: 1 }, { variantId: adjust, qty: 1 }] }).success, false);
  });

  test("opening batches roll back balances, ledger and receipt on late failure; zero opens exactly once", () => {
    const a = variant("batch-a"), z = variant("batch-z");
    inventory.openStock(z, 2, actor);
    const count = movementCount();
    assert.throws(() => apply(batch("rollback", "opening", [{ variantId: a, qty: 3 }, { variantId: z, qty: 2 }])), inventory.InventoryConflictError);
    assert.equal(balance(a), undefined);
    assert.equal(movementCount(), count);
    assert.equal(db.prepare("SELECT 1 FROM app_state WHERE key='inventory-batch:rollback'").get(), undefined);
    const request = batch("rollback", "opening", [{ variantId: a, qty: 0 }]);
    const result = apply(request);
    assert.deepEqual(apply(request), result);
    assert.throws(() => apply({ ...request, requestId: "reopen" }), inventory.InventoryConflictError);
  });

  test("durable receipts precede current balances; changed mode/reason/membership/snapshot conflict", () => {
    const a = variant("receipt-a"), b = variant("receipt-b");
    apply(batch("receipt-open", "opening", [{ variantId: a, qty: 2 }, { variantId: b, qty: 3 }]));
    const receive = batch("receipt-receive", "receive", [{ variantId: b, qty: 2 }, { variantId: a, qty: 1 }], "Livraison");
    const result = apply(receive);
    const count = batch("receipt-count", "count", [{ variantId: a, qty: 8, expected: balance(a) }], "Inventaire");
    const counted = apply(count);
    apply(batch("later", "receive", [{ variantId: a, qty: 4 }]));
    assert.deepEqual(apply({ ...receive, items: [...receive.items].reverse() }), result);
    assert.deepEqual(apply(count), counted);
    for (const changed of [{ ...receive, mode: "opening" }, { ...receive, reason: "Autre" },
      { ...receive, items: receive.items.slice(0, 1) }, { ...count, items: [{ ...count.items[0], expected: balance(a) }] }]) {
      assert.throws(() => apply(changed), inventory.InventoryConflictError);
    }
  });

  test("reception overflow and unknown variants roll back the entire batch", () => {
    const a = variant("overflow-a"), z = variant("overflow-z");
    inventory.openStock(z, Number.MAX_SAFE_INTEGER, actor);
    const count = movementCount();
    for (const variantId of [z, "zz-missing"]) {
      assert.throws(() => apply(batch(`invalid-${variantId}`, "receive", [{ variantId: a, qty: 2 }, { variantId, qty: 1 }])), inventory.InventoryValidationError);
      assert.equal(balance(a), undefined);
      assert.equal(movementCount(), count);
    }
  });

  test("counts preserve reserved/quarantine and reject stale snapshots and floors atomically", () => {
    const a = variant("floor-a"), z = variant("floor-z");
    apply(batch("floor-open", "opening", [{ variantId: a, qty: 10 }, { variantId: z, qty: 10 }]));
    inventory.adjustStock(z, { quarantineDelta: 2 }, "Abîmées", actor, "floor-q");
    order("floor-order");
    inventory.reserveForOrder("floor-order", [{ variantId: z, qty: 3 }], actor, "test");
    const snapshot = balance(z), first = balance(a), count = movementCount();
    const request = batch("floor-count", "count", [{ variantId: a, qty: 7, expected: first }, { variantId: z, qty: 4, expected: snapshot }], "Comptage");
    assert.throws(() => apply(request), inventory.InventoryConflictError);
    assert.deepEqual(balance(a), first);
    assert.deepEqual(balance(z), snapshot);
    assert.equal(movementCount(), count);
    for (const field of ["physical", "reserved", "quarantine"]) {
      assert.throws(() => apply(batch(`stale-${field}`, "count", [{ variantId: z, qty: 8, expected: { ...snapshot, [field]: snapshot[field] + 1 } }], "Comptage")), inventory.InventoryConflictError);
    }
    apply({ ...request, items: [{ variantId: z, qty: 5, expected: snapshot }] });
    assert.deepEqual(balance(z), { physical: 5, reserved: 3, quarantine: 2 });
    const noop = batch("noop", "count", [{ variantId: z, qty: 5, expected: balance(z) }], "Vérifié");
    const result = apply(noop);
    apply(batch("noop-later", "receive", [{ variantId: z, qty: 2 }]));
    assert.deepEqual(apply(noop), result);
  });

  test("two-process counts have one winner; concurrent identical reception retries apply once", async () => {
    const id = variant("count-race");
    inventory.openStock(id, 10, actor);
    const expected = balance(id);
    const outcomes = await race([6, 8].map(qty => batch(`race-${qty}`, "count", [{ variantId: id, qty, expected }], "Inventaire")));
    assert.equal(outcomes.filter(r => r.ok).length, 1);
    assert.equal(outcomes.find(r => !r.ok).name, "InventoryConflictError");
    const before = balance(id).physical;
    const request = batch("retry", "receive", [{ variantId: id, qty: 3 }]);
    const retries = await race([request, request]);
    assert.equal(retries.every(r => r.ok), true);
    assert.deepEqual(retries[0].result, retries[1].result);
    assert.equal(balance(id).physical, before + 3);
    assert.deepEqual(apply(request), retries[0].result);
  });

  test("catalog initial stock uses generic options; edits/replays cannot reset it; late failure rolls back catalog and ledger", () => {
    const input = { ...productInput("initial"), requestId: "initial-create",
      initialStock: [{ options: [{ name: "Contenance", value: "30 ml" }], qty: 4 }, { options: [{ name: "Contenance", value: "500 ml" }], qty: 0 }] };
    const created = createProduct(input, { actor });
    const v = created.variants.find(v => v.options[0].value === "30 ml");
    apply(batch("initial-later", "receive", [{ variantId: v.id, qty: 2 }]));
    updateProduct(created.id, { name: "Nom modifié" });
    assert.equal(createProduct(input).id, created.id);
    assert.equal(balance(v.id).physical, 6);
    assert.throws(() => createProduct({ ...input, initialStock: [] }), inventory.InventoryConflictError);
    assert.equal(inventory.listMovements({ variantId: created.variants.find(v => v.options[0].value === "500 ml").id }).length, 1);
    assert.equal(inventory.listMovements({ variantId: created.variants.find(v => v.options[0].value === "XL").id }).length, 0);
    const count = movementCount();
    db.exec(`CREATE TRIGGER reject_test_opening BEFORE INSERT ON stock_movements WHEN NEW.kind='opening' AND NEW.qty=3 BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    const rollback = { ...productInput("initial-rollback"), requestId: "rollback-create", initialStock: [
      { options: [{ name: "Contenance", value: "30 ml" }], qty: 2 }, { options: [{ name: "Contenance", value: "500 ml" }], qty: 3 }] };
    try { assert.throws(() => createProduct(rollback), /test failure/); }
    finally { db.exec("DROP TRIGGER reject_test_opening"); }
    assert.equal(getProductById("initial-rollback"), null);
    assert.equal(movementCount(), count);
    assert.equal(db.prepare("SELECT 1 FROM app_state WHERE key='catalog-create:rollback-create'").get(), undefined);
    assert.equal(createProduct(rollback).variants.find(v => v.options[0].value === "500 ml").available, 3);
  });

  test("all stock handlers authenticate before input, enforce strict generic schemas and map French 400/409 errors", async () => {
    const authPath = loadSource.resolve("@/lib/auth-guards"), cachePath = loadSource.resolve("next/cache");
    const routePaths = ["batch", "opening", "adjust"].map(name => loadSource.resolve(`@/app/api/crm/stock/${name}/route`));
    const previous = new Map([authPath, cachePath, ...routePaths].map(key => [key, loadSource.cache[key]]));
    let role = "admin", failRevalidation = false;
    class AuthGuardError extends Error {
      constructor(status) { super("Accès réservé aux administrateurs."); this.status = status; }
      toResponse() { return Response.json({ error: this.message }, { status: this.status }); }
    }
    loadSource.cache[authPath] = { exports: { AuthGuardError, requireAdmin: async () => {
      if (role !== "admin") throw new AuthGuardError(role ? 403 : 401);
      return { id: actor };
    } } };
    loadSource.cache[cachePath] = { exports: { revalidatePath() { if (failRevalidation) throw new Error("cache failure"); } } };
    try {
      const [stockPOST, openingPOST, adjustPOST] = routePaths.map(p => loadSource(p).POST);
      for (const denied of ["agent", null]) {
        role = denied;
        for (const handler of [stockPOST, openingPOST, adjustPOST]) {
          assert.equal((await handler({ json() { throw new Error("Auth must run first"); } })).status, denied ? 403 : 401);
        }
      }
      role = "admin";
      const request = body => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
      for (const handler of [stockPOST, openingPOST, adjustPOST]) {
        assert.equal((await handler(new Request("http://localhost/api", { method: "POST", body: "{" }))).status, 400);
      }
      const id = variant("api-stock");
      const opening = batch("api-opening", "opening", [{ variantId: id, qty: 2 }]);
      const original = await (await stockPOST(request(opening))).json();
      assert.equal((await stockPOST(request(batch("api-receive", "receive", [{ variantId: id, qty: 1 }])))).status, 200);
      assert.deepEqual(await (await stockPOST(request(opening))).json(), original);
      assert.equal((await openingPOST(request({ variantId: id, qty: 9 }))).status, 409);
      assert.equal((await openingPOST(request({ variantId: id, qty: 2 }))).status, 200);
      for (const [body, status, french] of [
        [batch("api-invalid", "receive", [{ variantId: id, qty: 0 }]), 400, /Requête de stock invalide/],
        [batch("api-unknown", "receive", [{ variantId: "missing", qty: 1 }]), 400, /Variante introuvable/],
        [batch("api-reopen", "opening", [{ variantId: id, qty: 3 }]), 409, /déjà ouvert/],
        [batch("api-stale", "count", [{ variantId: id, qty: 4, expected: { physical: 2, reserved: 0, quarantine: 0 } }], "Comptage"), 409, /a changé/],
      ]) {
        const response = await stockPOST(request(body));
        assert.equal(response.status, status);
        assert.match((await response.json()).error, french);
      }
      const adjustment = { variantId: id, requestId: "550e8400-e29b-41d4-a716-446655440000", physicalDelta: 1, reason: "Correction" };
      assert.equal((await adjustPOST(request(adjustment))).status, 200);
      assert.equal((await adjustPOST(request(adjustment))).status, 200);
      assert.equal(balance(id).physical, 4);
      assert.equal((await adjustPOST(request({ ...adjustment, physicalDelta: 2 }))).status, 409);
      failRevalidation = true;
      const uncertain = batch("api-uncertain", "receive", [{ variantId: id, qty: 2 }]);
      await assert.rejects(stockPOST(request(uncertain)), /cache failure/);
      failRevalidation = false;
      assert.equal((await stockPOST(request(uncertain))).status, 200);
      assert.equal(balance(id).physical, 6);
    } finally {
      for (const [key, value] of previous) {
        if (value) loadSource.cache[key] = value; else delete loadSource.cache[key];
      }
    }
  });
}
