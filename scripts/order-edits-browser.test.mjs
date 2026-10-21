// Run after npm run build, or CRM_BROWSER_BUILD=1 npm run test:order-edits-browser.
// Real CRM browser workflow: no bundled shop, live courier or persistent fixtures.
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
import { genericProduct, orderFixture } from "./order-operations-fixtures.mjs";

test("mobile agent operates default, non-size and two-axis variants with history, conflicts and permissions", { timeout: 300_000 }, async () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "crm-order-browser-"));
  Object.assign(process.env, { DB_PATH: path.join(temp, "test.db"), UPLOAD_DIR: path.join(temp, "uploads"),
    AUTH_SECRET: randomUUID() + randomUUID(), DELIVERY_PROVIDER: "mock", OZON_CLIENT_ID: "", OZON_API_KEY: "",
    FACEBOOK_PIXEL_ID: "", FACEBOOK_ACCESS_TOKEN: "", OPENROUTER_API_KEY: "", CATALOG_AGENT_KEY: "", STOREFRONT_API_KEY: "" });
  const { getDb } = loadSource("@/lib/db");
  const { getCrmOrder: getOrder } = loadSource("@/lib/services/orders");
  const { openStock, availableFor } = loadSource("@/lib/services/inventory");
  const { listOrderEdits, getOrderEditState } = loadSource("@/lib/services/order-edits");
  const { updateStoreSettings } = loadSource("@/lib/services/store-settings");
  const db = getDb();
  genericProduct(db, "Adaptateur", 300, [["adapter-standard", []]]);
  genericProduct(db, "Serum", 150, [["serum-250", [{ name: "Volume", value: "250 ml" }]], ["serum-500", [{ name: "Volume", value: "500 ml" }]]]);
  genericProduct(db, "Lampe", 200, [["lamp-usb", [{ name: "Alimentation", value: "USB-C" }, { name: "Finition", value: "Mat" }]],
    ["lamp-solar", [{ name: "Alimentation", value: "Solaire" }, { name: "Finition", value: "Brillant" }]]]);
  for (const id of ["adapter-standard", "serum-250", "serum-500", "lamp-usb", "lamp-solar"]) openStock(id, 10, "test");
  updateStoreSettings({ shippingFeeMad: 47, freeShippingThresholdMad: 650 });
  orderFixture(db, "pending-offer", { productId: "Adaptateur", variantId: "adapter-standard" });
  const listener = createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = `http://localhost:${port}`;
  const password = randomUUID();
  const env = { ...process.env, AUTH_URL: origin, SECURITY_ALLOWED_ORIGINS: origin,
    OZON_SUBMIT_INTERVAL_SEC: "3600", OZON_POLL_INTERVAL_MIN: "3600" };
  let server, browser;
  let output = "";
  try {
    execFileSync(process.execPath, ["scripts/create-user.mjs", "orders@example.test", password, "Agent test", "agent"], { env });
    execFileSync(process.execPath, ["scripts/create-user.mjs", "admin@example.test", password, "Admin test", "admin"], { env });
    if (process.env.CRM_BROWSER_BUILD === "1") execFileSync("npm", ["run", "build"], { env, stdio: "inherit", timeout: 180_000 });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", process.env.CRM_BROWSER_DEV === "1" ? "dev" : "start", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", (data) => { output += data; });
    server.stderr.on("data", (data) => { output += data; });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (server.exitCode !== null) throw new Error(output);
      try { if ((await fetch(`${origin}/login`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, output);
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.context().route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const login = async (email) => {
      await page.goto(`${origin}/login?callbackUrl=/crm/orders`);
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Mot de passe", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Connexion", exact: true }).click();
      await page.waitForURL(`${origin}/crm/orders`);
    };
    const choose = async (label, option) => {
      await page.getByRole("combobox", { name: label, exact: true }).click();
      await page.getByRole("option", { name: option }).click();
    };
    const post = (url, body, requestOrigin = origin) => page.request.post(`${origin}${url}`, { data: body, headers: { Origin: requestOrigin } });
    const mobileFits = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile workspace must not overflow horizontally");
    const create = async (product, variant) => {
      await page.goto(`${origin}/crm/orders/new`);
      await page.getByLabel(/Nom complet du client/).fill("Client navigateur");
      await page.getByLabel(/Numéro de téléphone marocain/).fill("0612345678");
      await choose("Produit de l’article 1", new RegExp(product));
      if (variant) await choose("Variante de l’article 1", variant);
      else assert.match(await page.getByRole("combobox", { name: "Variante de l’article 1", exact: true }).innerText(), /Standard/);
      const subtotal = product === "Adaptateur" ? 300 : product === "Serum" ? 150 : 200;
      const estimate = page.getByRole("heading", { name: "Estimation du montant" }).locator("..");
      assert.match(await estimate.innerText(), new RegExp(String(subtotal + 47)));
      await mobileFits();
      const response = page.waitForResponse((r) => r.url() === `${origin}/api/crm/orders` && r.request().method() === "POST");
      await page.getByRole("button", { name: "Créer la commande", exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 201, await result.text());
      const { orderId } = await result.json();
      await page.waitForURL(`${origin}/crm/orders/${orderId}`);
      assert.equal(getOrder(orderId).total, subtotal + 47);
      return orderId;
    };
    const confirm = async (id, expectedStatus = 201) => {
      await page.getByLabel("Adresse", { exact: true }).fill("10 rue du test, quartier Centre");
      await choose("Ville", /Casablanca/);
      const response = page.waitForResponse((r) => r.url().endsWith(`/orders/${id}/confirm`) && r.request().method() === "POST");
      await page.getByRole("button", { name: "Confirmer la commande", exact: true }).click();
      const result = await response;
      assert.equal(result.status(), expectedStatus, await result.text());
      if (expectedStatus === 201) await page.getByRole("button", { name: "Confirmer la commande", exact: true }).waitFor({ state: "detached" });
    };
    assert.equal((await fetch(`${origin}/api/crm/products/Adaptateur/variants`)).status, 401);
    await login("orders@example.test");
    const standardId = await create("Adaptateur");
    assert.equal(getOrder(standardId).items[0].variant_id, "adapter-standard");
    assert.equal(availableFor("adapter-standard"), 10, "Opening forms and creation never reserve stock");

    // Current settings change; existing edit preview must use the order's saved 47/650 rules.
    updateStoreSettings({ shippingFeeMad: 83, freeShippingThresholdMad: 1000 });
    await page.reload();
    await page.getByRole("button", { name: "Modifier la commande", exact: true }).click();
    const editor = page.locator("#order-editor");
    assert.equal(await page.getByRole("button", { name: "Confirmer la commande", exact: true }).count(), 0);
    await editor.getByLabel("Quantité de l’article 1", { exact: true }).fill("2");
    assert.match(await editor.locator("dl").innerText(), /647/);
    await editor.getByLabel("Rechercher un produit", { exact: true }).fill("500 ml");
    await choose("Article à ajouter", /Serum.*500 ml/);
    await editor.getByRole("button", { name: "Ajouter", exact: true }).click();
    await editor.getByLabel("Pourcentage", { exact: true }).check();
    await editor.getByLabel("Remise (%)", { exact: true }).fill("10");
    await editor.getByLabel(/Payante/).check();
    await choose("Variante de l’article 1", /Serum.*500 ml/);
    await editor.getByRole("button", { name: "Retirer l’article 2", exact: true }).click();
    assert.match(await editor.locator("dl").innerText(), /317/);
    await editor.getByLabel("Motif de modification", { exact: true }).fill("Changement demandé par le client");
    await mobileFits();
    await editor.getByRole("button", { name: "Enregistrer la commande", exact: true }).click();
    await page.getByRole("heading", { name: "Historique des modifications", exact: true }).waitFor();
    assert.equal(getOrder(standardId).total, 317);
    assert.equal(getOrder(standardId).items[0].variant_id, "serum-500");
    assert.equal(listOrderEdits(standardId)[0].actorName, "Agent test");
    await page.getByText(/Voir les changements/).click();
    assert.match(await page.locator("details").innerText(), /Standard/);
    assert.match(await page.locator("details").innerText(), /500 ml/);

    // Open a stale editor, commit independently, then submit the stale revision.
    await page.getByRole("button", { name: "Modifier la commande", exact: true }).click();
    const revision = getOrderEditState(standardId).revision;
    const editBody = { revision, lines: [{ variantId: "serum-500", qty: 2 }], discountType: "none", discountValue: 0, shippingMode: "free", reason: "Autre session" };
    assert.equal((await post(`/api/crm/orders/${standardId}/edit`, editBody)).status(), 200);
    await editor.getByLabel("Motif de modification", { exact: true }).fill("Édition périmée");
    await editor.getByRole("button", { name: "Enregistrer la commande", exact: true }).click();
    await editor.getByRole("alert").filter({ hasText: /changé/ }).waitFor();
    await editor.getByRole("button", { name: "Recharger la commande", exact: true }).click();
    await page.getByText("Autre session", { exact: true }).waitFor();
    assert.equal(listOrderEdits(standardId).length, 2);

    // Real callback/contact UI remains available before confirmation.
    await page.getByRole("button", { name: "Programmer un rappel", exact: true }).click();
    await page.getByRole("button", { name: "Dans 1 h", exact: true }).click();
    await page.getByRole("button", { name: "Programmer le rappel", exact: true }).click();
    await page.getByText(/Rappel prévu le/).waitFor();
    assert.equal(getOrder(standardId).confirmationStatus, "call_back_later");
    await confirm(standardId);
    assert.equal(getOrder(standardId).confirmationStatus, "confirmed");
    assert.equal(availableFor("serum-500"), 8);

    updateStoreSettings({ shippingFeeMad: 47, freeShippingThresholdMad: 650 });
    const nonSizeId = await create("Serum", /250 ml/);
    await confirm(nonSizeId);
    assert.equal(getOrder(nonSizeId).items[0].options[0].value, "250 ml");
    const twoAxisId = await create("Lampe", /USB-C/);
    await choose("Variante à confirmer de l’article 1", /Solaire/);
    assert.equal(getOrder(twoAxisId).items[0].variant_id, "lamp-usb", "Selecting a replacement remains a local draft");
    await confirm(twoAxisId);
    assert.equal(getOrder(twoAxisId).items[0].variant_id, "lamp-solar");
    assert.equal(availableFor("lamp-usb"), 10);
    assert.equal(availableFor("lamp-solar"), 9);

    const cancelledId = await create("Adaptateur");
    await page.getByLabel("Motif d’annulation", { exact: true }).fill("Annulation demandée");
    await page.getByRole("button", { name: "Annuler la commande", exact: true }).click();
    await page.getByRole("button", { name: "Confirmer la commande", exact: true }).waitFor({ state: "detached" });
    assert.equal(getOrder(cancelledId).confirmationStatus, "cancelled");
    await page.locator("#contact-note").fill("Note après annulation");
    await page.getByRole("button", { name: "Enregistrer la note", exact: true }).click();
    await page.getByText("Note après annulation", { exact: true }).waitFor();
    assert.equal(getOrder(cancelledId).confirmationStatus, "cancelled");

    // Stock changed after the form loaded: server conflict stays visible, no partial reservation.
    const shortageId = await create("Adaptateur");
    const { adjustStock } = loadSource("@/lib/services/inventory");
    adjustStock("adapter-standard", { physicalDelta: -10 }, "Rupture test", "test", "browser-shortage");
    await confirm(shortageId, 409);
    await page.getByRole("alert").filter({ hasText: /Stock insuffisant/ }).waitFor();
    assert.equal(getOrder(shortageId).confirmationStatus, "new");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reservations WHERE order_id = ?").get(shortageId).n, 0);

    // Fresh stock for the pending-offer/default confirmation; confirmation closes it atomically.
    adjustStock("adapter-standard", { physicalDelta: 10 }, "Réception test", "test", "browser-restock");
    await page.goto(`${origin}/crm/orders/pending-offer`);
    await confirm("pending-offer");
    assert.equal(getOrder("pending-offer").upsellStatus, "closed");
    assert.equal((await post(`/api/crm/orders/${standardId}/edit`, { ...editBody, revision: getOrderEditState(standardId).revision })).status(), 409);
    const adminId = db.prepare("SELECT id FROM users WHERE email = 'admin@example.test'").get().id;
    assert.equal((await post(`/api/crm/orders/${cancelledId}/assign`, { agentId: adminId })).status(), 403);
    assert.equal((await post("/api/crm/orders/lifecycle", { ids: [cancelledId], action: "delete" })).status(), 403);
    assert.equal((await post(`/api/crm/orders/${cancelledId}/cancel`, { reason: "Origine incorrecte" }, "https://untrusted.example")).status(), 403);

    // Archive and catalog renaming do not replace historical snapshots in detail/history/list.
    assert.equal((await post("/api/crm/orders/lifecycle", { ids: [standardId], action: "archive" })).status(), 200);
    db.prepare("UPDATE products SET name = 'Catalogue renommé' WHERE id = 'Serum'").run();
    db.prepare("UPDATE variants SET active = 0, label = 'Modifié' WHERE id = 'serum-500'").run();
    await page.goto(`${origin}/crm/orders/${standardId}`);
    assert.match(await page.locator("main").innerText(), /Serum/);
    assert.match(await page.locator("main").innerText(), /500 ml/);
    await page.goto(`${origin}/crm/orders?archived=1&status=all&q=${standardId}`);
    assert.match(await page.locator("table").innerText(), /Serum.*500 ml/s);
    assert.equal((await post("/api/crm/orders/lifecycle", { ids: [standardId], action: "restore" })).status(), 200);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/crm/orders/${standardId}`);
    await mobileFits();
    assert.deepEqual(errors, []);
    console.log("Verified: manual create, generic IDs/options, settings snapshots, edit/history/revision, callbacks, confirm/replacement/shortages, cancel/terminal contacts, archive/list, agent/origin guards; mobile + desktop.");
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
