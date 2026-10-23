import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "../test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-customers-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
process.env.DELIVERY_PROVIDER = "mock";

const { getDb } = loadSource("@/lib/db");
import { createOrder } from "../fulfillment-fixtures.mjs";
const customers = loadSource("@/lib/services/customers");
const { listOrders, getCustomerHistory } = loadSource("@/lib/services/orders");
const db = getDb();
const now = new Date().toISOString();

after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

db.prepare(`INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ('u1','a@x.test','x','Agent','agent',?)`).run(now);

function order(id, phone, outcome = null) {
  createOrder({
    id, customerName: "Cliente", customerPhone: phone,
    items: [{ product_id: "p", variant_id: "v", sku: "v", name: "Sérum", variant_label: "", options: [], quantity: 1, unit_price: 100, line_total: 100 }],
    subtotal: 100, shipping: 0, total: 100,
  });
  if (outcome) db.prepare("UPDATE orders SET delivery_outcome = ? WHERE id = ?").run(outcome, id);
}

test("block normalizes, rejects invalid, is idempotent, unblocks", () => {
  assert.throws(() => customers.blockPhone("123", "x", "u1"), /Numéro invalide/);
  assert.throws(() => customers.blockPhone("0612345678", "  ", "u1"), /Motif/);
  const first = customers.blockPhone("06 12 34 56 78", "refus", "u1");
  assert.deepEqual(first, { phone: "+212612345678", created: true });
  assert.equal(customers.blockPhone("+212612345678", "autre", "u1").created, false);
  assert.equal(customers.isPhoneBlocked("0612345678"), true);
  assert.equal(customers.getBlockedPhone("0612345678").reason, "refus");
  assert.equal(customers.listBlockedPhones().length, 1);
  assert.equal(customers.unblockPhone("0612345678"), true);
  assert.equal(customers.unblockPhone("0612345678"), false);
  assert.equal(customers.isPhoneBlocked("0612345678"), false);
});

test("order list flags and history counts", () => {
  order("B1", "+212612345678", "refused");
  order("B2", "+212612345678", "delivered");
  order("B3", "+212612345678");
  order("B4", "+212700000000");
  customers.blockPhone("0612345678", "refus répétés", "u1");
  const rows = Object.fromEntries(listOrders({ pageSize: 50 }).orders.map((o) => [o.id, o]));
  assert.equal(rows.B3.phoneBlocked, true);
  assert.equal(rows.B3.priorRefusals, 1);
  assert.equal(rows.B1.priorRefusals, 0);
  assert.equal(rows.B4.phoneBlocked, false);
  assert.equal(rows.B4.priorRefusals, 0);
  const history = getCustomerHistory("B3", "+212612345678");
  assert.equal(history.deliveredCount, 1);
  assert.equal(history.refusedCount, 1);
  assert.equal(history.blocked.reason, "refus répétés");
  assert.equal(getCustomerHistory("B4", "+212700000000").blocked, null);
});
