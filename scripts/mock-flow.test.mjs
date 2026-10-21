import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "./test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zehri-mock-flow-"));
process.env.DB_PATH = path.join(tempDir, "test.db");
process.env.DELIVERY_PROVIDER = "mock";
process.env.OZON_CLIENT_ID = "";
process.env.OZON_API_KEY = "";

// Any real HTTP call (e.g. to Ozon) fails the flow loudly.
const realFetch = globalThis.fetch;
const httpCalls = [];
globalThis.fetch = async (url) => { httpCalls.push(String(url)); throw new Error("network disabled in test"); };

const { createOrder, getDb } = loadSource("@/lib/db");
const { confirmOrder } = loadSource("@/lib/services/confirmation");
const { openStock } = loadSource("@/lib/services/inventory");
const { createOrResumeBl } = loadSource("@/lib/services/delivery-notes");
const { handoffBl } = loadSource("@/lib/services/expeditions");
const { pollOnce } = loadSource("@/lib/services/tracking");
const { getProvider } = loadSource("@/lib/shipping");
const { createMockProvider } = loadSource("@/lib/shipping/mock");
const { syncCities } = loadSource("@/lib/shipping/ozon");
const { drainSubmissions } = loadSource("@/lib/workers/submission");
const db = getDb();
const actor = { id: "test-agent" };
const now = new Date().toISOString();

after(() => {
  globalThis.fetch = realFetch;
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
  VALUES ('p', 'p', 'Bottines test', 'bottines', 300, ?, ?)`).run(now, now);
db.prepare("INSERT INTO product_colors (id, product_id, name) VALUES ('c', 'p', 'Noir')").run();
db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES ('v', 'p', 'c', '38', 'v')").run();
openStock("v", 20, actor.id);

test("getProvider returns one shared mock and cities sync goes through it", async () => {
  assert.equal(getProvider(), getProvider());
  assert.equal(await syncCities(getProvider()), 5);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cities").get().n, 5);
  assert.equal(httpCalls.length, 0);
});

test("confirmation → submission → BL → handoff → tracking runs on one mock without HTTP", async () => {
  const ids = [];
  for (const n of [1, 2]) {
    const id = `flow-${n}`;
    createOrder({ id, customerName: "Cliente", customerPhone: "+212612345678",
      items: [{ product_id: "p", name: "Bottines test", color: "Noir", size: "38", quantity: 1, unit_price: 300, line_total: 300 }],
      upsellOffer: null, subtotal: 300, shipping: 29, total: 329 });
    ids.push(confirmOrder(id, { lines: [{ lineIndex: 0, variantId: "v" }], address: "12 rue test", cityId: 1 }, actor).submissionId);
  }

  await Promise.all([drainSubmissions(getProvider()), drainSubmissions(getProvider())]); // overlapping ticks are serialized
  const rows = db.prepare("SELECT id, status, tracking_number FROM courier_submissions ORDER BY id").all();
  assert.ok(rows.every((r) => r.status === "submitted" && r.tracking_number?.startsWith("OZEMOCK")), JSON.stringify(rows));
  assert.equal(new Set(rows.map((r) => r.tracking_number)).size, 2);

  const bl = await createOrResumeBl(ids, actor); // no explicit provider: shared mock
  assert.equal(bl.bl.status, "saved");
  assert.ok(bl.bl.ref.startsWith("BLMOCK"));
  assert.equal(handoffBl(bl.bl.id, actor.id).results.every((r) => r.ok), true);

  await pollOnce(); // shared mock knows the parcels it created
  const tracked = db.prepare("SELECT raw_status FROM courier_submissions WHERE id IN (?, ?)").all(...ids);
  assert.deepEqual(tracked.map((r) => r.raw_status), ["MOCK_CREATED", "MOCK_CREATED"]);

  assert.equal(httpCalls.length, 0);
});

test("mock numbers stay unique and trackable across a simulated restart", async () => {
  const code = db.prepare("SELECT tracking_number c FROM courier_submissions LIMIT 1").get().c;
  const restarted = createMockProvider(); // fresh in-memory state, like a new process
  const [seen] = await restarted.track([code]);
  assert.equal(seen.found, true);
  await new Promise((r) => setTimeout(r, 5)); // distinct boot id
  const input = { receiver: "x", priceMad: 1 };
  const a = (await restarted.createParcel(input)).trackingNumber;
  const b = (await createMockProvider().createParcel(input)).trackingNumber;
  assert.notEqual(a, b);
  assert.notEqual(a, code);
});
