import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import Module from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "../test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-leads-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");
process.env.DELIVERY_PROVIDER = "mock";
process.env.AUTH_SECRET = "test-secret-".padEnd(40, "x");

const originalLoad = Module._load;
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : originalLoad.call(this, name, ...args);
};
const { getDb } = loadSource("@/lib/db");
const leads = loadSource("@/lib/services/checkout-leads");
const customers = loadSource("@/lib/services/customers");
const { budgetKey, consumeBudgetsDetailed } = loadSource("@/lib/services/security-budgets");
const db = getDb();
const now = new Date().toISOString();

after(() => { db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });

db.prepare(`INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES ('u1','a@x.test','x','Agent','agent',?)`).run(now);
db.prepare("INSERT INTO products (id, slug, name, category, price, created_at, updated_at) VALUES ('p','p','Sérum','soins',100,?,?)").run(now, now);
db.prepare("INSERT INTO products (id, slug, name, category, price, active, created_at, updated_at) VALUES ('off','off','Off','soins',100,0,?,?)").run(now, now);
const addVariant = (id, product, active = 1) => db.prepare(
  "INSERT INTO variants (id, product_id, sku, label, options_json, options_key, active) VALUES (?, ?, ?, 'Std', '[]', ?, ?)")
  .run(id, product, `SKU-${id}`, JSON.stringify([id]), active);
addVariant("v1", "p"); addVariant("v2", "p"); addVariant("vx", "p", 0); addVariant("vo", "off");
const rows = () => db.prepare("SELECT * FROM checkout_leads ORDER BY created_at").all();

test("records one lead, dedupes per phone, stores no prices", () => {
  assert.equal(leads.recordLead({ phone: "0612345678", name: "  Sara  ", items: [{ variantId: "v1", qty: 1 }], sourcePath: "/l/p" }), true);
  assert.equal(leads.recordLead({ phone: "+212 6 12 34 56 78", name: "Sara B", items: [{ variantId: "v1", qty: 2 }, { variantId: "v2", qty: 1, price: 1 }] }), true);
  const all = rows();
  assert.equal(all.length, 1);
  assert.equal(all[0].phone, "+212612345678");
  assert.equal(all[0].name, "Sara B");
  assert.deepEqual(JSON.parse(all[0].items_json), [{ variantId: "v1", qty: 2 }, { variantId: "v2", qty: 1 }]);
  assert.doesNotMatch(all[0].items_json, /price/);
  assert.equal(leads.listOpenLeads().length, 1);
});

test("invalid phone, unknown/inactive variants and blocked phones are not recorded", () => {
  assert.equal(leads.recordLead({ phone: "123", items: [{ variantId: "v1", qty: 1 }] }), false);
  assert.equal(leads.recordLead({ phone: "0700000001", items: [{ variantId: "nope", qty: 1 }, { variantId: "vx", qty: 1 }, { variantId: "vo", qty: 1 }] }), false);
  assert.equal(leads.recordLead({ phone: "0700000001", items: [{ variantId: "v1", qty: 0 }, { variantId: "v1", qty: 99 }] }), false);
  customers.blockPhone("0700000002", "refus", "u1");
  assert.equal(leads.recordLead({ phone: "0700000002", items: [{ variantId: "v1", qty: 1 }] }), false);
  assert.equal(rows().length, 1);
});

test("missing name falls back, then order conversion marks leads converted", () => {
  assert.equal(leads.recordLead({ phone: "0711111111", items: [{ variantId: "v1", qty: 1 }] }), true);
  assert.equal(rows().find((r) => r.phone === "+212711111111").name, "Sans nom");
  db.prepare(`INSERT INTO orders (id, customer_name, customer_phone, items_json, upsell_status, subtotal, shipping, total, currency, created_at, updated_at)
    VALUES ('O1','Sara','+212612345678','[]','closed',100,0,100,'MAD',?,?)`).run(now, now);
  assert.equal(leads.markLeadsConverted("0612345678", "O1"), 1);
  const row = rows().find((r) => r.phone === "+212612345678");
  assert.equal(row.status, "converted");
  assert.equal(row.converted_order_id, "O1");
  assert.equal(leads.markLeadsConverted("0612345678", "O1"), 0);
  assert.equal(leads.listOpenLeads().length, 1);
  // A new lead after conversion starts a fresh open lead.
  assert.equal(leads.recordLead({ phone: "0612345678", items: [{ variantId: "v2", qty: 1 }] }), true);
  assert.equal(rows().filter((r) => r.phone === "+212612345678").length, 2);
});

