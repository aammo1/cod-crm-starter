import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";
import { purgeConfirmedTests } from "../src/lib/services/inventory-test-cleanup.mjs";
import { loadSource } from "./test-source.mjs";
import { genericProduct } from "./order-operations-fixtures.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-test-purge-"));
process.env.DB_PATH = path.join(dir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
const { getDb } = loadSource("@/lib/db");
const { openStock, reserveForOrder, dispatchOrder } = loadSource("@/lib/services/inventory");
const db = getDb();
after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
let serial = 0;
function fixture() {
  const prefix = `f${++serial}`;
  const v = `${prefix}-v`;
  const ids = [`ord_${prefix}_active`, `ord_${prefix}_dispatched`];
  const other = `ord_${prefix}_other`;
  const now = new Date().toISOString();
  genericProduct(db, prefix, 100, [[v, []]]);
  openStock(v, 100, "test");
  // The cleanup guard rejects any count at or after the first order movement. openStock stamps the
  // wall clock, so it can share a millisecond with the reservation; pin it strictly earlier.
  db.prepare("UPDATE stock_movements SET created_at = '2000-01-01T00:00:00.000Z' WHERE variant_id = ? AND kind = 'opening'").run(v);
  for (const [index, id] of [...ids, other].entries()) {
    const quantity = index === 0 ? 2 : 1;
    db.prepare(`INSERT INTO orders (id, customer_name, customer_phone, items_json, upsell_status,
      subtotal, shipping, total, currency, created_at, updated_at, confirmation_status)
      VALUES (?, 'Test', '+212612345678', ?, 'closed', ?, 29, ?, 'MAD', ?, ?, 'confirmed')`).run(id,
        JSON.stringify([{ product_id: prefix, variant_id: v, sku: v, name: "Test", variant_label: "Standard",
          options: [], quantity, unit_price: 100, line_total: 100 * quantity }]), 100 * quantity, 100 * quantity + 29, now, now);
    reserveForOrder(id, [{ variantId: v, qty: index === 0 ? 2 : 1 }], "test", "test");
    db.prepare(`INSERT INTO courier_submissions (id, order_id, status, next_retry_at, created_at, updated_at)
      VALUES (?, ?, 'submitted', ?, ?, ?)`).run(`${id}-s`, id, now, now, now);
  }
  dispatchOrder(ids[1], "test");
  const note = `${prefix}-note`, operation = `${prefix}-op`;
  db.prepare("INSERT INTO delivery_notes (id, ref, status, created_at) VALUES (?, ?, 'saved', ?)").run(note, note, now);
  db.prepare(`INSERT INTO bl_operations (id, delivery_note_id, status, stage, created_by, created_at, updated_at)
    VALUES (?, ?, 'completed', 'done', 'test', ?, ?)`).run(operation, note, now, now);
  for (const id of ids) {
    db.prepare("INSERT INTO delivery_note_parcels VALUES (?, ?, ?)").run(note, `${id}-s`, now);
    db.prepare("INSERT INTO bl_operation_parcels VALUES (?, ?, ?, ?)").run(`${id}-s`, operation, id, now);
    db.prepare(`INSERT INTO tracking_events (id, submission_id, raw_status, normalized_status, created_at)
      VALUES (?, ?, 'test', 'unknown', ?)`).run(`${id}-event`, `${id}-s`, now);
    db.prepare("INSERT INTO order_contacts (id, order_id, channel, outcome, created_at) VALUES (?, ?, 'note', 'note', ?)").run(id, id, now);
    db.prepare("INSERT INTO meta_purchases (order_id, event_id, context_json, deadline) VALUES (?, ?, '{}', 0)").run(id, `${id}-meta`);
    db.prepare("INSERT INTO meta_events (event_id, payload_json, available_at) VALUES (?, '{}', 0)").run(`${id}-meta`);
  }
  db.prepare("INSERT INTO bl_operation_events (id, operation_id, stage, kind, actor, created_at) VALUES (?, ?, 'done', 'succeeded', 'test', ?)").run(prefix, operation, now);
  return { ids, other, v, note, operation };
}
const balance = (v) => db.prepare("SELECT physical, reserved, quarantine FROM stock_balances WHERE variant_id = ?").get(v);

test("preview is non-destructive; purge reverses only selected test inventory and preserves other orders", () => {
  const f = fixture();
  const preview = purgeConfirmedTests(db, f.ids);
  assert.equal(preview.pairsReleased, 2);
  assert.equal(preview.pairsRestored, 1);
  assert.deepEqual(balance(f.v), { physical: 99, reserved: 3, quarantine: 0 });
  const otherBefore = db.prepare("SELECT * FROM orders WHERE id = ?").get(f.other);
  purgeConfirmedTests(db, f.ids, { apply: true });
  assert.deepEqual(balance(f.v), { physical: 100, reserved: 1, quarantine: 0 });
  assert.deepEqual(db.prepare("SELECT * FROM orders WHERE id = ?").get(f.other), otherBefore);
  for (const id of f.ids) {
    for (const table of ["orders", "order_contacts", "reservations", "stock_movements", "courier_submissions", "meta_purchases"]) {
      const key = table === "orders" ? "id" : "order_id";
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${key} = ?`).get(id).n, 0);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM meta_events WHERE event_id = ?").get(`${id}-meta`).n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tracking_events WHERE submission_id = ?").get(`${id}-s`).n, 0);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM delivery_notes WHERE id = ?").get(f.note).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bl_operations WHERE id = ?").get(f.operation).n, 0);
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.throws(() => purgeConfirmedTests(db, f.ids, { apply: true }), /absente/);
  assert.deepEqual(balance(f.v), { physical: 100, reserved: 1, quarantine: 0 });
});

test("shared delivery notes, running provider work, returns, and later recounts block all changes", () => {
  for (const scenario of ["shared", "running", "return", "recount"]) {
    const f = fixture();
    if (scenario === "shared") db.prepare("INSERT INTO delivery_note_parcels VALUES (?, ?, ?)").run(f.note, `${f.other}-s`, new Date().toISOString());
    if (scenario === "running") db.prepare("UPDATE bl_operations SET status = 'running', stage = 'save' WHERE id = ?").run(f.operation);
    if (scenario === "return") db.prepare("INSERT INTO returns (id, submission_id, created_at) VALUES (?, ?, ?)").run(f.v, `${f.ids[1]}-s`, new Date().toISOString());
    if (scenario === "recount") db.prepare(`INSERT INTO stock_movements (id, variant_id, kind, qty, actor, source, ref, created_at)
      VALUES (?, ?, 'adjust_physical', 0, 'test', 'test', ?, '2999-01-01')`).run(f.v, f.v, f.v);
    const before = balance(f.v);
    assert.throws(() => purgeConfirmedTests(db, f.ids, { apply: true }));
    assert.deepEqual(balance(f.v), before);
    assert.ok(db.prepare("SELECT 1 FROM orders WHERE id = ?").get(f.ids[0]));
  }
});

test("late foreign-key failure rolls inventory and all deletions back", () => {
  const f = fixture();
  db.exec("CREATE TABLE test_order_reference (order_id TEXT REFERENCES orders(id))");
  db.prepare("INSERT INTO test_order_reference VALUES (?)").run(f.ids[1]);
  const before = balance(f.v);
  assert.throws(() => purgeConfirmedTests(db, f.ids, { apply: true }), /FOREIGN KEY/);
  assert.deepEqual(balance(f.v), before);
  assert.ok(db.prepare("SELECT 1 FROM bl_operations WHERE id = ?").get(f.operation));
  assert.ok(db.prepare("SELECT 1 FROM orders WHERE id = ?").get(f.ids[0]));
  db.exec("DROP TABLE test_order_reference");
});

test("explicit simulated-stock override permits later recounts but still protects shared history", () => {
  const f = fixture();
  db.prepare(`INSERT INTO stock_movements (id, variant_id, kind, qty, actor, source, ref, created_at)
    VALUES (?, ?, 'adjust_physical', 0, 'test', 'test', ?, '2999-01-01')`).run(f.v, f.v, f.v);
  assert.throws(() => purgeConfirmedTests(db, f.ids), /comptage/);
  const options = { allowLaterStockCounts: true };
  assert.equal(purgeConfirmedTests(db, f.ids, options).allowLaterStockCounts, true);
  assert.ok(db.prepare("SELECT 1 FROM orders WHERE id = ?").get(f.ids[0]));
  db.prepare("INSERT INTO delivery_note_parcels VALUES (?, ?, ?)").run(f.note, `${f.other}-s`, new Date().toISOString());
  assert.throws(() => purgeConfirmedTests(db, f.ids, { ...options, apply: true }), /partagé/);
  db.prepare("DELETE FROM delivery_note_parcels WHERE submission_id = ?").run(`${f.other}-s`);
  const run = spawnSync(process.execPath, ["scripts/purge-confirmed-tests.mjs", `--orders=${f.ids.join(",")}`, "--allow-later-stock-counts", "--apply"], { encoding: "utf8", env: process.env });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(balance(f.v), { physical: 100, reserved: 1, quarantine: 0 });
  assert.equal(db.prepare("SELECT 1 FROM orders WHERE id = ?").get(f.ids[0]), undefined);
  assert.ok(db.prepare("SELECT 1 FROM stock_movements WHERE id = ?").get(f.v));
});

test("CLI defaults to preview and creates a recoverable backup before applying", () => {
  const f = fixture();
  const run = (...extra) => spawnSync(process.execPath, ["scripts/purge-confirmed-tests.mjs", `--orders=${f.ids.join(",")}`, ...extra], { encoding: "utf8", env: process.env });
  const preview = run();
  assert.equal(preview.status, 0, preview.stderr);
  assert.ok(db.prepare("SELECT 1 FROM orders WHERE id = ?").get(f.ids[0]));
  const applied = run("--apply");
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(db.prepare("SELECT 1 FROM orders WHERE id = ?").get(f.ids[0]), undefined);
  const backupPath = applied.stdout.match(/^Backup OK : (.+)$/m)?.[1];
  assert.ok(backupPath);
  const backup = new Database(backupPath, { readonly: true });
  try {
    assert.ok(backup.prepare("SELECT 1 FROM orders WHERE id = ?").get(f.ids[0]));
    assert.deepEqual(backup.prepare("SELECT physical, reserved, quarantine FROM stock_balances WHERE variant_id = ?").get(f.v), { physical: 99, reserved: 3, quarantine: 0 });
  } finally { backup.close(); }
});
