import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { loadSource } from "./test-source.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zehri-security-"));
process.env.DB_PATH = path.join(temp, "test.db");
process.env.FACEBOOK_PIXEL_ID = "123456";
process.env.FACEBOOK_ACCESS_TOKEN = "test-only";
delete process.env.SECURITY_TRUSTED_IP_HEADER;
const { getDb, getOrder, resolveUpsell } = loadSource("@/lib/db");
const { consumeBudgets, trustedClientIp } = loadSource("@/lib/services/security-budgets");
const { authenticateCredentials } = loadSource("@/lib/services/credentials");
const { hashPassword, verifyPasswordAsync } = loadSource("@/lib/password");
const { readLimitedJson, readLimitedFormData } = loadSource("@/lib/request-body");
const { browserMutationAllowed } = loadSource("@/lib/browser-mutation");
const { createAgent, updateAgent, resetAgentPassword } = loadSource("@/lib/services/team");
const { openStock } = loadSource("@/lib/services/inventory");
const { POST: checkout } = loadSource("@/app/api/orders/route");
const { POST: upsell } = loadSource("@/app/api/orders/[id]/upsell/route");
const { POST: pixel } = loadSource("@/app/api/pixel/route");
const { finalizeMetaPurchases, purchaseFor } = loadSource("@/lib/services/meta");
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

const now = new Date().toISOString();
for (const [id, price] of [["main", 300], ["extra", 200]]) {
  db.prepare(`INSERT INTO products(id, slug, name, category, price, is_best_seller, created_at, updated_at)
    VALUES (?, ?, ?, 'bottines', ?, 1, ?, ?)`).run(id, id, id, price, now, now);
  db.prepare("INSERT INTO product_colors(id, product_id, name) VALUES (?, ?, 'Noir')").run(id + "-color", id);
  db.prepare("INSERT INTO variants(id, product_id, color_id, size, sku) VALUES (?, ?, ?, '38', ?)")
    .run(id + "-variant", id, id + "-color", id);
  openStock(id + "-variant", 20, "test-admin");
}
db.prepare("UPDATE products SET upsell_ref = 'extra' WHERE id = 'main'").run();

function request(body, route = "orders", headers = {}) {
  return new Request(`https://zehri.ma/api/${route}`, {
    method: "POST", headers: { host: "zehri.ma", origin: "https://zehri.ma", "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function payload(phone = "0612345678", attributed = false) {
  return {
    customer: { name: "Cliente test", phone },
    items: [{ productId: "main", color: "Noir", size: "38", qty: 1 }],
    ...(attributed ? { meta: { eventId: randomUUID(), sourceUrl: "https://zehri.ma/produit/main", fbp: "fb.1.123.browser" } } : {}),
  };
}
function resetBudgets() { db.prepare("DELETE FROM security_budgets").run(); }

test("stream limits reject oversized/chunked/multibyte JSON before full buffering and preserve multipart", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('"éééé"')); },
    cancel() { cancelled = true; },
  });
  const chunked = new Request("https://zehri.ma", { method: "POST", body: stream, duplex: "half", headers: { "content-length": "1" } });
  await assert.rejects(readLimitedJson(chunked, 8), (error) => error.status === 413);
  assert.equal(cancelled, true);
  assert.equal((await checkout(request('"' + "x".repeat(33_000) + '"'))).status, 413);
  assert.equal((await checkout(request("{"))).status, 400);
  const form = new FormData();
  form.append("file", new File(["image bytes"], "test.webp", { type: "image/webp" }));
  // Materialize the wire payload: Node's synthetic outgoing multipart encoder
  // can enqueue after cancellation; incoming Next requests carry encoded bytes.
  const encoded = new Response(form);
  const bytes = await encoded.arrayBuffer();
  const multipart = () => new Request("https://zehri.ma", { method: "POST", body: bytes, headers: encoded.headers });
  const parsed = await readLimitedFormData(multipart(), 1024);
  assert.equal(await parsed.get("file").text(), "image bytes");
  await assert.rejects(readLimitedFormData(multipart(), 10), (error) => error.status === 413);
});

