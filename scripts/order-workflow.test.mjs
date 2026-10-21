import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSource } from "./test-source.mjs";

const childAction = process.env.ZEHRI_WORKFLOW_TEST_ACTION;
const tempDir = childAction ? null : fs.mkdtempSync(path.join(os.tmpdir(), "zehri-order-workflow-"));
if (tempDir) process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";

const { createOrder, getDb, getOrder, resolveUpsell, UpsellConflictError } = loadSource("@/lib/db");
const { confirmOrder, cancelOrder, updateOrderLine, ConfirmationError } = loadSource("@/lib/services/confirmation");
const { insertContact, listOrders } = loadSource("@/lib/services/orders");
const { openStock } = loadSource("@/lib/services/inventory");
const { createSubmission } = loadSource("@/lib/services/submissions");
const { getDashboard } = loadSource("@/lib/services/dashboard");
const db = getDb();
const actor = { id: "test-agent" };
const confirmation = {
  lines: [{ lineIndex: 0, variantId: "test-main" }, { lineIndex: 1, variantId: "test-upsell" }],
  address: "12 rue de test",
  cityId: 1,
};

if (childAction) {
  process.once("message", () => {
    try {
      const id = process.env.ZEHRI_WORKFLOW_TEST_ORDER;
      const result = childAction === "confirm"
        ? confirmOrder(id, confirmation, actor)
        : resolveUpsell(id, childAction);
      process.send({ ok: true, result });
    } catch (error) {
      process.send({ ok: false, error: error.name, message: error.message });
    } finally {
      db.close();
      process.disconnect();
    }
  });
  process.send({ ready: true });
} else {
  after(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
    VALUES ('test-product', 'test-product', 'Bottines test', 'bottines', 300, ?, ?)`).run(now, now);
  db.prepare(`INSERT INTO product_colors (id, product_id, name)
    VALUES ('test-color', 'test-product', 'Noir')`).run();
  for (const [id, size] of [["test-main", "38"], ["test-upsell", "39"]]) {
    db.prepare(`INSERT INTO variants (id, product_id, color_id, size, sku)
      VALUES (?, 'test-product', 'test-color', ?, ?)`).run(id, size, id);
    openStock(id, 100, actor.id);
  }
  db.prepare("INSERT INTO cities (id, name, updated_at) VALUES (1, 'Casablanca', ?)").run(now);

  function order(id) {
    return createOrder({
      id,
      customerName: "Cliente test",
      customerPhone: "+212612345678",
      items: [{ product_id: "test-product", name: "Bottines test", color: "Noir", size: "38",
        quantity: 1, unit_price: 300, line_total: 300 }],
      upsellOffer: { product_id: "test-product", name: "Bottines test", original_price: 300, upsell_price: 210 },
      subtotal: 300,
      shipping: 29,
      total: 329,
    });
  }

  function contact(id, outcome, nextCallbackAt = null) {
    return insertContact({ orderId: id, agentId: actor.id, channel: "phone", outcome, nextCallbackAt });
  }

  function state(id) {
    return {
      order: getOrder(id),
      reservations: db.prepare("SELECT * FROM reservations WHERE order_id = ? ORDER BY variant_id").all(id),
      submissions: db.prepare("SELECT * FROM courier_submissions WHERE order_id = ? ORDER BY rowid").all(id),
      movements: db.prepare("SELECT * FROM stock_movements WHERE order_id = ? ORDER BY rowid").all(id),
    };
  }

  function assertShipmentMatchesOrder(id) {
    const saved = state(id);
    assert.equal(saved.order.confirmationStatus, "confirmed");
    assert.equal(saved.submissions.length, 1);
    const payload = JSON.parse(saved.submissions[0].payload_json);
    assert.equal(payload.total, saved.order.total);
    const lines = [...saved.order.items, ...(saved.order.upsellItems ?? [])];
    assert.deepEqual(payload.items, lines.map(({ product_id, name, color, size, quantity }) => ({
      product_id, name, color, size, quantity,
    })));
    assert.equal(saved.reservations.reduce((sum, row) => sum + row.qty, 0), lines.reduce((sum, row) => sum + row.quantity, 0));
    assert.equal(saved.reservations.find(row => row.variant_id === "test-main")?.qty, 1);
    assert.equal(saved.reservations.find(row => row.variant_id === "test-upsell")?.qty ?? 0, saved.order.upsellStatus === "accepted" ? 1 : 0);
  }

  async function race(id, actions) {
    const children = actions.map(action => fork(fileURLToPath(import.meta.url), [], {
      env: { ...process.env, ZEHRI_WORKFLOW_TEST_ACTION: action, ZEHRI_WORKFLOW_TEST_ORDER: id },
      execArgv: [],
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    }));
    try {
      const results = children.map(child => new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("message", message => { if (!message.ready) resolve(message); });
        child.on("exit", code => { if (code !== 0) reject(new Error(`Test child exited ${code}`)); });
      }));
      const exits = children.map(child => new Promise(resolve => child.once("exit", resolve)));
      await Promise.all(children.map(child => new Promise(resolve => {
        child.once("message", message => { assert.equal(message.ready, true); resolve(); });
      })));
      for (const child of children) child.send("go");
      const values = await Promise.all(results);
      await Promise.all(exits);
      return values;
    } finally {
      for (const child of children) if (child.exitCode === null) child.kill();
    }
  }

  test("contact outcomes preserve confirmed/cancelled state and existing fulfillment", () => {
    order("confirmed-contacts");
    confirmOrder("confirmed-contacts", confirmation, actor);
    const before = state("confirmed-contacts");
    contact("confirmed-contacts", "no_answer");
    contact("confirmed-contacts", "call_back_later", "2020-01-01T00:00:00.000Z");
    contact("confirmed-contacts", "note");
    assert.deepEqual(state("confirmed-contacts"), before);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM order_contacts WHERE order_id = ?").get("confirmed-contacts").n, 3);
    assert.equal(confirmOrder("confirmed-contacts", confirmation, actor).created, false);
    assert.deepEqual(state("confirmed-contacts"), before);

    order("cancelled-contacts");
    cancelOrder("cancelled-contacts", { reason: "Annulation test" }, actor);
    const cancelled = state("cancelled-contacts");
    contact("cancelled-contacts", "no_answer");
    contact("cancelled-contacts", "call_back_later", "2020-01-01T00:00:00.000Z");
    assert.deepEqual(state("cancelled-contacts"), cancelled);
    assert.throws(() => confirmOrder("cancelled-contacts", confirmation, actor), ConfirmationError);
  });

  test("pre-confirmation contacts still transition; callback rescheduling/notes/resolution are current", () => {
    order("callbacks");
    contact("callbacks", "no_answer");
    assert.equal(getOrder("callbacks").confirmationStatus, "no_answer");
    contact("callbacks", "call_back_later", "2099-01-01T00:00:00.000Z");
    contact("callbacks", "call_back_later", "2020-01-01T00:00:00.000Z");
    contact("callbacks", "note");
    assert.equal(listOrders({ status: "all", callbackDue: true }).orders.find(row => row.id === "callbacks")?.nextCallbackAt, "2020-01-01T00:00:00.000Z");
    assert.ok(getDashboard().callbacksDue.rows.some(row => row.orderId === "callbacks"));
    contact("callbacks", "no_answer");
    assert.ok(!listOrders({ status: "all", callbackDue: true }).orders.some(row => row.id === "callbacks"));
    contact("callbacks", "call_back_later", "2020-01-01T00:00:00.000Z");
    confirmOrder("callbacks", confirmation, actor);
    assert.ok(!listOrders({ status: "all", callbackDue: true }).orders.some(row => row.id === "callbacks"));
    assert.equal(getDashboard().callbacksDue.count, 0);
  });

  test("submission history blocks reconfirmation/line edits even if an old contact corrupted status", () => {
    for (const status of ["queued", "submitting", "submitted", "failed", "needs_review"]) {
      const id = `history-${status}`;
      order(id);
      const result = confirmOrder(id, confirmation, actor);
      db.prepare("UPDATE courier_submissions SET status = ? WHERE id = ?").run(status, result.submissionId);
      db.prepare("UPDATE orders SET confirmation_status = 'no_answer' WHERE id = ?").run(id);
      const before = state(id);
      assert.throws(() => confirmOrder(id, confirmation, actor), error => error instanceof ConfirmationError && error.status === 409);
      assert.throws(() => updateOrderLine(id, { lineIndex: 0, variantId: "test-upsell" }, actor), ConfirmationError);
      assert.deepEqual(state(id), before);
    }
  });

  test("resolved reservation history cannot be replayed into an unreserved shipment", () => {
    order("released-history");
    confirmOrder("released-history", confirmation, actor);
    cancelOrder("released-history", { reason: "Test" }, actor);
    db.prepare("DELETE FROM courier_submissions WHERE order_id = ?").run("released-history");
    db.prepare("UPDATE orders SET confirmation_status = 'new' WHERE id = ?").run("released-history");
    const before = state("released-history");
    assert.throws(() => confirmOrder("released-history", confirmation, actor), ConfirmationError);
    assert.deepEqual(state("released-history"), before);
  });

  test("upsell accepted first is resolved/reserved in the courier snapshot and replay cannot double-charge", () => {
    order("upsell-first");
    resolveUpsell("upsell-first", "accept");
    assert.equal(getOrder("upsell-first").total, 510);
    assert.throws(() => confirmOrder("upsell-first", { ...confirmation, lines: [] }, actor), ConfirmationError);
    assert.equal(state("upsell-first").reservations.length, 0);
    confirmOrder("upsell-first", confirmation, actor);
    assertShipmentMatchesOrder("upsell-first");
    const before = state("upsell-first");
    resolveUpsell("upsell-first", "accept");
    resolveUpsell("upsell-first", "decline");
    assert.deepEqual(state("upsell-first"), before);
  });

  test("confirmation first closes pending upsell; late acceptance/decline never changes COD or stock", () => {
    order("confirmation-first");
    confirmOrder("confirmation-first", confirmation, actor);
    assert.equal(getOrder("confirmation-first").upsellStatus, "declined");
    const before = state("confirmation-first");
    assert.equal(resolveUpsell("confirmation-first", "accept").upsellStatus, "declined");
    resolveUpsell("confirmation-first", "decline");
    assert.deepEqual(state("confirmation-first"), before);
    assertShipmentMatchesOrder("confirmation-first");
  });

  test("failed confirmation does not close the offer or partially reserve stock", () => {
    order("confirmation-rollback");
    const before = state("confirmation-rollback");
    const failInsert = db.prepare(`CREATE TEMP TRIGGER reject_test_submission BEFORE INSERT ON courier_submissions
      WHEN NEW.order_id = 'confirmation-rollback' BEGIN SELECT RAISE(ABORT, 'test submission failure'); END`);
    failInsert.run();
    try {
      assert.throws(() => confirmOrder("confirmation-rollback", confirmation, actor), /test submission failure/);
      assert.deepEqual(state("confirmation-rollback"), before);
    } finally {
      db.exec("DROP TRIGGER reject_test_submission");
    }
  });

  test("pending offers cannot mutate cancelled, legacy confirmed, or already-submitted orders", () => {
    for (const kind of ["cancelled", "confirmed", "submission"]) {
      const id = `frozen-${kind}`;
      order(id);
      if (kind === "submission") createSubmission(id);
      else db.prepare("UPDATE orders SET confirmation_status = ? WHERE id = ?").run(kind, id);
      const before = state(id);
      for (const action of ["accept", "decline"]) {
        assert.throws(() => resolveUpsell(id, action), UpsellConflictError);
      }
      assert.deepEqual(state(id), before);
    }
  });

  test("upsell API returns a French 409 for frozen pending orders and actual declined status for late accept", async () => {
    const { POST } = loadSource("@/app/api/orders/[id]/upsell/route");
    for (const [id, expected] of [["frozen-confirmed", 409], ["confirmation-first", 200]]) {
      const response = await POST(new Request(`http://localhost/api/orders/${id}/upsell`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }),
      }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, expected);
      const body = await response.json();
      if (expected === 409) assert.match(body.error, /commande/);
      else { assert.equal(body.status, "declined"); assert.equal(body.order.total, 329); }
    }
  });

  test("two SQLite processes accepting the same upsell add exactly one pair/discount", { timeout: 20000 }, async () => {
    order("concurrent-accept");
    const results = await race("concurrent-accept", ["accept", "accept"]);
    assert.ok(results.every(result => result.ok));
    assert.equal(getOrder("concurrent-accept").total, 510);
    assert.equal(getOrder("concurrent-accept").upsellItems.length, 1);
  });

  test("upsell acceptance racing confirmation produces one consistent reserved parcel", { timeout: 20000 }, async () => {
    for (let index = 0; index < 3; index += 1) {
      const id = `concurrent-confirm-${index}`;
      order(id);
      const results = await race(id, ["accept", "confirm"]);
      assert.ok(results.every(result => result.ok), JSON.stringify(results));
      assertShipmentMatchesOrder(id);
      assert.ok(["accepted", "declined"].includes(getOrder(id).upsellStatus));
    }
  });

  test("acceptance racing decline has exactly one durable outcome", { timeout: 20000 }, async () => {
    order("concurrent-decline");
    const results = await race("concurrent-decline", ["accept", "decline"]);
    assert.ok(results.every(result => result.ok));
    const current = getOrder("concurrent-decline");
    assert.equal(current.total, current.upsellStatus === "accepted" ? 510 : 329);
    assert.equal(current.upsellItems?.length ?? 0, current.upsellStatus === "accepted" ? 1 : 0);
    assert.equal(results[0].result.upsellStatus, results[1].result.upsellStatus);
  });
}
