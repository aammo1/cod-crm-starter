// Run after npm run build. Uses an isolated SQLite DB and mock delivery provider.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { loadSource } from "./test-source.mjs";

test("agent edits products, discount and delivery on mobile; saved totals and history persist", { timeout: 120_000 }, async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "zehri-order-edit-browser-"));
  process.env.DB_PATH = path.join(temp, "test.db");
  const { getDb, createOrder, getOrder } = loadSource("@/lib/db");
  const { openStock } = loadSource("@/lib/services/inventory");
  const { listOrderEdits } = loadSource("@/lib/services/order-edits");
  const db = getDb();
  const now = new Date().toISOString();
  for (const [id, name, price] of [["p", "Bottines test", 300], ["q", "Sandales test", 150]]) {
    db.prepare(`INSERT INTO products (id, slug, name, category, price, created_at, updated_at)
      VALUES (?, ?, ?, 'bottines', ?, ?, ?)`).run(id, id, name, price, now, now);
    db.prepare("INSERT INTO product_colors (id, product_id, name) VALUES (?, ?, 'Noir')").run(id, id);
    db.prepare("INSERT INTO variants (id, product_id, color_id, size, sku) VALUES (?, ?, ?, '38', ?)").run(id, id, id, id);
    openStock(id, 10, "test");
  }
  createOrder({ id: "browser-edit", customerName: "Cliente test", customerPhone: "+212612345678",
    items: [{ product_id: "p", name: "Bottines test", color: "Noir", size: "38", quantity: 1, unit_price: 300, line_total: 300 }],
    upsellOffer: null, subtotal: 300, shipping: 29, total: 329 });
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = `http://localhost:${port}`;
  const password = randomUUID();
  const env = { ...process.env, AUTH_SECRET: randomUUID() + randomUUID(), AUTH_URL: origin,
    SECURITY_ALLOWED_ORIGINS: origin, DELIVERY_PROVIDER: "mock", OZON_CLIENT_ID: "", OZON_API_KEY: "",
    FACEBOOK_PIXEL_ID: "", FACEBOOK_ACCESS_TOKEN: "", CRM_ASSISTANT_API_KEY: "" };
  let server, browser;
  let output = "";
  try {
    execFileSync(process.execPath, ["scripts/create-user.mjs", "edit@example.test", password, "Agent test", "agent"], { env });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (data) => { output += data; });
    server.stderr.on("data", (data) => { output += data; });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await fetch(`${origin}/login`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, output);
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/login?callbackUrl=/crm/orders/browser-edit`);
    await page.getByLabel("Email", { exact: true }).fill("edit@example.test");
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Connexion", exact: true }).click();
    await page.waitForURL(`${origin}/crm/orders/browser-edit`);
    await page.getByRole("button", { name: "Modifier la commande", exact: true }).click();
    const editor = page.locator("#order-editor");
    assert.equal(await page.getByRole("button", { name: /Confirmer.*commande/ }).count(), 0, "Confirmation must be hidden while editing");
    await editor.getByLabel("Quantité de l’article 1", { exact: true }).fill("2");
    await editor.getByLabel("Rechercher un produit", { exact: true }).fill("Sandales");
    await editor.getByRole("combobox", { name: "Article à ajouter", exact: true }).click();
    await page.getByRole("option", { name: /Sandales test/ }).click();
    await editor.getByRole("button", { name: "Ajouter", exact: true }).click();
    assert.equal(await editor.getByLabel("Quantité de l’article 2", { exact: true }).inputValue(), "1");
    await editor.getByLabel("Pourcentage", { exact: true }).check();
    await editor.getByLabel("Remise (%)", { exact: true }).fill("10");
    await editor.getByLabel(/Payante/).check();
    await editor.getByRole("combobox", { name: "Variante de l’article 1", exact: true }).click();
    await page.getByRole("option", { name: /Sandales test/ }).click();
    await editor.getByRole("button", { name: "Retirer l’article 2", exact: true }).click();
    assert.ok((await editor.locator("dl").innerText()).includes("299"));
    await editor.getByLabel("Motif de modification", { exact: true }).fill("Changement demandé par la cliente");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile editor must not overflow horizontally");
    await editor.getByRole("button", { name: "Enregistrer la commande", exact: true }).click();
    await page.getByRole("heading", { name: "Historique des modifications", exact: true }).waitFor();
    assert.equal(getOrder("browser-edit").total, 299);
    assert.equal(getOrder("browser-edit").items[0].product_id, "q");
    assert.equal(getOrder("browser-edit").items[0].quantity, 2);
    assert.equal(listOrderEdits("browser-edit")[0].actorName, "Agent test");
    await page.reload();
    await page.getByRole("button", { name: "Modifier la commande", exact: true }).click();
    await editor.getByLabel("Aucune", { exact: true }).check();
    await editor.getByLabel("Gratuite", { exact: true }).check();
    await editor.getByLabel("Motif de modification", { exact: true }).fill("Remise retirée, livraison offerte");
    await editor.getByRole("button", { name: "Enregistrer la commande", exact: true }).click();
    await page.getByText("Remise retirée, livraison offerte", { exact: true }).waitFor();
    assert.equal(getOrder("browser-edit").total, 300);
    assert.equal(listOrderEdits("browser-edit").length, 2);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Modifier la commande", exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
