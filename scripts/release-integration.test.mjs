import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { loadSource } from "./test-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("fresh host standalone: generic HTTP COD journey, durable replay and archived return inspection", { timeout: 180_000 }, async () => {
  const temp = mkdtempSync("/tmp/opencode/crm-release-");
  const app = path.join(temp, "app");
  cpSync(path.join(root, ".next/standalone"), app, { recursive: true });
  cpSync(path.join(root, ".next/static"), path.join(app, ".next/static"), { recursive: true });
  for (const dir of ["public", "migrations"]) cpSync(path.join(root, dir), path.join(app, dir), { recursive: true });
  cpSync(path.join(root, "node_modules/better-sqlite3"), path.join(app, "node_modules/better-sqlite3"), { recursive: true });
  mkdirSync(path.join(app, "scripts"), { recursive: true });
  for (const file of ["create-user.mjs", "backup-db.mjs", "block-external-network.mjs"]) cpSync(path.join(root, "scripts", file), path.join(app, "scripts", file));
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const origin = `http://localhost:${port}`;
  const password = randomUUID();
  const key = randomBytes(32).toString("hex");
  // Explicit allowlist; optional live integrations cannot inherit shell secrets.
  const env = { PATH: process.env.PATH, HOME: temp, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1", PORT: String(port), AUTH_URL: origin, AUTH_TRUST_HOST: "true",
    AUTH_SECRET: randomBytes(32).toString("hex"), STOREFRONT_API_KEY: key, CRM_PUBLIC_URL: origin,
    SECURITY_ALLOWED_ORIGINS: origin, DB_PATH: path.join(temp, "data/crm.db"), UPLOAD_DIR: path.join(temp, "data/uploads"),
    DELIVERY_PROVIDER: "mock", OZON_SUBMIT_INTERVAL_SEC: "1", OZON_POLL_INTERVAL_MIN: "3600",
    NODE_OPTIONS: `--import=${path.join(app, "scripts/block-external-network.mjs")}` };
  let server, browser, db;
  let output = "";
  const stop = async () => {
    if (!server) return;
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    await stopped;
    server = null;
  };
  const start = async () => {
    server = spawn(process.execPath, ["server.js"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", data => { output += data; });
    server.stderr.on("data", data => { output += data; });
    for (let n = 0; n < 200; n++) {
      assert.equal(server.exitCode, null, output);
      try { const res = await fetch(`${origin}/api/health`); if (res.ok) return res.json(); } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Standalone startup timed out");
  };
  const storefront = async (route, body, requestKey, token) => {
    const res = await fetch(`${origin}/api/storefront/v1/${route}`, { method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json", "Idempotency-Key": requestKey } : {}), ...(token ? { "X-Order-Token": token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json() };
  };
  try {
    execFileSync(process.execPath, ["-e", "const assert=require('node:assert/strict'); const db=require('better-sqlite3')(':memory:'); db.exec('SELECT 1'); db.close(); require('sharp')({create:{width:2,height:2,channels:3,background:'#ffffff'}}).webp().toBuffer().then(b=>assert.equal(b.toString('ascii',8,12),'WEBP'));"], { cwd: app, env });
    const health = await start();
    assert.equal(health.db, true);
    assert.equal(health.workers.meta.enabled, false);
    assert.equal(health.workers.submission.enabled, true);
    db = new Database(env.DB_PATH, { readonly: true });
    for (const table of ["users", "products", "variants", "orders", "stock_movements", "reservations", "courier_submissions"]) {
      assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    }
    assert.equal((await storefront("catalog")).body.products.length, 0);
    assert.equal((await fetch(`${origin}/api/orders`, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${origin}/api/catalog-agent`)).status, 503);
    await stop();
    execFileSync(process.execPath, ["scripts/create-user.mjs", "release@example.test", password, "Admin test", "admin"], { cwd: app, env });
    assert.equal(db.prepare("SELECT count(*) n FROM users WHERE role = 'admin'").get().n, 1);
    await start();
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium" });
    const page = await browser.newPage();
    await page.context().route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/login`);
    await page.getByLabel("Email", { exact: true }).fill("release@example.test");
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Connexion", exact: true }).click();
    await page.waitForURL(`${origin}/crm`);
    const api = async (route, body, method = "POST") => {
      const res = await page.request.fetch(`${origin}${route}`, { method, data: body, headers: { Origin: origin } });
      assert.ok(res.ok(), `${route}: ${res.status()} ${await res.text()}`);
      return res.json();
    };
    const invalid = await page.request.post(`${origin}/api/admin/products`, { data: { name: "Test", price: "invalid", category: "objets" }, headers: { Origin: origin } });
    assert.equal(invalid.status(), 400);
    assert.equal((await invalid.json()).error, "Type de donnée invalide.");
    const legacy = await page.request.post(`${origin}/api/admin/products`, { data: { name: "Test", price: 10, category: "objets", colors: [], sizes: [38] }, headers: { Origin: origin } });
    assert.equal(legacy.status(), 400);
    assert.equal((await legacy.json()).error, "Champ non autorisé.");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    const upload = await page.request.post(`${origin}/api/admin/upload`, { multipart: { file: { name: "fixture.png", mimeType: "image/png", buffer: png } }, headers: { Origin: origin } });
    assert.equal(upload.status(), 201);
    const imagePath = (await upload.json()).files[0];
    assert.match(imagePath, /^\/api\/media\//);
    assert.equal((await fetch(`${origin}${imagePath}`)).status, 200);
    const create = async (name, price, definitions = []) => {
      const response = await api("/api/admin/products", { name, price, category: "objets", optionDefinitions: definitions });
      return response.product;
    };
    const standard = await create("Adaptateur", 120);
    const volume = await create("Sérum", 80, [{ name: "Contenance", values: ["500 ml"] }]);
    const axes = await create("Lampe", 90, [{ name: "Alimentation", values: ["USB-C"] }, { name: "Finition", values: ["Mat"] }]);
    const bonus = await api("/api/admin/products", { name: "Pochette", price: 100, category: "accessoires", isBestSeller: true });
    const products = [standard, volume, axes, bonus.product];
    for (const product of products) {
      await api("/api/crm/stock/opening", { variantId: product.variants[0].id, qty: 5 });
      const saved = await api(`/api/admin/products/${product.id}`, { description: "Description revue" }, "PUT");
      assert.equal(saved.product.variants[0].id, product.variants[0].id);
      assert.equal(saved.product.variants[0].sku, product.variants[0].sku);
      await api(`/api/admin/products/${product.id}/archive`, {});
      assert.equal((await storefront(`catalog/${product.slug}`)).status, 404);
      await api(`/api/admin/products/${product.id}/restore`, {});
      assert.equal((await storefront(`catalog/${product.slug}`)).body.product.variants[0].id, product.variants[0].id);
    }
    const catalog = await storefront("catalog");
    assert.equal(catalog.body.settings.storeName, "Ma Boutique");
    assert.equal(catalog.body.settings.shippingFeeMad, 29);
    assert.equal(catalog.body.settings.freeShippingThresholdMad, 400);
    assert.equal(typeof catalog.body.products[0].variants[0].available, "boolean");
    assert.ok(!JSON.stringify(catalog.body).includes('"physical"'));
    const body = { customer: { name: "Client test", phone: "0612345678" }, items: [standard, volume, axes].map(product => ({ variantId: product.variants[0].id, qty: 1 })) };
    assert.equal((await storefront("orders", { ...body, price: 1 }, "invalid-price-key")).status, 400);
    const checkout = await storefront("orders", body, "release-checkout-key");
    assert.equal(checkout.status, 201);
    assert.deepEqual(checkout.body.totals, { itemsSubtotal: 290, shipping: 29, total: 319, currency: "MAD" });
    assert.equal(checkout.body.upsellOffer.upsellPrice, 70);
    const expires = Date.parse(checkout.body.upsellOffer.expiresAt);
    assert.ok(expires > Date.now() && expires <= Date.now() + 20_000);
    assert.equal((await storefront("orders", { ...body, customer: { ...body.customer, name: "Autre" } }, "release-checkout-key")).status, 409);
    const { orderId, orderToken } = checkout.body;
    await api("/api/crm/settings", { storeName: "Boutique test", shippingFeeMad: 47, freeShippingThresholdMad: 650, upsellDiscountPercent: 50 }, "PUT");
    await api(`/api/admin/products/${bonus.product.id}`, { price: 900 }, "PUT");
    const acceptBody = { action: "accept", variantId: bonus.product.variants[0].id };
    const accepted = await storefront(`orders/${orderId}/upsell`, acceptBody, "release-accept-key", orderToken);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.totals.total, 389, "Original offer and shipping rules win");
    await stop();
    await start();
    const replay = await storefront("orders", body, "release-checkout-key");
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, checkout.body, "Restart/settings/catalog edits preserve exact token and receipt");
    assert.deepEqual((await storefront(`orders/${orderId}/upsell`, acceptBody, "release-accept-key", orderToken)).body, accepted.body);
    assert.equal((await storefront(`orders/${orderId}/upsell`, { action: "decline" }, "opposite-action-key", orderToken)).status, 409);
    const currentCatalog = await storefront("catalog");
    assert.equal(currentCatalog.body.settings.storeName, "Boutique test");
    await api("/api/crm/settings", { upsellEnabled: false }, "PUT");
    const custom = await storefront("orders", { ...body, customer: { name: "Client deux", phone: "0612345679" }, items: [body.items[0]] }, "custom-checkout-key");
    assert.equal(custom.status, 201);
    assert.equal(custom.body.upsellOffer, null);
    assert.equal(custom.body.totals.total, 167);
    await api("/api/crm/settings", { upsellEnabled: true, upsellWindowSeconds: 1 }, "PUT");
    for (const [phone, action] of [["0612345680", "decline"], ["0612345681", "expire"]]) {
      const result = await storefront("orders", { ...body, customer: { name: "Client test", phone }, items: [body.items[0]] }, `checkout-${action}-key`);
      assert.equal(result.status, 201);
      assert.ok(result.body.upsellOffer);
      if (action === "expire") await new Promise(resolve => setTimeout(resolve, 1100));
      const resolved = await storefront(`orders/${result.body.orderId}/upsell`, action === "decline" ? { action: "decline" } : { action: "accept", variantId: result.body.upsellOffer.variants[0].variantId }, `resolve-${action}-key`, result.body.orderToken);
      assert.equal(resolved.status, action === "decline" ? 200 : 409);
    }
    // Confirmation may omit replacements; canonical checkout lines are sorted
    // by variant identity, never by the storefront's input position.
    const lines = [];
    const confirm = () => page.request.post(`${origin}/api/crm/orders/${orderId}/confirm`, { data: { address: "12 rue test", cityId: 1, lines }, headers: { Origin: origin } });
    const confirmations = await Promise.all([confirm(), confirm()]);
    assert.deepEqual(confirmations.map(res => res.status()).sort(), [200, 201]);
    assert.equal(db.prepare("SELECT count(*) n FROM courier_submissions WHERE order_id = ?").get(orderId).n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM reservations WHERE order_id = ?").get(orderId).n, 4);
    let parcel;
    for (let n = 0; n < 200; n++) {
      parcel = db.prepare("SELECT * FROM courier_submissions WHERE order_id = ?").get(orderId);
      if (parcel.status === "submitted") break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(parcel.status, "submitted");
    const bl = await api("/api/crm/bl", { submissionIds: [parcel.id] });
    assert.equal(bl.bl.status, "saved");
    const pdf = await page.request.get(`${origin}/api/crm/bl/${bl.bl.id}/pdf`);
    assert.equal(pdf.status(), 200);
    assert.match((await pdf.body()).toString(), /^%PDF-/);
    assert.ok(!(await pdf.body()).toString().includes("Zehri"));
    await api(`/api/crm/bl/${bl.bl.id}/handoff`, {});
    for (const product of products) await api(`/api/admin/products/${product.id}/archive`, {});
    const originalItems = JSON.parse(db.prepare("SELECT items_json FROM orders WHERE id = ?").get(orderId).items_json);
    assert.deepEqual([standard, volume, axes].map(product => originalItems.find(item => item.variant_id === product.variants[0].id).options), [[], [{ name: "Contenance", value: "500 ml" }], [{ name: "Alimentation", value: "USB-C" }, { name: "Finition", value: "Mat" }]]);
    await stop();
    // Owner process stopped: simulate ONLY a mock tracking observation. No live
    // mapping is installed; unknown stays unknown and never changes stock.
    Object.assign(process.env, env);
    const serviceDb = loadSource("@/lib/db").getDb();
    const { pollOnce } = loadSource("@/lib/services/tracking");
    const mock = loadSource("@/lib/shipping/mock").createMockProvider();
    await pollOnce(mock);
    assert.equal(serviceDb.prepare("SELECT normalized_status FROM courier_submissions WHERE id = ?").get(parcel.id).normalized_status, "unknown");
    const ret = loadSource("@/lib/services/returns").ensureReturn(parcel.id, "Retour mock déclaré manuellement");
    serviceDb.close();
    await start();
    await api(`/api/crm/returns/${ret.id}/receive`, {});
    const inspectionItems = [...originalItems, ...JSON.parse(db.prepare("SELECT upsell_items_json FROM orders WHERE id = ?").get(orderId).upsell_items_json)];
    const inspection = { reason: "Contrôle test", lines: inspectionItems.map((item, lineIndex) => ({ lineIndex, sellable: item.variant_id === volume.variants[0].id ? 0 : 1, damaged: item.variant_id === volume.variants[0].id ? 1 : 0 })) };
    const inspections = await Promise.all([1, 2].map(() => page.request.post(`${origin}/api/crm/returns/${ret.id}/inspect`, { data: inspection, headers: { Origin: origin } })));
    assert.deepEqual(inspections.map(res => res.status()).sort(), [200, 409]);
    assert.equal(db.prepare("SELECT count(*) n FROM return_lines WHERE return_id = ?").get(ret.id).n, 4);
    for (const [index, product] of products.entries()) {
      const balance = db.prepare("SELECT physical, reserved, quarantine FROM stock_balances WHERE variant_id = ? AND location = 'MAIN'").get(product.variants[0].id);
      assert.deepEqual(balance, { physical: 5, reserved: 0, quarantine: index === 1 ? 1 : 0 });
      assert.equal(db.prepare("SELECT count(*) n FROM stock_movements WHERE variant_id = ? AND kind = 'dispatch'").get(product.variants[0].id).n, 1);
      assert.equal(db.prepare("SELECT count(*) n FROM stock_movements WHERE variant_id = ? AND kind IN ('receive_sellable', 'receive_quarantine')").get(product.variants[0].id).n, 1);
    }
    assert.deepEqual((await storefront("orders", body, "release-checkout-key")).body, checkout.body);
    assert.deepEqual((await storefront(`orders/${orderId}/upsell`, acceptBody, "release-accept-key", orderToken)).body, accepted.body);
    assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.ok(!output.includes("External networking blocked"));
    await stop();
    execFileSync(process.execPath, ["scripts/backup-db.mjs"], { cwd: app, env });
    assert.ok(existsSync(path.join(temp, "data/backups")));
    const backupFile = readdirSync(path.join(temp, "data/backups")).find(file => file.endsWith(".db"));
    const restored = new Database(path.join(temp, "data/backups", backupFile), { readonly: true });
    try {
      assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
      assert.deepEqual(restored.pragma("foreign_key_check"), []);
      assert.equal(restored.prepare("SELECT count(*) n FROM orders").get().n, db.prepare("SELECT count(*) n FROM orders").get().n);
      assert.equal(restored.prepare("SELECT count(*) n FROM stock_movements").get().n, db.prepare("SELECT count(*) n FROM stock_movements").get().n);
    } finally { restored.close(); }
    console.log("Standalone native SQLite + empty boot/admin CLI, generic catalog CRUD/stock, default/custom settings, HTTP 201/200/409, accept/decline/expiry, restart HMAC replay, confirmation/inspection races, worker parcel, BL/PDF/handoff, unknown tracking, archived return ledger and backup verified.");
  } finally {
    await browser?.close();
    await stop();
    db?.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