test("checkout bounds item work and repeated variants, with no order/conversion on rejection", async () => {
  resetBudgets();
  const before = db.prepare("SELECT COUNT(*) n FROM orders").get().n;
  const body = payload();
  body.items = Array.from({ length: 51 }, () => body.items[0]);
  assert.equal((await checkout(request(body))).status, 400);
  body.items = [payload().items[0], { ...payload().items[0], qty: 10 }];
  assert.equal((await checkout(request(body))).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM orders").get().n, before);
});

test("phone budget survives header changes; denied checkout creates no order or conversion", async () => {
  resetBudgets();
  const before = db.prepare("SELECT COUNT(*) n FROM orders").get().n;
  const conversions = db.prepare("SELECT COUNT(*) n FROM meta_purchases").get().n;
  for (let i = 0; i < 5; i++) assert.equal((await checkout(request(payload("0612345678", true)))).status, 201);
  const denied = await checkout(request(payload("+212612345678", true), "orders", { "x-forwarded-for": "1.2.3.4" }));
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get("retry-after")) > 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM orders").get().n, before + 5);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM meta_purchases").get().n, conversions + 5);
});

test("pixel saturation never blocks accepted checkout, upsell or a deduplicated Purchase", async () => {
  resetBudgets();
  db.prepare("INSERT INTO security_budgets VALUES ('pixel:global', 6000, ?)").run(Date.now() + 60_000);
  const body = payload("0623456789", true);
  const upperFunnel = await pixel(request({ ...body.meta, name: "PageView", params: {} }, "pixel"));
  assert.equal(upperFunnel.status, 429);
  const response = await checkout(request(body));
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.purchase, null);
  assert.equal(saved.upsellOffer.productId, "extra");
  const resolved = await upsell(request({ action: "accept" }), { params: Promise.resolve({ id: saved.orderId }) });
  assert.equal(resolved.status, 200);
  const accepted = await resolved.json();
  assert.equal(accepted.purchase.eventId, body.meta.eventId);
  assert.equal(accepted.purchase.params.value, 440);
  assert.equal(accepted.purchase.params.currency, "MAD");
  assert.deepEqual(accepted.purchase.params.content_ids, ["main", "extra"]);
  finalizeMetaPurchases();
  finalizeMetaPurchases();
  const events = db.prepare("SELECT payload_json FROM meta_events WHERE event_id = ?").all(body.meta.eventId);
  assert.equal(events.length, 1);
  const event = JSON.parse(events[0].payload_json);
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, body.meta.eventId);
  assert.equal(event.custom_data.value, 440);
  assert.equal(event.user_data.fbp, "fb.1.123.browser");
  assert.deepEqual(purchaseFor(saved.orderId), accepted.purchase);
});

test("deadline is enforced without attribution, with invalid attribution and after attribution cleanup", async () => {
  resetBudgets();
  for (const meta of [undefined, { eventId: "invalid" }, "cleanup"]) {
    const body = payload("0634567890", meta === "cleanup");
    if (meta !== "cleanup") body.meta = meta;
    const saved = await (await checkout(request(body))).json();
    if (meta === "cleanup") db.prepare("DELETE FROM meta_purchases WHERE order_id = ?").run(saved.orderId);
    db.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(new Date(Date.now() - 21_000).toISOString(), saved.orderId);
    assert.equal(resolveUpsell(saved.orderId, "accept").upsellStatus, "declined");
    assert.equal(getOrder(saved.orderId).total, 329);
  }
});

