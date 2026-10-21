import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zehri-lifecycle-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
const { getDb, createOrder, getOrder } = loadSource("@/lib/db");
const { listOrders, countDueCallbacks, getCrmOrder } = loadSource("@/lib/services/orders");
const { changeOrderLifecycle } = loadSource("@/lib/services/order-lifecycle");
const db = getDb();
const admin = { id: "admin", role: "admin" };
const agent = { id: "agent", role: "agent" };
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

function order(id) {
  createOrder({ id, customerName: "Test", customerPhone: "+212612345678", items: [],
    subtotal: 100, shipping: 29, total: 129 });
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
  db.prepare("INSERT INTO product_colors (id, product_id, name) VALUES ('c', 'p', 'Noir')").run();
  db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES ('v', 'p', 'c', '38', 'v')").run();
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
