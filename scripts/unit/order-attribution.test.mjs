import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { loadSource } from "../test-source.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-attribution-"));
Object.assign(process.env, {
  DB_PATH: path.join(tempDir, "test.db"), UPLOAD_DIR: path.join(tempDir, "uploads"),
  DELIVERY_PROVIDER: "mock", CRM_PUBLIC_URL: "https://crm.example.test", AUTH_SECRET: randomBytes(32).toString("hex"),
});
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  return name === "server-only" ? {} : originalLoad.call(this, name, ...args);
};
const { getDb } = loadSource("@/lib/db");
const { createProduct } = loadSource("@/lib/services/catalog");
const { storefrontOrderService } = loadSource("@/lib/storefront-order-api");
const { listOrders, getCrmOrder } = loadSource("@/lib/services/orders");
const { orderAttributionFields } = loadSource("@/lib/storefront-api-schemas");
Module._load = originalLoad;
const db = getDb();
after(() => { db.close(); fs.rmSync(tempDir, { recursive: true, force: true }); });

const product = createProduct({ name: "Appareil", category: "gadgets", price: 300, images: ["/images/main.webp"] });
const variantId = product.variants[0].id;
let phone = 10000000;
const input = (attribution) => ({
  customer: { name: "Salma Benali", phone: `06${phone++}` },
  items: [{ variantId, qty: 1 }],
  meta: { eventId: randomUUID(), sourceUrl: "https://shop.example.test/l/x", ...attribution },
});
const row = (id) => db.prepare("SELECT * FROM orders WHERE id = ?").get(id);

test("attribution persists on the order and shows in getCrmOrder", () => {
  const data = input({ utm_source: "facebook", utm_campaign: "ete", referrerHost: "l.facebook.com", landingPath: "/l/x", clickIdType: "fbclid" });
  const { response } = storefrontOrderService().checkout(randomUUID(), data);
  const stored = row(response.orderId);
  assert.equal(stored.utm_source, "facebook");
  assert.equal(stored.utm_campaign, "ete");
  assert.equal(stored.utm_medium, null);
  assert.equal(stored.referrer_host, "l.facebook.com");
  assert.equal(stored.landing_path, "/l/x");
  assert.equal(stored.click_id_type, "fbclid");
  const crm = getCrmOrder(response.orderId);
  assert.equal(crm.attribution.utmSource, "facebook");
  assert.equal(crm.attribution.utmMedium, null);
});

test("orders without attribution have null attribution", () => {
  const { response } = storefrontOrderService().checkout(randomUUID(), { ...input(), meta: undefined });
  assert.equal(getCrmOrder(response.orderId).attribution, null);
});

test("replay with the same payload returns the receipt and never rewrites attribution", () => {
  const key = randomUUID();
  const data = input({ utm_source: "tiktok", utm_campaign: "promo" });
  const first = storefrontOrderService().checkout(key, data);
  db.prepare("UPDATE orders SET utm_source = 'edited' WHERE id = ?").run(first.response.orderId);
  const again = storefrontOrderService().checkout(key, data);
  assert.equal(again.status, 200);
  assert.equal(again.response.orderId, first.response.orderId);
  assert.equal(row(first.response.orderId).utm_source, "edited");
  // Different attribution under the same key is a different request.
  assert.throws(() => storefrontOrderService().checkout(key, input({ utm_source: "other" })));
});

test("field caps and shapes: oversized or malformed values are rejected by the field schema", () => {
  const f = orderAttributionFields;
  assert.equal(f.utm_source.safeParse("a".repeat(201)).success, false);
  assert.equal(f.utm_source.safeParse("bad\u0007").success, false);
  assert.equal(f.utm_campaign.safeParse("ete 2026").success, true);
  assert.equal(f.landingPath.safeParse("x/no-slash").success, false);
  assert.equal(f.landingPath.safeParse("/l/x").success, true);
  assert.equal(f.referrerHost.safeParse("evil host").success, false);
  assert.equal(f.referrerHost.safeParse("l.facebook.com").success, true);
  assert.equal(f.clickIdType.safeParse("other").success, false);
  assert.equal(f.clickIdType.safeParse("sccid").success, true);
});

test("listOrders filters by utmSource and utmCampaign", () => {
  const all = listOrders({ status: "all", pageSize: 100 });
  const fb = listOrders({ status: "all", utmSource: "facebook" });
  assert.equal(fb.total, 1);
  assert.equal(fb.orders[0].id, all.orders.find((o) => o.id === fb.orders[0].id).id);
  assert.equal(listOrders({ status: "all", utmSource: "facebook", utmCampaign: "ete" }).total, 1);
  assert.equal(listOrders({ status: "all", utmSource: "facebook", utmCampaign: "nope" }).total, 0);
  assert.equal(listOrders({ status: "all", utmCampaign: "promo" }).total, 1);
});
