import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "../test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-delivery-outcomes-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
process.env.DELIVERY_PROVIDER = "mock";

const { getDb } = loadSource("@/lib/db");
import { createOrder } from "../fulfillment-fixtures.mjs";
const { openStock, reserveForOrder } = loadSource("@/lib/services/inventory");
const { setDeliveryOutcome, getDeliveryOutcome } = loadSource("@/lib/services/delivery-outcomes");
const db = getDb();
const now = new Date().toISOString();
const agent = { id: "agent1", role: "agent" };
const admin = { id: "admin1", role: "admin" };

after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
  VALUES ('p', 'p', 'Sérum', 'soins', 300, ?, ?)`).run(now, now);
db.prepare(`INSERT INTO variants (id, product_id, sku, label, options_json, options_key)
  VALUES ('v', 'p', 'v', '500 ml', '[]', '[]')`).run();
openStock("v", 50, "test");

let n = 0;
function shipped({ submitted = true } = {}) {
  const id = `D${++n}`;
  createOrder({
    id, customerName: "Cliente", customerPhone: "+212612345678",
    items: [{ product_id: "p", variant_id: "v", sku: "v", name: "Sérum", variant_label: "500 ml", options: [], quantity: 1, unit_price: 300, line_total: 300 }],
    subtotal: 300, shipping: 29, total: 329,
  });
  reserveForOrder(id, [{ variantId: "v", qty: 1 }], "test", "test");
  db.prepare("UPDATE orders SET confirmation_status = 'confirmed' WHERE id = ?").run(id);
  db.prepare(`INSERT INTO courier_submissions (id, order_id, status, tracking_number, next_retry_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(`s${id}`, id, submitted ? "submitted" : "queued", submitted ? `TRK${id}` : null, now, now, now);
  return { id, sub: `s${id}` };
}
const dispatches = (id) => db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE order_id = ? AND kind = 'dispatch'").get(id).n;
const returns = (sub) => db.prepare("SELECT COUNT(*) n FROM returns WHERE submission_id = ?").get(sub).n;

test("delivered records dispatch once", () => {
  const { id } = shipped();
  const first = setDeliveryOutcome(id, "delivered", agent, "agent");
  const second = setDeliveryOutcome(id, "delivered", agent, "agent");
  assert.equal(first.outcome, "delivered");
  assert.equal(second.at, first.at);
  assert.equal(dispatches(id), 1);
  assert.equal(db.prepare("SELECT cod_status c FROM orders WHERE id = ?").get(id).c, "awaiting_payment");
});

test("refused creates one return", () => {
  const { id, sub } = shipped();
  setDeliveryOutcome(id, "refused", agent, "agent");
  setDeliveryOutcome(id, "refused", agent, "agent");
  assert.equal(returns(sub), 1);
});

test("tracking never overrides an agent outcome", () => {
  const { id } = shipped();
  setDeliveryOutcome(id, "delivered", agent, "agent");
  const res = setDeliveryOutcome(id, "refused", "tracking-poller", "tracking");
  assert.equal(res.outcome, "delivered");
  assert.equal(res.source, "agent");
  assert.equal(getDeliveryOutcome(id).outcome, "delivered");
});

test("unsubmitted order is rejected with 409", () => {
  const { id } = shipped({ submitted: false });
  assert.throws(() => setDeliveryOutcome(id, "delivered", agent, "agent"), (e) => e.status === 409);
  assert.equal(getDeliveryOutcome(id), null);
});

test("agent cannot flip; admin can with reason and no restock", () => {
  const { id, sub } = shipped();
  setDeliveryOutcome(id, "delivered", agent, "agent");
  assert.throws(() => setDeliveryOutcome(id, "refused", agent, "agent", "x"), (e) => e.status === 409);
  assert.throws(() => setDeliveryOutcome(id, "refused", admin, "agent"), (e) => e.status === 400);
  const before = db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n;
  const res = setDeliveryOutcome(id, "refused", admin, "agent", "Erreur de saisie");
  assert.equal(res.outcome, "refused");
  assert.equal(returns(sub), 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_movements").get().n, before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM order_contacts WHERE order_id = ? AND note LIKE '%Erreur de saisie%'").get(id).n, 1);
});
