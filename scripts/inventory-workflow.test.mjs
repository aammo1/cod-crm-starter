import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSource } from "./test-source.mjs";

const child = process.env.ZEHRI_INVENTORY_CHILD;
const temp = child ? null : fs.mkdtempSync(path.join(os.tmpdir(), "zehri-inventory-"));
if (temp) process.env.DB_PATH = path.join(temp, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";
const { getDb, createOrder, getOrder } = loadSource("@/lib/db");
const inventory = loadSource("@/lib/services/inventory");
const { confirmOrder, cancelOrder } = loadSource("@/lib/services/confirmation");
const { drainSubmissions } = loadSource("@/lib/workers/submission");
const { declareManualReturn } = loadSource("@/lib/services/returns");
const { getDashboard } = loadSource("@/lib/services/dashboard");
const { stockAdjustSchema } = loadSource("@/lib/api-schemas");
const { stockBatchSchema } = loadSource("@/lib/services/inventory-schemas");
const { createProduct, getProductById, updateProduct } = loadSource("@/lib/services/catalog");
const { createProductSchema } = loadSource("@/lib/services/catalog-schemas");
const db = getDb();
const input = { lines: [{ lineIndex: 0, variantId: "last" }], address: "12 rue test", cityId: 1 };
const actor = { id: "inventory-admin" };
const balance = (id) => db.prepare("SELECT physical, reserved, quarantine FROM stock_balances WHERE variant_id = ?").get(id);

if (child) {
  process.once("message", () => {
    try {
      const result = process.env.ZEHRI_STOCK_BATCH
        ? inventory.applyStockBatch(JSON.parse(process.env.ZEHRI_STOCK_BATCH), actor.id)
        : confirmOrder(child, input, actor);
      process.send({ ok: true, result });
    } catch (error) {
      process.send({ ok: false, status: error.status, name: error.name });
    } finally {
      db.close();
      process.disconnect();
    }
  });
  process.send({ ready: true });
} else {
  after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
    VALUES ('p', 'inventory-test', 'Bottines test', 'bottines', 300, ?, ?)`).run(now, now);
  db.prepare("INSERT INTO product_colors (id, product_id, name) VALUES ('c', 'p', 'Noir')").run();
  for (const [id, size] of [["adjust", "37"], ["last", "38"], ["merged", "39"]]) {
    db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES (?, 'p', 'c', ?, ?)").run(id, size, id);
  }
  db.prepare("INSERT INTO cities (id, name, updated_at) VALUES (1, 'Casablanca', ?)").run(now);
  function order(id, size = "38", quantity = 1) {
    createOrder({ id, customerName: "Cliente test", customerPhone: "+212612345678",
      items: [{ product_id: "p", name: "Bottines test", color: "Noir", size, quantity,
        unit_price: 300, line_total: 300 * quantity }], upsellOffer: null,
      subtotal: 300 * quantity, shipping: 29, total: 300 * quantity + 29 });
  }

  test("opening is exactly once and conflicting replay leaves balances unchanged", () => {
    inventory.openStock("adjust", 10, actor.id);
    inventory.openStock("adjust", 10, actor.id);
    assert.throws(() => inventory.openStock("adjust", 11, actor.id), inventory.InventoryConflictError);
    assert.equal(balance("adjust").physical, 10);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE variant_id = 'adjust'").get().n, 1);
  });

  test("adjustment retries are atomic and cannot add, omit or change a delta", () => {
    inventory.adjustStock("adjust", { physicalDelta: 2, quarantineDelta: 1 }, "test", actor.id, "adjust-once");
    const before = balance("adjust");
    inventory.adjustStock("adjust", { physicalDelta: 2, quarantineDelta: 1 }, "test", actor.id, "adjust-once");
    for (const change of [{ physicalDelta: 2 }, { quarantineDelta: 1 }, { physicalDelta: 3, quarantineDelta: 1 }]) {
      assert.throws(() => inventory.adjustStock("adjust", change, "test", actor.id, "adjust-once"), inventory.InventoryConflictError);
    }
    inventory.adjustStock("adjust", { physicalDelta: 1 }, "test", actor.id, "physical-only");
    assert.throws(() => inventory.adjustStock("adjust", { physicalDelta: 1, quarantineDelta: 1 }, "test", actor.id, "physical-only"), inventory.InventoryConflictError);
    assert.deepEqual(balance("adjust"), { ...before, physical: before.physical + 1 });
  });

  test("adjustments reject fractions, negative stock and quarantine above physical without movements", () => {
    const before = balance("adjust");
    const count = inventory.listMovements({ variantId: "adjust" }).length;
    for (const change of [{ physicalDelta: -100 }, { quarantineDelta: 100 }, { physicalDelta: 0.5 }, { quarantineDelta: -100 }]) {
      assert.throws(() => inventory.adjustStock("adjust", change, "test", actor.id, "invalid"));
    }
    assert.deepEqual(balance("adjust"), before);
    assert.equal(inventory.listMovements({ variantId: "adjust" }).length, count);
    assert.equal(stockAdjustSchema.safeParse({ variantId: "adjust", physicalDelta: 0.5, reason: "test" }).success, false);
    assert.equal(stockAdjustSchema.safeParse({ variantId: "adjust", physicalDelta: 1, reason: "test", requestId: "invalid" }).success, false);
  });

  test("reserved stock cannot be removed; cancellation prevents provider calls", async () => {
    inventory.openStock("merged", 3, actor.id);
    order("merged-order", "39", 2);
    confirmOrder("merged-order", { ...input, lines: [{ lineIndex: 0, variantId: "merged" }] }, actor);
    assert.throws(() => inventory.adjustStock("merged", { physicalDelta: -2 }, "test", actor.id, "under-reserved"));
    assert.equal(inventory.availableFor("merged"), 1);
    cancelOrder("merged-order", { reason: "Cliente annule" }, actor);
    assert.equal(db.prepare("SELECT status FROM courier_submissions WHERE order_id='merged-order'").get().status, "failed");
    assert.equal(getDashboard().pendingSubmissions.count, 0);
    assert.equal(getDashboard().failedSubmissions.count, 0);
    let calls = 0;
    await drainSubmissions({ createParcel: async () => { calls++; throw new Error("must not call"); } });
    assert.equal(calls, 0);
    assert.deepEqual(balance("merged"), { physical: 3, reserved: 0, quarantine: 0 });
    assert.equal(getOrder("merged-order").confirmationStatus, "cancelled");
  });

  test("two independent SQLite processes competing for the last pair have exactly one winner", async () => {
    inventory.openStock("last", 1, actor.id);
    order("last-a"); order("last-b");
    const children = ["last-a", "last-b"].map(id => fork(fileURLToPath(import.meta.url), [], {
      env: { ...process.env, ZEHRI_INVENTORY_CHILD: id }, execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"],
    }));
    try {
      const results = children.map(proc => new Promise((resolve, reject) => {
        proc.on("error", reject);
        proc.on("message", msg => { if (!msg.ready) resolve(msg); });
        proc.on("exit", code => { if (code !== 0) reject(new Error(`Child exit ${code}`)); });
      }));
      const exits = children.map(proc => new Promise(resolve => proc.once("exit", resolve)));
      await Promise.all(children.map(proc => new Promise(resolve => proc.once("message", msg => { assert.equal(msg.ready, true); resolve(); }))));
      children.forEach(proc => proc.send("go"));
      const outcomes = await Promise.all(results);
      await Promise.all(exits);
      assert.equal(outcomes.filter(result => result.ok).length, 1);
      assert.equal(outcomes.find(result => !result.ok).status, 409);
      assert.deepEqual(balance("last"), { physical: 1, reserved: 1, quarantine: 0 });
      assert.equal(db.prepare("SELECT COUNT(*) n FROM courier_submissions WHERE order_id IN ('last-a','last-b')").get().n, 1);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE variant_id = 'last'").get().n, 1);
      assert.equal([getOrder("last-a"), getOrder("last-b")].filter(row => row.confirmationStatus === "new").length, 1);
    } finally {
      children.forEach(proc => { if (proc.exitCode === null) proc.kill(); });
    }
  });

  test("the low-stock threshold includes exactly three available pairs", () => {
    assert.equal(inventory.lowStock(3).find(row => row.variantId === "merged")?.available, 3);
  });

  test("manual returns cannot credit active or released reservations; dispatched declarations are attributed and idempotent", () => {
    order("manual-return", "39");
    const { submissionId } = confirmOrder("manual-return", { ...input, lines: [{ lineIndex: 0, variantId: "merged" }] }, actor);
    db.prepare("UPDATE courier_submissions SET status='submitted',tracking_number='OZEMOCKMANUAL' WHERE id=?").run(submissionId);
    const before = balance("merged");
    assert.deepEqual(inventory.getDispatchedVariants("manual-return"), []);
    assert.equal(declareManualReturn("OZEMOCKMANUAL", actor.id), null);
    assert.throws(() => inventory.receiveReturnLines(submissionId, "manual-return",
      [{ variantId: "merged", sellableQty: 1, damagedQty: 0 }], actor.id, "pre-dispatch"), inventory.InventoryConflictError);
    assert.deepEqual(balance("merged"), before);
    inventory.dispatchOrder("manual-return", actor.id);
    const returned = declareManualReturn("OZEMOCKMANUAL", actor.id);
    assert.equal(returned.status, "returning");
    assert.equal(declareManualReturn("OZEMOCKMANUAL", actor.id).id, returned.id);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM order_contacts WHERE order_id='manual-return' AND note LIKE 'Retour déclaré%'").get().n, 1);
    assert.equal(inventory.availableFor("merged"), 2); // Declaration itself never restocks.
    assert.deepEqual(inventory.getDispatchedVariants("merged-order"), []); // Released cancellation.
  });

  test("duplicate variant lines merge before idempotency checks and replay never doubles reservations", () => {
    order("duplicate-lines", "37", 2);
    const lines = [{ variantId: "adjust", qty: 1 }, { variantId: "adjust", qty: 1 }];
    inventory.reserveForOrder("duplicate-lines", lines, actor.id, "test");
    const before = balance("adjust");
    inventory.reserveForOrder("duplicate-lines", lines, actor.id, "test");
    inventory.reserveForOrder("duplicate-lines", [{ variantId: "adjust", qty: 2 }], actor.id, "test");
    assert.deepEqual(balance("adjust"), before);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE order_id='duplicate-lines'").get().n, 1);
    assert.throws(() => inventory.reserveForOrder("duplicate-lines", [{ variantId: "adjust", qty: 3 }], actor.id, "test"), inventory.InventoryConflictError);
  });

  function variant(id) {
    db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES (?, 'p', 'c', ?, ?)").run(id, id, id);
    return id;
  }
  const batch = (requestId, mode, items, reason) => ({ requestId, mode, items, ...(reason ? { reason } : {}) });
  const apply = (request) => inventory.applyStockBatch(request, actor.id);
  const movementCount = () => db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n;

  test("batch schemas reject invalid quantities, duplicates and incomplete correction snapshots", () => {
    const valid = batch("validation", "receive", [{ variantId: "adjust", qty: 1 }]);
    for (const qty of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, "2"]) {
      assert.equal(stockBatchSchema.safeParse({ ...valid, items: [{ variantId: "adjust", qty }] }).success, false);
    }
    for (const request of [
      { ...valid, requestId: " " }, { ...valid, items: [] }, { ...valid, items: [...valid.items, ...valid.items] },
      { ...valid, mode: "count", reason: "Inventaire" },
      { ...valid, mode: "count", items: [{ variantId: "adjust", qty: 1, expected: balance("adjust") }] },
    ]) assert.equal(stockBatchSchema.safeParse(request).success, false);
    assert.equal(stockBatchSchema.safeParse({ ...valid, items: [{ variantId: "adjust", qty: Number.MAX_SAFE_INTEGER }] }).success, true);
  });

  test("opening batches roll back every balance, movement and receipt on late failure; explicit zero opens once", () => {
    const a = variant("batch-open-a");
    const z = variant("batch-open-z");
    inventory.openStock(z, 2, actor.id);
    const before = movementCount();
    const request = batch("opening-rollback", "opening", [{ variantId: a, qty: 3 }, { variantId: z, qty: 2 }]);
    assert.throws(() => apply(request), inventory.InventoryConflictError);
    assert.equal(balance(a), undefined);
    assert.equal(movementCount(), before);
    assert.equal(db.prepare("SELECT 1 FROM app_state WHERE key='inventory-batch:opening-rollback'").get(), undefined);
    const good = batch(request.requestId, "opening", [{ variantId: a, qty: 0 }]);
    const result = apply(good);
    assert.equal(result.items[0].physical, 0);
    assert.deepEqual(apply(good), result);
    assert.throws(() => apply({ ...good, requestId: "new-opening" }), inventory.InventoryConflictError);
    assert.throws(() => apply({ ...good, items: [{ variantId: a, qty: 1 }] }), inventory.InventoryConflictError);
  });

  test("receipts survive later changes; changed mode, reason, membership, quantity or snapshot conflicts", () => {
    const a = variant("receipt-a"), b = variant("receipt-b");
    apply(batch("receipt-open", "opening", [{ variantId: a, qty: 2 }, { variantId: b, qty: 3 }]));
    const receive = batch("receipt-receive", "receive", [{ variantId: b, qty: 2 }, { variantId: a, qty: 1 }], "Livraison");
    const received = apply(receive);
    const count = batch("receipt-count", "count", [{ variantId: a, qty: 8, expected: balance(a) }], "Inventaire");
    const counted = apply(count);
    apply(batch("receipt-later", "receive", [{ variantId: a, qty: 4 }]));
    const movements = movementCount();
    assert.deepEqual(apply({ ...receive, items: receive.items.toReversed() }), received);
    assert.deepEqual(apply(count), counted);
    assert.equal(balance(a).physical, 12);
    for (const changed of [
      { ...receive, mode: "opening" }, { ...receive, reason: "Autre" },
      { ...receive, items: receive.items.slice(0, 1) },
      { ...receive, items: [{ variantId: a, qty: 9 }, receive.items[0]] },
      { ...count, items: [{ ...count.items[0], expected: balance(a) }] },
    ]) assert.throws(() => apply(changed), inventory.InventoryConflictError);
    assert.equal(movementCount(), movements);
  });

  test("reception rejects unknown variants and overflow atomically", () => {
    const a = variant("receive-atomic-a"), z = variant("receive-atomic-z");
    apply(batch("receive-max", "opening", [{ variantId: z, qty: Number.MAX_SAFE_INTEGER }]));
    const movements = movementCount();
    for (const variantId of [z, "zz-missing"]) {
      assert.throws(() => apply(batch(`invalid-${variantId}`, "receive", [{ variantId: a, qty: 2 }, { variantId, qty: 1 }])), inventory.InventoryValidationError);
      assert.equal(balance(a), undefined);
      assert.equal(movementCount(), movements);
    }
    assert.equal(balance(z).physical, Number.MAX_SAFE_INTEGER);
  });

  test("absolute counts preserve reserved/quarantine and reject stale snapshots and floors atomically", () => {
    const a = variant("count-floor-a"), z = variant("count-floor-z");
    apply(batch("count-floor-open", "opening", [{ variantId: a, qty: 10 }, { variantId: z, qty: 10 }]));
    inventory.adjustStock(z, { quarantineDelta: 2 }, "Abîmées", actor.id, "floor-quarantine");
    order("count-floor-order");
    inventory.reserveForOrder("count-floor-order", [{ variantId: z, qty: 3 }], actor.id, "test");
    const snapshot = balance(z), first = balance(a), movements = movementCount();
    const request = batch("count-floor", "count", [{ variantId: a, qty: 7, expected: first }, { variantId: z, qty: 4, expected: snapshot }], "Comptage");
    assert.throws(() => apply(request), inventory.InventoryConflictError);
    assert.deepEqual(balance(a), first);
    assert.deepEqual(balance(z), snapshot);
    assert.equal(movementCount(), movements);
    for (const field of ["physical", "reserved", "quarantine"]) {
      const stale = { ...snapshot, [field]: snapshot[field] + 1 };
      assert.throws(() => apply(batch(`stale-${field}`, "count", [{ variantId: z, qty: 8, expected: stale }], "Comptage")), inventory.InventoryConflictError);
    }
    apply({ ...request, items: [{ variantId: z, qty: 5, expected: snapshot }] });
    assert.deepEqual(balance(z), { physical: 5, reserved: 3, quarantine: 2 });
    assert.equal(inventory.availableFor(z), 0);
    const noop = batch("count-noop", "count", [{ variantId: z, qty: 5, expected: balance(z) }], "Vérifié");
    const result = apply(noop);
    apply(batch("count-noop-later", "receive", [{ variantId: z, qty: 2 }]));
    assert.deepEqual(apply(noop), result);
    assert.equal(balance(z).physical, 7);
  });

  async function raceBatches(requests) {
    const children = requests.map(request => fork(fileURLToPath(import.meta.url), [], {
      env: { ...process.env, ZEHRI_INVENTORY_CHILD: "stock-batch", ZEHRI_STOCK_BATCH: JSON.stringify(request) },
      execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"],
    }));
    try {
      const results = children.map(proc => new Promise((resolve, reject) => {
        proc.on("error", reject);
        proc.on("message", msg => { if (!msg.ready) resolve(msg); });
        proc.on("exit", code => { if (code !== 0) reject(new Error(`Child exit ${code}`)); });
      }));
      const exits = children.map(proc => new Promise(resolve => proc.once("exit", resolve)));
      await Promise.all(children.map(proc => new Promise(resolve => proc.once("message", msg => { assert.equal(msg.ready, true); resolve(); }))));
      children.forEach(proc => proc.send("go"));
      const outcomes = await Promise.all(results);
      await Promise.all(exits);
      return outcomes;
    } finally { children.forEach(proc => { if (proc.exitCode === null) proc.kill(); }); }
  }

  test("two processes correcting the same snapshot have one winner; concurrent retries apply reception once", async () => {
    const id = variant("count-race");
    apply(batch("race-opening", "opening", [{ variantId: id, qty: 10 }]));
    const expected = balance(id);
    const outcomes = await raceBatches([6, 8].map(qty => batch(`race-count-${qty}`, "count", [{ variantId: id, qty, expected }], "Inventaire")));
    assert.equal(outcomes.filter(result => result.ok).length, 1);
    assert.equal(outcomes.find(result => !result.ok).name, "InventoryConflictError");
    const before = balance(id).physical;
    const receive = batch("race-retry", "receive", [{ variantId: id, qty: 3 }]);
    const retries = await raceBatches([receive, receive]);
    assert.equal(retries.every(result => result.ok), true);
    assert.deepEqual(retries[0].result, retries[1].result);
    assert.equal(balance(id).physical, before + 3);
    assert.deepEqual(apply(receive), retries[0].result); // Parent sees the durable cross-process receipt.
  });

  const productInput = (slug) => ({ slug, name: "Bottines test", category: "bottines", price: 300,
    description: "Description", story: "Histoire", materials: ["Cuir"], isBestSeller: false,
    colors: [{ name: "Noir", hex: "#000000", images: [] }, { name: "Crème", hex: "#eeeeee", images: [] }], sizes: [37, 38] });

  test("product initial stock resolves exact color names; omitted stays unopened, zero is opened and retries do not reset stock", () => {
    const input = { ...productInput("initial-stock"), requestId: "initial-create",
      initialStock: [{ colorKey: "Noir", size: "37", qty: 4 }, { colorKey: "Crème", size: "38", qty: 0 }] };
    const product = createProduct(input, { actor: actor.id });
    assert.equal(product.variants.length, 4);
    for (const v of product.variants) {
      const initial = input.initialStock.find(item => item.colorKey === v.colorName && item.size === v.size);
      assert.deepEqual(balance(v.variantId), { physical: initial?.qty ?? 0, reserved: 0, quarantine: 0 });
      const movements = inventory.listMovements({ variantId: v.variantId });
      assert.equal(movements.length, initial ? 1 : 0);
      if (initial) { assert.equal(movements[0].kind, "opening"); assert.equal(movements[0].actor, actor.id); }
    }
    const v = product.variants.find(item => item.colorName === "Noir" && item.size === "37");
    apply(batch("initial-later", "receive", [{ variantId: v.variantId, qty: 2 }]));
    updateProduct(product.id, { name: "Nom modifié" });
    assert.equal(createProduct(input).id, product.id);
    assert.equal(balance(v.variantId).physical, 6);
    assert.throws(() => createProduct({ ...input, initialStock: [] }), inventory.InventoryConflictError);
    const empty = createProduct(productInput("initial-omitted"));
    assert.equal(empty.variants.every(v => inventory.listMovements({ variantId: v.variantId }).length === 0), true);
  });

  test("invalid initial stock is rejected; late inventory failure rolls back the entire product and creation receipt", () => {
    for (const initialStock of [
      [{ colorKey: "noir", size: "37", qty: 2 }], [{ colorKey: "Noir", size: "39", qty: 2 }],
      [{ colorKey: "Noir", size: "37", qty: "" }], [{ colorKey: "Noir", size: "37", qty: -1 }],
      [{ colorKey: "Noir", size: "37", qty: Number.MAX_SAFE_INTEGER + 1 }],
      [{ colorKey: "Noir", size: "37", qty: 1 }, { colorKey: "Noir", size: "37", qty: 0 }],
    ]) assert.equal(createProductSchema.safeParse({ ...productInput("invalid-initial"), initialStock }).success, false);
    const input = { ...productInput("initial-rollback"), requestId: "rollback-create",
      initialStock: [{ colorKey: "Noir", size: "37", qty: 2 }, { colorKey: "Crème", size: "38", qty: 3 }] };
    const before = movementCount();
    db.exec(`CREATE TRIGGER reject_test_opening BEFORE INSERT ON stock_movements
      WHEN NEW.kind='opening' AND NEW.qty=3 BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    try { assert.throws(() => createProduct(input), /test failure/); }
    finally { db.exec("DROP TRIGGER reject_test_opening"); }
    assert.equal(getProductById(input.slug), null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM variants WHERE product_id=?").get(input.slug).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM product_colors WHERE product_id=?").get(input.slug).n, 0);
    assert.equal(db.prepare("SELECT 1 FROM app_state WHERE key='catalog-create:rollback-create'").get(), undefined);
    assert.equal(movementCount(), before);
    assert.equal(createProduct(input).variants.find(v => v.colorName === "Crème" && v.size === "38").available, 3);
  });

  test("stock and product APIs require admin before reading input and expose retry-safe success and French 400/409 errors", async () => {
    // Exercise the actual handlers/services/database; replace only session and Next cache infrastructure.
    const authPath = loadSource.resolve("@/lib/auth-guards");
    const cachePath = loadSource.resolve("next/cache");
    const stockPath = loadSource.resolve("@/app/api/crm/stock/batch/route");
    const productPath = loadSource.resolve("@/app/api/admin/products/route");
    const previous = new Map([authPath, cachePath, stockPath, productPath].map(key => [key, loadSource.cache[key]]));
    let role = "admin";
    class AuthGuardError extends Error {
      constructor(status, message) { super(message); this.status = status; }
      toResponse() { return Response.json({ error: this.message }, { status: this.status }); }
    }
    loadSource.cache[authPath] = { exports: {
      AuthGuardError,
      requireAdmin: async () => {
        if (role !== "admin") throw new AuthGuardError(role === "agent" ? 403 : 401, "Accès réservé aux administrateurs.");
        return { id: actor.id, role };
      },
    } };
    let failRevalidation = false;
    loadSource.cache[cachePath] = { exports: { revalidatePath() {
      if (failRevalidation) throw new Error("test cache failure");
    } } };
    try {
      const stockPOST = loadSource(stockPath).POST, productPOST = loadSource(productPath).POST;
      for (const denied of ["agent", null]) {
        role = denied;
        for (const handler of [stockPOST, productPOST]) {
          const response = await handler({ json() { throw new Error("Auth must run first"); } });
          assert.equal(response.status, denied ? 403 : 401);
        }
      }
      role = "admin";
      const request = (body) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
      assert.equal((await stockPOST(new Request("http://localhost/api", { method: "POST", body: "{" }))).status, 400);
      const id = variant("api-stock");
      const opening = batch("api-opening", "opening", [{ variantId: id, qty: 2 }]);
      const opened = await stockPOST(request(opening));
      assert.equal(opened.status, 200);
      const original = await opened.json();
      assert.equal((await stockPOST(request(batch("api-receive", "receive", [{ variantId: id, qty: 1 }])))).status, 200);
      assert.deepEqual(await (await stockPOST(request(opening))).json(), original);
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
      const productBody = { ...productInput("api-product"), requestId: "api-product-create",
        initialStock: [{ colorKey: "Noir", size: "37", qty: 2 }] };
      const created = await productPOST(request(productBody));
      assert.equal(created.status, 201);
      const product = (await created.json()).product;
      assert.equal(product.variants.find(v => v.colorName === "Noir" && v.size === "37").available, 2);
      const retry = await productPOST(request(productBody));
      assert.equal(retry.status, 201);
      assert.equal((await retry.json()).product.id, product.id);
      assert.equal((await productPOST(request({ ...productBody, name: "Autre" }))).status, 409);
      assert.equal((await productPOST(request({ ...productInput("!!!") }))).status, 400);
      assert.equal((await productPOST(request({ ...productBody, requestId: "different-create" }))).status, 409);

      // A failure after the transaction committed must remain uncertain (5xx in Next),
      // never a definitive 400 that lets the client discard the original request ID.
      const uncertainBody = { ...productBody, slug: "api-product-uncertain", requestId: "api-product-uncertain-create" };
      failRevalidation = true;
      await assert.rejects(productPOST(request(uncertainBody)), /test cache failure/);
      const committed = getProductById(uncertainBody.slug);
      assert.equal(committed.variants.find(v => v.colorName === "Noir" && v.size === "37").available, 2);
      failRevalidation = false;
      const recovered = await productPOST(request(uncertainBody));
      assert.equal(recovered.status, 201);
      assert.equal((await recovered.json()).product.id, committed.id);
      assert.equal(inventory.listMovements({ variantId: committed.variants.find(v => v.colorName === "Noir" && v.size === "37").variantId }).length, 1);
    } finally {
      for (const [key, value] of previous) {
        if (value) loadSource.cache[key] = value;
        else delete loadSource.cache[key];
      }
    }
  });
}
