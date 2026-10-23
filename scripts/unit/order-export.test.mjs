import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "../test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-order-export-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
process.env.DELIVERY_PROVIDER = "mock";

const { getDb } = loadSource("@/lib/db");
const { parseCsv } = loadSource("@/lib/csv");
const {
  buildOrdersCsv, resolveExportStatus, exportFileDate, OrderExportTooLargeError,
  ORDER_EXPORT_HEADERS, ORDER_EXPORT_MAX_ROWS,
} = loadSource("@/lib/services/order-export");
const db = getDb();

after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

db.prepare(`INSERT INTO users (id, email, password_hash, name, role, created_at)
  VALUES ('u1', 'a@example.test', 'x', 'Agent Été', 'agent', '2026-01-01T00:00:00Z')`).run();

function insert(id, over = {}) {
  const o = {
    name: "Cliente", phone: "+212612345678", status: "new", created: "2026-03-01T10:00:00.000Z",
    utm_source: null, utm_campaign: null, city: "Casablanca", address: "Rue 1", assigned: null, ...over,
  };
  db.prepare(`INSERT INTO orders (id, customer_name, customer_phone, items_json, upsell_status, subtotal, shipping, total,
    currency, created_at, updated_at, confirmation_status, city_name, address, utm_source, utm_campaign, assigned_to,
    discount_amount, delivery_outcome, delivery_outcome_at, cod_paid_at, cod_status)
    VALUES (?, ?, ?, ?, 'closed', 300, 29, 319, 'MAD', ?, ?, ?, ?, ?, ?, ?, ?, 10, ?, ?, ?, ?)`)
    .run(id, o.name, o.phone, JSON.stringify([{ name: "Sérum", quantity: 2, variant_label: "500 ml" }]),
      o.created, o.created, o.status, o.city, o.address, o.utm_source, o.utm_campaign, o.assigned,
      o.outcome ?? null, o.outcome ? o.created : null, o.paid ? o.created : null, o.paid ? "paid" : "awaiting_payment");
}

insert("E1", { utm_source: "fb", utm_campaign: "c1", assigned: "u1", outcome: "delivered", paid: true });
insert("E2", { utm_source: "tt", status: "confirmed", created: "2026-03-02T10:00:00.000Z" });
insert("E3", { name: '=HYPERLINK("http://evil","x")', address: "@cmd|' /C calc'!A0", phone: "+212611111111", created: "2026-03-03T10:00:00.000Z" });
insert("E4", { name: "-2+3", status: "cancelled", created: "2026-03-04T10:00:00.000Z" });
db.prepare("INSERT INTO blocked_phones (phone, reason, created_at) VALUES ('+212611111111', 'abus', '2026-03-01T00:00:00Z')").run();
db.prepare(`INSERT INTO courier_submissions (id, order_id, status, next_retry_at, tracking_number, created_at, updated_at)
  VALUES ('s1', 'E1', 'submitted', '2026-03-01', 'TRK1', '2026-03-01', '2026-03-01')`).run();

const parse = (csv) => parseCsv(csv, { delimiter: ";" }).rows;

test("BOM, French headers, ';' delimiter, CRLF, and CSV round-trip", () => {
  const { csv, rowCount } = buildOrdersCsv({ status: "all" });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.startsWith("﻿Référence;Date (Casablanca);"), true);
  assert.ok(csv.includes("\r\n"));
  assert.ok(!csv.includes("sep="));
  const rows = parse(csv);
  assert.equal(rowCount, 4);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], [...ORDER_EXPORT_HEADERS]);
  assert.equal(rows[0].length, 26);
  assert.ok(rows.every((r) => r.length === 26));
  const e1 = rows.find((r) => r[0] === "E1");
  assert.match(e1[1], /^01\/03\/2026/);
  assert.equal(e1[6], "Sérum ×2 (500 ml)");
  assert.equal(e1[7], "2");
  assert.deepEqual(e1.slice(8, 12), ["300", "10", "29", "319"]);
  assert.equal(e1[13], "Agent Été");
  assert.equal(e1[14], "Transmise au transporteur");
  assert.equal(e1[15], "TRK1");
  assert.equal(e1[16], "Livrée");
  assert.equal(e1[18], "Encaissée");
  assert.equal(e1[21], "fb");
  assert.equal(e1[25], "Non");
  assert.equal(rows.find((r) => r[0] === "E3")[25], "Oui");
});

