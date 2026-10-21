import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { after, test } from "node:test";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadSource } from "./test-source.mjs";
import { configuration, prepare, apply } from "./catalog-agent-client.mjs";

const child = process.env.ZEHRI_CATALOG_CHILD;
const temp = child ? null : fs.mkdtempSync(path.join(os.tmpdir(), "zehri-catalog-agent-"));
if (temp) {
  process.env.DB_PATH = path.join(temp, "test.db");
  process.env.UPLOAD_DIR = path.join(temp, "uploads");
}
process.env.CATALOG_AGENT_KEY = "catalog-agent-test-key-at-least-32-characters";
process.env.DELIVERY_PROVIDER = "mock";
const { getDb } = loadSource("@/lib/db");
const agent = loadSource("@/lib/services/catalog-agent");
const catalog = loadSource("@/lib/services/catalog");
const inventory = loadSource("@/lib/services/inventory");
const { requireCatalogAgent } = loadSource("@/lib/catalog-agent-auth");
const db = getDb();

if (child) {
  process.once("message", () => {
    try {
      const { operation, preview } = JSON.parse(child);
      const result = agent.applyCatalogOperation(operation, preview);
      process.send({ ok: true, replayed: result.replayed });
    } catch (error) { process.send({ ok: false, message: error.message }); }
    finally { db.close(); process.disconnect(); }
  });
  process.send({ ready: true });
} else {
  after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  const data = name => ({
    name, category: "mocassins", price: 299, description: "Description française.",
    story: "Une histoire sobre.", materials: ["Synthétique"], isBestSeller: false,
    colors: [{ name: "Noir", hex: "#111111", images: [] }], sizes: [37, 38],
    initialStock: [{ colorKey: "Noir", size: "37", qty: 3 }, { colorKey: "Noir", size: "38", qty: 0 }],
  });
  const creation = name => ({ command: "create", requestId: `create-${crypto.randomUUID()}`, data: data(name) });
  const mutation = (command, target, extra = {}) => ({ command, target, requestId: `${command}-${crypto.randomUUID()}`, ...extra });
  const snapshot = () => Object.fromEntries(["products", "product_colors", "variants", "stock_balances", "stock_movements", "app_state"]
    .map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const commit = operation => agent.applyCatalogOperation(operation, agent.previewCatalogOperation(operation).preview);

  test("credential is required, scoped and fails closed when unconfigured", () => {
    for (const authorization of [undefined, "Bearer wrong", `Basic ${process.env.CATALOG_AGENT_KEY}`]) {
      const request = new Request("https://zehri.test/api/catalog-agent", { headers: authorization ? { authorization } : {} });
      assert.throws(() => requireCatalogAgent(request), error => error.status === 401);
    }
    const request = new Request("https://zehri.test", { headers: { authorization: `Bearer ${process.env.CATALOG_AGENT_KEY}` } });
    assert.doesNotThrow(() => requireCatalogAgent(request));
    const key = process.env.CATALOG_AGENT_KEY;
    delete process.env.CATALOG_AGENT_KEY;
    assert.throws(() => requireCatalogAgent(request), error => error.status === 503);
    process.env.CATALOG_AGENT_KEY = key;
  });

  test("preview rolls back all catalog, stock, movement and receipt writes; apply opens stock once", () => {
    const operation = creation("Élise");
    const before = snapshot();
    const preview = agent.previewCatalogOperation(operation);
    assert.deepEqual(snapshot(), before);
    assert.equal(preview.after.variants.find(v => v.size === "37").available, 3);
    assert.equal(preview.before, null);
    assert.equal(agent.catalogReceipt(operation.requestId), null);
    const saved = agent.applyCatalogOperation(operation, preview.preview);
    assert.equal(saved.product.id, "elise");
    assert.equal(saved.replayed, false);
    const after = snapshot();
    assert.equal(agent.applyCatalogOperation(operation, preview.preview).replayed, true);
    assert.deepEqual(snapshot(), after);
    assert.equal(agent.catalogReceipt(operation.requestId).product.id, "elise");
    assert.throws(() => agent.applyCatalogOperation({ ...operation, data: { ...operation.data, price: 300 } }, preview.preview), /déjà utilisé/);
    assert.equal(agent.previewCatalogOperation(operation).alreadyApplied, true);
    assert.throws(() => agent.previewCatalogOperation({ ...operation, requestId: "another-create-request" }), /slug/);
  });

  test("stock on edits, unknown fields, malformed initial quantities and duplicate colors are rejected", () => {
    const edit = mutation("edit", "elise", { data: { price: 320 } });
    for (const data of [
      { price: 320, initialStock: [] }, { stock: 4 }, { requestId: "shadow-id" }, { slug: "different" }, {},
      { colors: [{ name: "Noir", hex: "#111111", images: [], stock: 5 }] },
      { colors: [{ name: "Noir", hex: "#111111", images: [] }, { name: "Noir", hex: "#222222", images: [] }] },
    ]) assert.throws(() => agent.previewCatalogOperation({ ...edit, data }));
    for (const initialStock of [
      [{ colorKey: "Noir", size: "37", qty: -1 }], [{ colorKey: "Noir", size: "37", qty: 1.5 }],
      [{ colorKey: "Absent", size: "37", qty: 1 }], [{ colorKey: "Noir", size: "37", qty: 1 }, { colorKey: "Noir", size: "37", qty: 2 }],
    ]) assert.throws(() => agent.previewCatalogOperation({ ...creation("Invalid"), data: { ...data("Invalid"), initialStock } }));
  });

  test("signed previews bind request and current catalog; stock changes also conflict", () => {
    const operation = mutation("edit", "elise", { data: { price: 320 } });
    const preview = agent.previewCatalogOperation(operation);
    assert.throws(() => agent.applyCatalogOperation(operation, `${preview.preview}x`), /invalide/);
    assert.throws(() => agent.applyCatalogOperation({ ...operation, data: { price: 321 } }, preview.preview), /changé/);
    catalog.updateProduct("elise", { description: "Une autre modification." });
    assert.throws(() => agent.applyCatalogOperation(operation, preview.preview), /changé/);
    const refreshed = agent.previewCatalogOperation(operation);
    const variant = catalog.getProductById("elise").variants.find(v => v.size === "37");
    inventory.adjustStock(variant.variantId, { physicalDelta: 1 }, "Test comptage", "test", "test-physical-change");
    assert.throws(() => agent.applyCatalogOperation(operation, refreshed.preview), /changé/);
    const expiring = agent.previewCatalogOperation(operation);
    const original = Date.now;
    try {
      Date.now = () => original() + 31 * 60_000;
      assert.throws(() => agent.applyCatalogOperation(operation, expiring.preview), /expiré/);
    } finally { Date.now = original; }
    commit(operation);
    assert.equal(catalog.getProductById("elise").price, 320);
  });

  test("edits create zero-stock variants and preserve retained/reactivated stock; archive/restore never adjust stock", () => {
    const before = db.prepare("SELECT * FROM stock_movements ORDER BY rowid").all();
    let product = commit(mutation("edit", "elise", { data: { sizes: [38, 39] } })).product;
    assert.equal(product.variants.find(v => v.size === "37").active, false);
    assert.equal(product.variants.find(v => v.size === "39").available, 0);
    product = commit(mutation("edit", "elise", { data: { sizes: [37, 38, 39] } })).product;
    assert.equal(product.variants.find(v => v.size === "37").available, 4);
    assert.equal(commit(mutation("archive", "elise")).product.active, false);
    assert.equal(commit(mutation("restore", "elise")).product.active, true);
    assert.deepEqual(db.prepare("SELECT * FROM stock_movements ORDER BY rowid").all(), before);
  });

  test("two processes applying the same creation produce one product and one opening per variant", async () => {
    const operation = creation("Concurrent");
    const preview = agent.previewCatalogOperation(operation).preview;
    const children = Array.from({ length: 2 }, () => fork(fileURLToPath(import.meta.url), [], {
      env: { ...process.env, ZEHRI_CATALOG_CHILD: JSON.stringify({ operation, preview }) },
      execArgv: [], stdio: ["ignore", "ignore", "inherit", "ipc"],
    }));
    try {
      const outcomes = children.map(proc => new Promise((resolve, reject) => {
        proc.on("error", reject);
        proc.on("message", message => { if (!message.ready) resolve(message); });
        proc.on("exit", code => { if (code !== 0) reject(new Error(`Child failed: ${code}`)); });
      }));
      const exits = children.map(proc => new Promise(resolve => proc.once("exit", resolve)));
      await Promise.all(children.map(proc => new Promise(resolve => proc.once("message", resolve))));
      children.forEach(proc => proc.send("apply"));
      const results = await Promise.all(outcomes);
      await Promise.all(exits);
      assert.ok(results.every(result => result.ok), JSON.stringify(results));
      assert.equal(results.filter(result => !result.replayed).length, 1);
      assert.equal(db.prepare("SELECT count(*) n FROM products WHERE id = 'concurrent'").get().n, 1);
      const variants = catalog.getProductById("concurrent").variants;
      for (const variant of variants) assert.equal(inventory.listMovements({ variantId: variant.variantId }).length, 1);
    } finally { children.forEach(proc => { if (proc.exitCode === null) proc.kill(); }); }
  });

  test("HTTP routes and client perform image dry-run, approved upload, apply, verify and safe replay", async () => {
    const originalLoad = Module._load;
    let revalidations = 0;
    Module._load = function (request, ...args) {
      if (request === "next/cache") return { revalidatePath() { revalidations++; } };
      return originalLoad.call(this, request, ...args);
    };
    let routes;
    let uploads;
    try {
      routes = loadSource("@/app/api/catalog-agent/route");
      uploads = loadSource("@/app/api/catalog-agent/upload/route");
    } finally { Module._load = originalLoad; }
    assert.equal((await routes.GET(new Request("https://zehri.test/api/catalog-agent"))).status, 401);
    assert.equal((await uploads.POST(new Request("https://zehri.test/api/catalog-agent/upload", { method: "POST" }))).status, 401);
    const image = await sharp({ create: { width: 12, height: 18, channels: 3, background: "black" } }).png().toBuffer();
    const operationFile = path.join(temp, "operation.json");
    const planFile = path.join(temp, "plan.json");
    const operation = creation("Photos");
    operation.data.colors[0].images = ["https://photos.test/cover.png"];
    fs.writeFileSync(operationFile, JSON.stringify(operation));
    const config = configuration({ ZEHRI_STORE_URL: "https://zehri.test", ZEHRI_CATALOG_KEY: process.env.CATALOG_AGENT_KEY });
    assert.throws(() => configuration({ ZEHRI_STORE_URL: "http://zehri.test", ZEHRI_CATALOG_KEY: config.key }), /HTTPS/);
    const originalFetch = global.fetch;
    let liveUploads = 0;
    global.fetch = async (url, options) => {
      if (String(url).startsWith("https://photos.test/")) {
        assert.equal(options.headers, undefined);
        return new Response(image);
      }
      const request = new Request(url, options);
      if (new URL(url).pathname.endsWith("/upload")) {
        if (!String(url).includes("dryRun=1")) liveUploads++;
        return uploads.POST(request);
      }
      return options.method === "POST" ? routes.POST(request) : routes.GET(request);
    };
    try {
      const before = snapshot();
      const preview = await prepare(config, operationFile, planFile);
      assert.deepEqual(snapshot(), before);
      assert.equal(fs.existsSync(process.env.UPLOAD_DIR), false);
      assert.equal(liveUploads, 0);
      assert.match(preview.after.colors[0].images[0], /^\/api\/media\/catalog-[a-f0-9]{64}\.webp$/);
      const storedPlan = fs.readFileSync(planFile, "utf8");
      assert.ok(!storedPlan.includes(config.key));
      const plan = JSON.parse(storedPlan);
      const source = fs.readFileSync(plan.uploads[0].file);
      fs.writeFileSync(plan.uploads[0].file, "modified");
      await assert.rejects(() => apply(config, planFile), /photo changed/);
      assert.equal(liveUploads, 0);
      fs.writeFileSync(plan.uploads[0].file, source);
      const result = await apply(config, planFile);
      assert.equal(result.replayed, false);
      assert.equal(result.currentProduct.id, "photos");
      assert.equal(liveUploads, 1);
      assert.ok(fs.existsSync(path.join(process.env.UPLOAD_DIR, path.basename(plan.uploads[0].path))));
      assert.equal((await apply(config, planFile)).replayed, true);
      assert.equal(liveUploads, 1);
      assert.equal(revalidations, 2);
      const headers = { authorization: `Bearer ${config.key}`, "Content-Type": "application/json" };
      const forbidden = await routes.POST(new Request("https://zehri.test/api/catalog-agent", {
        method: "POST", headers, body: JSON.stringify({ action: "preview", operation: { command: "receive", requestId: "forbidden-stock", data: {} } }),
      }));
      assert.equal(forbidden.status, 400);
      const invalid = new FormData();
      invalid.set("file", new Blob(["not an image"], { type: "image/png" }), "bad.png");
      const rejected = await uploads.POST(new Request("https://zehri.test/api/catalog-agent/upload", {
        method: "POST", headers: { authorization: `Bearer ${config.key}` }, body: invalid,
      }));
      assert.equal(rejected.status, 400);
    } finally { global.fetch = originalFetch; }
  });
}