test("shared budgets are atomic across processes, expire, and denials do not extend them", async () => {
  resetBudgets();
  const program = `import {loadSource} from './scripts/test-source.mjs';
    const {consumeBudgets}=loadSource('@/lib/services/security-budgets');
    let accepted=0;for(let i=0;i<10;i++)if(!consumeBudgets([{key:'race',limit:10,windowMs:60000}]))accepted++;
    process.stdout.write(String(accepted));loadSource('@/lib/db').getDb().close();`;
  const run = promisify(execFile);
  const results = await Promise.all(Array.from({ length: 4 }, () => run(process.execPath, ["--input-type=module", "-e", program], { env: process.env })));
  assert.equal(results.reduce((sum, result) => sum + Number(result.stdout), 0), 10);
  const before = db.prepare("SELECT * FROM security_budgets WHERE key = 'race'").get();
  assert.ok(consumeBudgets([{ key: "race", limit: 10, windowMs: 60_000 }]) > 0);
  assert.deepEqual(db.prepare("SELECT * FROM security_budgets WHERE key = 'race'").get(), before);
  assert.equal(consumeBudgets([{ key: "race", limit: 10, windowMs: 60_000 }], before.expires_at + 1), 0);
});

test("credentials preserve stored password format, enforce attempts, and retain session revocation", async () => {
  resetBudgets();
  const password = "Long-Test-Password-123!";
  const agent = createAgent({ name: "Agent test", email: "agent@example.test", password }, "admin-test");
  const credentials = { email: " AGENT@example.test ", password };
  const saved = await authenticateCredentials(credentials, request({}));
  assert.equal(saved.id, agent.id);
  assert.equal(saved.role, "agent");
  assert.equal(saved.sessionVersion, 0);
  for (let i = 0; i < 9; i++) assert.equal(await authenticateCredentials({ ...credentials, password: "wrong" }, request({})), null);
  assert.equal(await authenticateCredentials(credentials, request({})), null);
  resetBudgets();
  resetAgentPassword(agent.id, "New-Test-Password-456!", "admin-test");
  assert.equal(await authenticateCredentials(credentials, request({})), null);
  assert.equal((await authenticateCredentials({ ...credentials, password: "New-Test-Password-456!" }, request({}))).sessionVersion, 1);
  updateAgent(agent.id, { isActive: false }, "admin-test");
  assert.equal(await authenticateCredentials({ ...credentials, password: "New-Test-Password-456!" }, request({})), null);
  const events = db.prepare("SELECT * FROM security_audit WHERE target_id = ? ORDER BY id").all(agent.id);
  assert.deepEqual(events.map((event) => event.event), ["agent.created", "agent.password_reset", "agent.disabled"]);
  assert.ok(events.every((event) => event.actor_id === "admin-test"));
  assert.equal(JSON.stringify(events).includes(password), false);
  const before = db.prepare("SELECT COUNT(*) n FROM users").get().n;
  assert.throws(() => createAgent({ name: "Rollback", email: "rollback@example.test", password }, ""));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get().n, before);
  assert.equal(await verifyPasswordAsync(password, hashPassword(password)), true);
  assert.equal(await verifyPasswordAsync(password, "scrypt$bad$bad"), false);
});

test("browser mutation policy rejects sibling, missing, opaque and forged-host origins", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(browserMutationAllowed(request({}, "crm/team")), true);
    for (const origin of ["https://evil.zehri.ma", "https://attacker.example", "null", ""]) {
      assert.equal(browserMutationAllowed(request({}, "crm/team", { origin, host: "attacker.example", "x-forwarded-host": "attacker.example" })), false);
    }
    assert.equal(browserMutationAllowed(new Request("https://zehri.ma/api/crm/team", { method: "POST" })), false);
    assert.equal(browserMutationAllowed(new Request("https://zehri.ma/api/crm/orders")), true);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
  const spoofed = request({}, "orders", { "x-real-ip": "203.0.113.8", "x-forwarded-for": "203.0.113.9, 203.0.113.10" });
  assert.equal(trustedClientIp(spoofed), null);
  process.env.SECURITY_TRUSTED_IP_HEADER = "x-forwarded-for";
  assert.equal(trustedClientIp(spoofed), "203.0.113.10");
  delete process.env.SECURITY_TRUSTED_IP_HEADER;
});