test("dismiss and contacted", () => {
  const id = rows().find((r) => r.phone === "+212711111111").id;
  leads.markLeadContacted(id);
  assert.equal(leads.getLead(id).status, "contacted");
  assert.equal(leads.listOpenLeads().some((l) => l.id === id), true);
  leads.dismissLead(id);
  assert.equal(leads.getLead(id).status, "dismissed");
  assert.throws(() => leads.dismissLead(id), /déjà/);
  assert.throws(() => leads.dismissLead("missing"), /introuvable/);
  assert.equal(leads.listOpenLeads().some((l) => l.id === id), false);
});

test("retention purges every status older than the window (created_at), keeps younger rows", () => {
  const day = 86_400_000;
  const old = new Date(Date.now() - 31 * day).toISOString();
  const young = new Date(Date.now() - 29 * day).toISOString();
  const ins = db.prepare(`INSERT INTO checkout_leads (id, phone, name, items_json, status, created_at, updated_at) VALUES (?, ?, 'X', '[]', ?, ?, ?)`);
  const count = (ids) => db.prepare(`SELECT COUNT(*) AS n FROM checkout_leads WHERE id IN (${ids.map(() => "?").join(",")})`).get(...ids).n;
  ins.run("old1", "+212600000001", "open", old, old);
  ins.run("old2", "+212600000002", "contacted", old, old);
  ins.run("old3", "+212600000003", "dismissed", old, old);
  ins.run("old5", "+212600000005", "converted", old, old);
  ins.run("young1", "+212600000011", "converted", young, young);
  ins.run("young2", "+212600000012", "dismissed", young, young);
  assert.equal(leads.listOpenLeads().some((l) => l.id.startsWith("old")), false);
  assert.equal(count(["old1", "old2", "old3", "old5"]), 0);
  assert.equal(count(["young1", "young2"]), 2);
  ins.run("old4", "+212600000004", "open", old, old);
  leads.recordLead({ phone: "0700000009", items: [{ variantId: "v1", qty: 1 }] });
  assert.equal(count(["old4"]), 0);
  assert.equal(count(["young1", "young2"]), 2);
  db.prepare("DELETE FROM checkout_leads WHERE id IN ('young1','young2')").run();
});

test("per-phone and per-IP budgets limit without affecting other phones", () => {
  const phoneBudget = (phone) => ({ key: budgetKey("store-lead:phone", phone), limit: 6, windowMs: 60_000, scope: "phone" });
  for (let i = 0; i < 6; i++) assert.equal(consumeBudgetsDetailed([phoneBudget("+212699999999")]).limited, false);
  assert.equal(consumeBudgetsDetailed([phoneBudget("+212699999999")]).limited, true);
  assert.equal(consumeBudgetsDetailed([phoneBudget("+212688888888")]).limited, false);
  assert.doesNotMatch(budgetKey("store-lead:phone", "+212699999999"), /699999999/);
  const ip = { key: budgetKey("store-lead:ip", "203.0.113.9"), limit: 10, windowMs: 60_000, scope: "ip" };
  for (let i = 0; i < 10; i++) assert.equal(consumeBudgetsDetailed([ip]).limited, false);
  assert.equal(consumeBudgetsDetailed([ip]).limited, true);
});

test("lead endpoint is 404 while leads are disabled (default)", async () => {
  const route = loadSource("@/app/api/store/leads/route");
  const res = await route.POST(new Request("http://localhost/api/store/leads", {
    method: "POST", headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify({ phone: "0612345678", items: [{ variantId: "v1", qty: 1 }] }),
  }));
  assert.equal(res.status, 404);
});