test("formula injection is neutralized in every text cell", () => {
  const rows = parse(buildOrdersCsv({ status: "all" }).csv);
  const e3 = rows.find((r) => r[0] === "E3");
  assert.equal(e3[2], `'=HYPERLINK("http://evil","x")`);
  assert.equal(e3[5], "'@cmd|' /C calc'!A0");
  assert.equal(rows.find((r) => r[0] === "E4")[2], "'-2+3");
  for (const row of rows.slice(1)) for (const cell of row) assert.ok(!/^[=@\t\r]/.test(cell), cell);
});

test("filters are honored", () => {
  const ids = (f) => parse(buildOrdersCsv(f).csv).slice(1).map((r) => r[0]).sort();
  assert.deepEqual(ids({ status: "confirmed" }), ["E2"]);
  assert.deepEqual(ids({ status: "all", utmSource: "fb" }), ["E1"]);
  assert.deepEqual(ids({ status: "all", utmCampaign: "c1" }), ["E1"]);
  assert.deepEqual(ids({ status: "all", assignedTo: "u1" }), ["E1"]);
  assert.deepEqual(ids({ status: "all", submission: ["submitted"] }), ["E1"]);
  assert.deepEqual(ids({ status: "all", q: "0611111111" }), ["E3"]);
  assert.deepEqual(ids({ status: "all", q: "TRK1" }), ["E1"]);
  assert.deepEqual(ids({ status: "all", archived: true }), []);
  db.prepare("UPDATE orders SET archived_at = '2026-03-05T00:00:00Z' WHERE id = 'E4'").run();
  assert.deepEqual(ids({ status: "all", archived: true }), ["E4"]);
  assert.deepEqual(ids({ status: "all" }), ["E1", "E2", "E3"]);
});

test("status resolution mirrors the orders page", () => {
  assert.equal(resolveExportStatus(undefined, {}), "new");
  assert.equal(resolveExportStatus(undefined, { archived: true }), "all");
  assert.equal(resolveExportStatus("bogus", { submission: ["failed"] }), "all");
  assert.equal(resolveExportStatus("confirmed", { callbackDue: true }), "all");
  assert.equal(resolveExportStatus("cancelled", {}), "cancelled");
});

test("row cap fails instead of truncating", () => {
  assert.equal(ORDER_EXPORT_MAX_ROWS, 50000);
  assert.throws(() => buildOrdersCsv({ status: "all" }, { maxRows: 2 }), (e) =>
    e instanceof OrderExportTooLargeError && e.message === "Trop de lignes : affinez les filtres.");
  assert.equal(buildOrdersCsv({ status: "all" }, { maxRows: 3 }).rowCount, 3);
});

test("filename date is Casablanca", () => {
  assert.match(exportFileDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(exportFileDate(new Date("2026-07-01T12:00:00Z")), "2026-07-01");
});

test("phone exports in local form without apostrophe while free text stays guarded", () => {
  const rows = parse(buildOrdersCsv({ status: "all" }).csv);
  const e3 = rows.find((r) => r[0] === "E3");
  assert.equal(e3[3], "0611111111");
  assert.equal(rows.find((r) => r[0] === "E1")[3], "0612345678");
  assert.ok(rows.every((r) => r[0] === "Référence" || !r[3].startsWith("'")));
  assert.equal(e3[2].startsWith("'=HYPERLINK"), true);
});

test("accepted upsell items are appended to Articles and Quantité", () => {
  insert("E5", { created: "2026-03-05T10:00:00.000Z" });
  db.prepare("UPDATE orders SET upsell_status = 'accepted', upsell_items_json = ? WHERE id = 'E5'")
    .run(JSON.stringify([{ name: "Masque", quantity: 3 }]));
  insert("E6", { created: "2026-03-06T10:00:00.000Z" });
  db.prepare("UPDATE orders SET upsell_status = 'declined', upsell_items_json = ? WHERE id = 'E6'")
    .run(JSON.stringify([{ name: "Masque", quantity: 3 }]));
  const rows = parse(buildOrdersCsv({ status: "all" }).csv);
  const e5 = rows.find((r) => r[0] === "E5");
  assert.match(e5[6], /Sérum ×2/);
  assert.match(e5[6], /Masque ×3/);
  assert.equal(e5[7], "5");
  const e6 = rows.find((r) => r[0] === "E6");
  assert.equal(e6[7], "2");
  db.prepare("DELETE FROM orders WHERE id IN ('E5','E6')").run();
});
